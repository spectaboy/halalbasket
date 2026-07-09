// create-order-payment
//
// Customer's client invokes this for an order in status='pending_payment'.
// Server is the sole authority on amount: it charges orders.total (snapshotted
// at order creation); the client cannot pass a price.
//
// Body: { orderId }
//
// Flow:
//   1. Auth (Clerk JWT) -> resolve customer user id.
//   2. Read order; assert caller is the customer and status='pending_payment'.
//   3. Find-or-create Stripe customer by email (idempotent); persist
//      users.stripe_customer_id.
//   4. Create PaymentIntent amount=round(total*100) CAD, capture automatic,
//      automatic_payment_methods, idempotencyKey `order:<orderId>:create_pi`,
//      metadata { order_id }.
//   5. Persist PI id on the order, guarded on status='pending_payment' so a
//      concurrent cancel cannot orphan the intent.
//   6. Return { clientSecret, ephemeralKey, customerId } for PaymentSheet.
//
// On PaymentSheet success the client invokes confirm-order-payment.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@13.10.0?target=deno";
import {
  corsHeaders, jsonResponse, requireAuth, serviceClient,
  resolveUserIdFromClerk, idemKey,
} from "../_shared/edge.ts";
import { enforceRateLimit } from "../_shared/ratelimit.ts";

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

  // Rate limit money creation per caller (fail-open on limiter outage).
  if (!(await enforceRateLimit(supabase, `create-order-payment:${callerClerkId}`, 10, 60))) {
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
      .select("id, customer_id, seller_id, status, total, payment_intent_id")
      .eq("id", orderId)
      .single();
    if (oErr || !order) return jsonResponse({ error: "order_not_found" }, 404);

    if (order.customer_id !== customerUserId) {
      return jsonResponse({ error: "not_authorized" }, 403);
    }
    if (order.status !== "pending_payment") {
      return jsonResponse({ error: "order_not_pending_payment", details: order.status }, 409);
    }

    const amountCents = Math.round(Number(order.total) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return jsonResponse({ error: "invalid_amount" }, 409);
    }

    const { data: user, error: uErr } = await supabase
      .from("users")
      .select("id, email, first_name, last_name, clerk_id, stripe_customer_id")
      .eq("id", customerUserId)
      .single();
    if (uErr || !user || !user.email) {
      return jsonResponse({ error: "user_email_missing" }, 400);
    }

    // Retry-safe: if a PaymentIntent is already attached to this order, REUSE
    // it. Re-creating under the order-scoped idempotency key with different
    // params (e.g. a customer created twice under a race) throws Stripe's
    // "same parameters" error and wedges checkout. Reusing avoids both the
    // idempotency collision and duplicate intents.
    if (order.payment_intent_id) {
      try {
        const existing = await stripe.paymentIntents.retrieve(order.payment_intent_id);
        const reusable = ["requires_payment_method", "requires_confirmation", "requires_action", "processing"]
          .includes(existing.status);
        if (reusable && existing.amount === amountCents) {
          const cid = typeof existing.customer === "string"
            ? existing.customer
            : (existing.customer as { id?: string } | null)?.id;
          const ek = cid
            ? await stripe.ephemeralKeys.create({ customer: cid }, { apiVersion: "2023-10-16" })
            : null;
          return jsonResponse({
            success: true,
            clientSecret: existing.client_secret,
            paymentIntentId: existing.id,
            ephemeralKey: ek?.secret ?? null,
            customerId: cid ?? null,
          });
        }
        // Not reusable (canceled/succeeded/amount drift) — fall through.
      } catch (_e) {
        // Retrieve failed — fall through to create a fresh PI.
      }
    }

    // Find or create the Stripe customer. Prefer the persisted id; otherwise
    // look up by email; otherwise create idempotently on the user id so two
    // concurrent first-time calls cannot spawn two customers.
    let customerId: string | null = user.stripe_customer_id ?? null;
    if (!customerId) {
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      } else {
        const created = await stripe.customers.create({
          email: user.email,
          name: `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || user.email,
          metadata: { clerk_id: user.clerk_id ?? "", user_id: user.id },
        }, {
          idempotencyKey: idemKey("cust", user.id),
        });
        customerId = created.id;
      }
      // Persist for next time (best-effort).
      const { error: custErr } = await supabase
        .from("users")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
      if (custErr) console.warn("create-order-payment: persist stripe_customer_id failed:", custErr.message);
    }

    const pi = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "cad",
      customer: customerId,
      capture_method: "automatic",
      automatic_payment_methods: { enabled: true },
      metadata: { order_id: order.id },
    }, {
      idempotencyKey: `order:${orderId}:create_pi`,
    });

    // Persist PI id; guard on status so a concurrent cancel cannot orphan it.
    const { data: attachRows, error: attachErr } = await supabase
      .from("orders")
      .update({ payment_intent_id: pi.id })
      .eq("id", order.id)
      .eq("status", "pending_payment")
      .select("id");

    if (attachErr || !Array.isArray(attachRows) || attachRows.length !== 1) {
      // Race: order moved on. Cancel the PI so it doesn't leak.
      try {
        await stripe.paymentIntents.cancel(pi.id, {
          idempotencyKey: idemKey("order", order.id, "cancel_after_attach_fail"),
        } as Stripe.RequestOptions);
      } catch (cancelErr) {
        console.error("create-order-payment: failed to cancel orphan PI:", cancelErr);
      }
      return jsonResponse({ error: "order_not_pending_payment" }, 409);
    }

    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: "2023-10-16" },
    );

    return jsonResponse({
      success: true,
      clientSecret: pi.client_secret,
      paymentIntentId: pi.id,
      ephemeralKey: ephemeralKey.secret,
      customerId,
    });
  } catch (e) {
    const err = e as { message?: string; type?: string; name?: string; stack?: string };
    console.error("create-order-payment fatal:", err?.message, err?.stack);
    return jsonResponse({
      error: "internal_error",
      message: String(err?.message ?? e),
      type: err?.type ?? err?.name ?? null,
    }, 500);
  }
});
