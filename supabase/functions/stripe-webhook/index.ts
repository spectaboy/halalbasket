// stripe-webhook
//
// Server-authoritative payment finalization backstop. The client confirms the
// order after the PaymentSheet succeeds, but if the app dies post-capture (or
// a concurrent cancel races), money is captured with no paid order. Stripe
// retries this webhook until 2xx, so it's the durable backstop:
//   payment_intent.succeeded -> finalize the pending_payment order (idempotent
//   via finalizeOrderPaid), or auto-refund if the order is already dead.
//
// OPERATOR SETUP (required for this to run):
//   1) Set the STRIPE_WEBHOOK_SECRET function secret to the signing secret
//      from Stripe Dashboard -> Developers -> Webhooks ("whsec_...").
//   2) Add an endpoint https://<PROJECT_REF>.functions.supabase.co/stripe-webhook
//      subscribed to payment_intent.succeeded.
//   3) Deploy with --no-verify-jwt (Stripe cannot send a Supabase JWT).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@13.10.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  finalizeOrderPaid, ORDER_MONEY_COLUMNS, OrderMoneyRow, PAID_OR_LATER,
} from "../_shared/payments.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();
  if (!sig || !WEBHOOK_SECRET) {
    console.error("stripe-webhook: missing signature or STRIPE_WEBHOOK_SECRET");
    return new Response("Webhook not configured", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, WEBHOOK_SECRET, undefined, cryptoProvider);
  } catch (e) {
    console.error("stripe-webhook signature verification failed:", (e as Error).message);
    return new Response("Bad signature", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object as Stripe.PaymentIntent;
      const orderId = (pi.metadata?.order_id as string | undefined) ?? null;

      // Locate the order: metadata first, PI-id column as fallback.
      let order: OrderMoneyRow | null = null;
      if (orderId) {
        const { data } = await supabase
          .from("orders")
          .select(ORDER_MONEY_COLUMNS)
          .eq("id", orderId)
          .maybeSingle();
        order = (data as unknown as OrderMoneyRow) ?? null;
      }
      if (!order) {
        const { data } = await supabase
          .from("orders")
          .select(ORDER_MONEY_COLUMNS)
          .eq("payment_intent_id", pi.id)
          .maybeSingle();
        order = (data as unknown as OrderMoneyRow) ?? null;
      }

      const refundIdempotently = async (why: string) => {
        // Idempotent: `wh_refund_<piId>` is shared with confirm-order-payment's
        // dead-order path, so the two recovery paths dedupe to a single refund.
        try {
          await stripe.refunds.create(
            { payment_intent: pi.id },
            { idempotencyKey: `wh_refund_${pi.id}` },
          );
          console.log(`stripe-webhook refunded PI ${pi.id} (${why})`);
        } catch (e) {
          console.error(`stripe-webhook refund failed (${why})`, pi.id, (e as Error).message);
        }
      };

      if (!order) {
        // Captured but no order exists — refund so the customer is never
        // charged for food they'll never get.
        await refundIdempotently("orphan_pi");
      } else if (order.status === "pending_payment") {
        // The normal backstop: finalize exactly like confirm-order-payment.
        const outcome = await finalizeOrderPaid(supabase, order, pi.id);
        if (outcome === "order_not_payable") {
          await refundIdempotently("cancelled_during_finalize");
        } else {
          console.log(`stripe-webhook finalized order ${order.id} (${outcome})`);
        }
      } else if (!PAID_OR_LATER.includes(order.status)) {
        // Order is terminal (cancelled/refunded) but the PI captured anyway —
        // auto-refund and mark the order's payment as refunded.
        await refundIdempotently(`terminal_order_${order.status}`);
        const { error } = await supabase
          .from("orders")
          .update({ payment_status: "refunded" })
          .eq("id", order.id)
          .in("status", ["cancelled", "refunded"]);
        if (error) console.warn("stripe-webhook: mark refunded failed:", error.message);
      }
      // else: order already paid or later — money legitimately captured, no-op.
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    // Non-2xx makes Stripe retry — exactly what we want on transient failure.
    console.error("stripe-webhook handler error:", (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
  }
});
