// payout-order
//
// Settles the marketplace split for one DELIVERED order:
//   seller leg: seller_amount (subtotal - commission) -> seller's Connect acct
//   driver leg: driver_amount (delivery fee)          -> driver's Connect acct
// via the shared settleOrderPayouts engine (_shared/payouts.ts). Stripe
// idempotency keys `payout_seller_<orderId>` / `payout_driver_<orderId>` are
// shared with retry-payouts so a leg can never be paid twice.
//
// Auth: service-role bearer (DB webhook / ops script) OR an admin user's
// Clerk JWT. Body: { orderId }.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@13.10.0?target=deno";
import { corsHeaders, jsonResponse, serviceClient, verifyClerkToken } from "../_shared/edge.ts";
import { settleOrderPayouts } from "../_shared/payouts.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
});

const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
if (!SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = serviceClient();

  // ── Auth: service role OR admin user ────────────────────────────────────
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  const token = authHeader.replace("Bearer ", "");

  let authorized = token === SERVICE_ROLE_KEY;
  if (!authorized) {
    try {
      const clerkId = await verifyClerkToken(token);
      const { data: caller } = await supabase
        .from("users")
        .select("id, is_admin")
        .eq("clerk_id", clerkId)
        .single();
      authorized = caller?.is_admin === true;
    } catch (_e) {
      authorized = false;
    }
  }
  if (!authorized) {
    return jsonResponse({ error: "service_role_or_admin_required" }, 403);
  }

  try {
    let body: { orderId?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "invalid_json" }, 400);
    }
    const { orderId } = body;
    if (!orderId) return jsonResponse({ error: "missing_orderId" }, 400);

    const result = await settleOrderPayouts(supabase, stripe, orderId);

    // Map "nothing to do here" outcomes to useful HTTP statuses.
    if (result.seller.outcome === "order_not_found") {
      return jsonResponse({ error: "order_not_found" }, 404);
    }
    if (result.seller.outcome === "order_not_delivered") {
      return jsonResponse({ error: "order_not_delivered" }, 409);
    }
    if (result.seller.outcome === "payment_row_missing") {
      return jsonResponse({ error: "payment_row_missing" }, 409);
    }

    return jsonResponse({ success: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("payout-order fatal:", msg);
    return jsonResponse({ error: "internal_error", details: msg }, 500);
  }
});
