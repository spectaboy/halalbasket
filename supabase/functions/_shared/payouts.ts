// _shared/payouts.ts
//
// settleOrderPayouts: shared payout engine used by payout-order (on-demand)
// and retry-payouts (cron). Both paths use the SAME Stripe idempotency keys
//   seller: `payout_seller_<orderId>`
//   driver: `payout_driver_<orderId>`
// so a payout can NEVER be doubled even if both fire concurrently.
//
// Rules (spec section 9):
//   * only for a DELIVERED order that has a payments split-snapshot row
//   * seller leg: seller_amount (subtotal - commission) -> seller-user's
//     Connect account. seller_amount <= 0 (100% commission edge case)
//     => 'not_applicable'.
//   * driver leg: driver_amount (delivery fee) -> driver-user's Connect account.
//   * missing / payouts-disabled Connect account => leave the leg 'pending'
//     (retryable by cron); a Stripe transfer error => 'failed' (also retryable).

import Stripe from "https://esm.sh/stripe@13.10.0?target=deno";
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { notifyUser } from "./notify.ts";

export interface PayoutLegResult {
  leg: "seller" | "driver";
  outcome:
    | "paid" | "already_completed" | "not_applicable"
    | "account_not_ready" | "no_driver_assigned" | "transfer_failed"
    | "order_not_found" | "order_not_delivered" | "payment_row_missing";
  transferId?: string;
  amount?: number;
  detail?: string;
}

export interface SettleResult {
  orderId: string;
  seller: PayoutLegResult;
  driver: PayoutLegResult;
}

interface PaymentRow {
  order_id: string;
  seller_amount: number;
  driver_amount: number;
  seller_payout_status: string;
  driver_payout_status: string;
  stripe_seller_transfer_id: string | null;
  stripe_driver_transfer_id: string | null;
}

async function isPayoutReady(stripe: Stripe, accountId: string): Promise<boolean> {
  try {
    const account = await stripe.accounts.retrieve(accountId);
    return account.payouts_enabled === true;
  } catch (e) {
    // Un-retrievable account = not payout-ready; leave the leg retryable.
    console.error(`payouts: failed to retrieve Connect account ${accountId}:`, e);
    return false;
  }
}

async function settleLeg(
  supabase: SupabaseClient,
  stripe: Stripe,
  orderId: string,
  leg: "seller" | "driver",
  amount: number,
  recipientUserId: string | null,
): Promise<PayoutLegResult> {
  const statusCol = `${leg}_payout_status`;
  const transferCol = `stripe_${leg}_transfer_id`;

  if (amount <= 0) {
    // Nothing owed on this leg (e.g. home-cook 0-commission never hits this;
    // this is the seller_amount<=0 / free-delivery edge). Terminal state.
    await supabase.from("payments")
      .update({ [statusCol]: "not_applicable" })
      .eq("order_id", orderId);
    return { leg, outcome: "not_applicable", amount };
  }

  if (leg === "driver" && !recipientUserId) {
    // Delivered without a driver on record shouldn't happen — leave pending
    // so the cron retries once the data is corrected.
    return { leg, outcome: "no_driver_assigned", amount };
  }

  // Resolve the recipient's Connect account.
  let stripeAccountId: string | null = null;
  if (recipientUserId) {
    const { data: user } = await supabase
      .from("users")
      .select("id, stripe_account_id")
      .eq("id", recipientUserId)
      .single();
    stripeAccountId = user?.stripe_account_id ?? null;
  }

  if (!stripeAccountId || !(await isPayoutReady(stripe, stripeAccountId))) {
    // Keep the REAL owed amount queued — never zero it, never mark failed
    // for a setup problem. 'pending' = retryable once onboarding completes.
    await supabase.from("payments")
      .update({ [statusCol]: "pending" })
      .eq("order_id", orderId);
    console.error(
      `PAYOUT NOT SETTLED (${leg}) for order ${orderId}: owed $${amount} but ` +
      (stripeAccountId
        ? `Connect account ${stripeAccountId} has payouts disabled.`
        : "recipient has no Connect account.") +
      " Left 'pending' for retry.",
    );
    return { leg, outcome: "account_not_ready", amount };
  }

  try {
    const transfer = await stripe.transfers.create(
      {
        amount: Math.round(amount * 100),
        currency: "cad",
        destination: stripeAccountId,
        metadata: { order_id: orderId, leg, platform: "halalbasket" },
      },
      { idempotencyKey: `payout_${leg}_${orderId}` },
    );

    await supabase.from("payments")
      .update({ [statusCol]: "completed", [transferCol]: transfer.id })
      .eq("order_id", orderId);

    // Best-effort payout notification.
    if (recipientUserId) {
      try {
        await notifyUser(supabase, recipientUserId, {
          type: "payout_received",
          title: "Payout sent",
          body: `$${amount.toFixed(2)} transferred to your bank.`,
          data: { orderId, amount, transferId: transfer.id, leg },
        });
      } catch (e) {
        console.warn("payout notify failed (non-fatal):", e);
      }
    }

    return { leg, outcome: "paid", transferId: transfer.id, amount };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error(`payouts: ${leg} transfer failed for order ${orderId}:`, detail);
    await supabase.from("payments")
      .update({ [statusCol]: "failed" })
      .eq("order_id", orderId);
    return { leg, outcome: "transfer_failed", amount, detail };
  }
}

export async function settleOrderPayouts(
  supabase: SupabaseClient,
  stripe: Stripe,
  orderId: string,
): Promise<SettleResult> {
  const notFound = (why: PayoutLegResult["outcome"]): SettleResult => ({
    orderId,
    seller: { leg: "seller", outcome: why },
    driver: { leg: "driver", outcome: why },
  });

  const { data: order } = await supabase
    .from("orders")
    .select("id, status, seller_id, driver_id")
    .eq("id", orderId)
    .single();
  if (!order) return notFound("order_not_found");
  if (order.status !== "delivered") return notFound("order_not_delivered");

  const { data: payment } = await supabase
    .from("payments")
    .select("order_id, seller_amount, driver_amount, seller_payout_status, driver_payout_status, stripe_seller_transfer_id, stripe_driver_transfer_id")
    .eq("order_id", orderId)
    .single();
  if (!payment) return notFound("payment_row_missing");
  const p = payment as PaymentRow;

  // ── Seller leg ──────────────────────────────────────────────────────────
  let seller: PayoutLegResult;
  if (p.seller_payout_status === "completed") {
    seller = { leg: "seller", outcome: "already_completed", transferId: p.stripe_seller_transfer_id ?? undefined };
  } else if (p.seller_payout_status === "not_applicable") {
    seller = { leg: "seller", outcome: "not_applicable" };
  } else {
    const { data: sellerRow } = await supabase
      .from("sellers")
      .select("user_id")
      .eq("id", order.seller_id)
      .single();
    seller = await settleLeg(
      supabase, stripe, orderId, "seller",
      Number(p.seller_amount) || 0,
      sellerRow?.user_id ?? null,
    );
  }

  // ── Driver leg ──────────────────────────────────────────────────────────
  let driver: PayoutLegResult;
  if (p.driver_payout_status === "completed") {
    driver = { leg: "driver", outcome: "already_completed", transferId: p.stripe_driver_transfer_id ?? undefined };
  } else if (p.driver_payout_status === "not_applicable") {
    driver = { leg: "driver", outcome: "not_applicable" };
  } else {
    let driverUserId: string | null = null;
    if (order.driver_id) {
      const { data: driverRow } = await supabase
        .from("drivers")
        .select("user_id")
        .eq("id", order.driver_id)
        .single();
      driverUserId = driverRow?.user_id ?? null;
    }
    driver = await settleLeg(
      supabase, stripe, orderId, "driver",
      Number(p.driver_amount) || 0,
      driverUserId,
    );
  }

  return { orderId, seller, driver };
}
