// retry-payouts
//
// Cron worker that settles payouts that were queued but never paid. A payout
// leg stays 'pending' when the recipient's Connect account is missing or has
// payouts disabled, and goes 'failed' on a Stripe transfer error. Nothing
// else retries these, so a seller/driver who finishes Stripe onboarding after
// delivery would otherwise be silently unpaid forever.
//
// Scans payments WHERE seller_payout_status OR driver_payout_status IN
// ('pending','failed') and the order is delivered, then re-runs the shared
// settleOrderPayouts engine — SAME idempotency keys
// (`payout_seller_<orderId>` / `payout_driver_<orderId>`) as payout-order,
// so a leg can NEVER be doubled even if both fire.
//
// Safe to run on a cron. Auth: service_role only. Deploy with --no-verify-jwt
// and schedule via pg_cron + pg_net (see docs/BACKEND_SETUP.md).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@13.10.0?target=deno";
import { corsHeaders, jsonResponse, serviceClient } from "../_shared/edge.ts";
import { settleOrderPayouts, SettleResult } from "../_shared/payouts.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
});

const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
if (!SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return jsonResponse({ error: "service_role_required" }, 403);
  }

  const supabase = serviceClient();

  // Stranded payout rows: any leg still pending/failed.
  const { data: stranded, error: scanErr } = await supabase
    .from("payments")
    .select("order_id, seller_payout_status, driver_payout_status")
    .or(
      "seller_payout_status.in.(pending,failed)," +
      "driver_payout_status.in.(pending,failed)",
    )
    .limit(100);
  if (scanErr) return jsonResponse({ error: "scan_failed", details: scanErr.message }, 500);

  const results: Array<SettleResult | { orderId: string; outcome: string }> = [];

  for (const row of stranded ?? []) {
    const orderId = (row as { order_id: string }).order_id;
    try {
      // Only pay for genuinely delivered orders; settleOrderPayouts re-checks
      // this too, but skipping early keeps the cron log readable.
      const { data: order } = await supabase
        .from("orders")
        .select("id, status")
        .eq("id", orderId)
        .single();
      if (!order || order.status !== "delivered") {
        results.push({ orderId, outcome: "order_not_delivered" });
        continue;
      }

      results.push(await settleOrderPayouts(supabase, stripe, orderId));
    } catch (e) {
      console.error(`retry-payouts failed for order ${orderId}:`, e);
      results.push({ orderId, outcome: "error" });
    }
  }

  return jsonResponse({ success: true, scanned: (stranded ?? []).length, results });
});
