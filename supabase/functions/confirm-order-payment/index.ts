// confirm-order-payment
//
// Called by the customer's client after the PaymentSheet reports success.
// Verifies the PaymentIntent with Stripe, then finalizes via the shared
// finalizeOrderPaid helper (guarded pending_payment -> paid flip, payments
// split row, seller 'new_order' notification). Idempotent — converges with
// the stripe-webhook backstop.
//
// Body: { orderId }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@13.10.0?target=deno";
import {
  corsHeaders, jsonResponse, requireAuth, serviceClient,
  resolveUserIdFromClerk,
} from "../_shared/edge.ts";
import { enforceRateLimit } from "../_shared/ratelimit.ts";
import {
  finalizeOrderPaid, ORDER_MONEY_COLUMNS, OrderMoneyRow, PAID_OR_LATER,
} from "../_shared/payments.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let callerClerkId: string;
  try {
    ({ callerClerkId } = await requireAuth(req));
  } catch (resp) {
    return resp as Response;
  }

  const supabase = serviceClient();

  // Rate limit payment finalization per caller (fail-open on limiter outage).
  if (!(await enforceRateLimit(supabase, `confirm-order-payment:${callerClerkId}`, 20, 60))) {
    return jsonResponse({ error: "rate_limited" }, 429);
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

    const customerUserId = await resolveUserIdFromClerk(supabase, callerClerkId);
    if (!customerUserId) return jsonResponse({ error: "user_not_found" }, 404);

    const { data: order, error: oErr } = await supabase
      .from("orders")
      .select(ORDER_MONEY_COLUMNS)
      .eq("id", orderId)
      .single();
    if (oErr || !order) return jsonResponse({ error: "order_not_found" }, 404);
    const o = order as unknown as OrderMoneyRow;

    if (o.customer_id !== customerUserId) {
      return jsonResponse({ error: "not_authorized" }, 403);
    }

    // Idempotent fast-path: already finalized (client retry / webhook won).
    if (PAID_OR_LATER.includes(o.status)) {
      return jsonResponse({ success: true, orderId, status: o.status, alreadyFinalized: true });
    }

    if (!o.payment_intent_id) {
      return jsonResponse({ error: "no_payment_intent" }, 409);
    }

    // Verify PI status with Stripe — server-authoritative, never trust client.
    let pi: Stripe.PaymentIntent;
    try {
      pi = await stripe.paymentIntents.retrieve(o.payment_intent_id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return jsonResponse({ error: "stripe_retrieve_failed", details: msg }, 502);
    }

    if (pi.status !== "succeeded") {
      return jsonResponse({
        error: "payment_not_succeeded",
        details: pi.status,
        paymentIntentStatus: pi.status,
      }, 409);
    }

    // Order went terminal (cancelled/refunded) while the customer was paying.
    // Money is captured, so refund rather than finalize onto a dead order.
    // Same idempotency key as stripe-webhook so both recovery paths dedupe
    // to a single refund.
    if (o.status === "cancelled" || o.status === "refunded") {
      try {
        await stripe.refunds.create(
          { payment_intent: pi.id },
          { idempotencyKey: `wh_refund_${pi.id}` } as Stripe.RequestOptions,
        );
        await supabase.from("orders")
          .update({ payment_status: "refunded" })
          .eq("id", o.id)
          .eq("status", "cancelled");
      } catch (e) {
        console.error("confirm-order-payment: refund into dead order failed", pi.id, (e as Error).message);
      }
      return jsonResponse({ error: "order_unavailable", details: o.status }, 409);
    }

    const outcome = await finalizeOrderPaid(supabase, o, pi.id);
    if (outcome === "order_not_payable") {
      // Cancelled between our read and the flip — refund (idempotent).
      try {
        await stripe.refunds.create(
          { payment_intent: pi.id },
          { idempotencyKey: `wh_refund_${pi.id}` } as Stripe.RequestOptions,
        );
      } catch (e) {
        console.error("confirm-order-payment: race refund failed", pi.id, (e as Error).message);
      }
      return jsonResponse({ error: "order_unavailable" }, 409);
    }

    return jsonResponse({ success: true, orderId, status: "paid", outcome });
  } catch (e) {
    // PI may be captured but the DB write failed — the stripe-webhook backstop
    // re-runs finalizeOrderPaid until it converges, so just surface the error.
    const msg = e instanceof Error ? e.message : String(e);
    console.error("confirm-order-payment fatal:", msg);
    return jsonResponse({ error: "internal_error", details: msg }, 500);
  }
});
