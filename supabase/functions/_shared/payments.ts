// _shared/payments.ts
//
// finalizeOrderPaid: single idempotent finalizer shared by
// confirm-order-payment (client path) and stripe-webhook (backstop path).
//
//   1. Guarded flip: orders.status 'pending_payment' -> 'paid'
//      (+ payment_status 'captured'). The .eq("status","pending_payment")
//      guard makes concurrent confirm/webhook calls converge: exactly one
//      wins the flip, the other observes an already-paid order.
//   2. Insert the payments split-snapshot row if it doesn't exist
//      (order_id is UNIQUE; ignoreDuplicates upsert = idempotent).
//   3. Notify the seller's user (type 'new_order') — only on the winning
//      flip so the seller is never pinged twice. Notify is best-effort.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { notifyUser } from "./notify.ts";

export type FinalizeOutcome =
  | "finalized"        // this call flipped pending_payment -> paid
  | "already_paid"     // someone else already finalized (idempotent success)
  | "order_not_payable"; // order is cancelled/refunded — caller decides (refund)

export interface OrderMoneyRow {
  id: string;
  customer_id: string;
  seller_id: string;
  driver_id: string | null;
  status: string;
  payment_status: string;
  subtotal: number;
  delivery_fee: number;
  service_fee: number;
  tax: number;
  total: number;
  commission_amount: number;
  payment_intent_id: string | null;
}

export const ORDER_MONEY_COLUMNS =
  "id, customer_id, seller_id, driver_id, status, payment_status, subtotal, " +
  "delivery_fee, service_fee, tax, total, commission_amount, payment_intent_id";

// Statuses at/after 'paid' — money legitimately captured, never refund here.
export const PAID_OR_LATER = [
  "paid", "accepted", "preparing", "ready",
  "driver_assigned", "picked_up", "en_route", "delivered",
];

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function finalizeOrderPaid(
  supabase: SupabaseClient,
  order: OrderMoneyRow,
  paymentIntentId: string,
): Promise<FinalizeOutcome> {
  // 1. Guarded, idempotent status flip.
  const { data: flippedRows, error: flipErr } = await supabase
    .from("orders")
    .update({
      status: "paid",
      payment_status: "captured",
      payment_intent_id: paymentIntentId,
    })
    .eq("id", order.id)
    .eq("status", "pending_payment")
    .select("id");
  if (flipErr) throw new Error(`order_flip_failed: ${flipErr.message}`);
  const wonFlip = Array.isArray(flippedRows) && flippedRows.length === 1;

  if (!wonFlip) {
    // Order already moved on — re-read to decide whether that's fine.
    const { data: fresh } = await supabase
      .from("orders")
      .select("status")
      .eq("id", order.id)
      .single();
    if (!fresh || !PAID_OR_LATER.includes(fresh.status)) {
      return "order_not_payable"; // cancelled/refunded while paying
    }
  }

  // 2. Split snapshot (idempotent on the payments.order_id unique key).
  //    seller gets subtotal - commission; driver gets the delivery fee;
  //    platform keeps commission + service fee (+ handles tax remittance).
  const sellerAmount = round2(Number(order.subtotal) - Number(order.commission_amount));
  const { error: payErr } = await supabase
    .from("payments")
    .upsert({
      order_id: order.id,
      stripe_payment_intent_id: paymentIntentId,
      amount_total: Number(order.total),
      seller_amount: sellerAmount,
      commission_amount: Number(order.commission_amount),
      delivery_fee: Number(order.delivery_fee),
      service_fee: Number(order.service_fee),
      driver_amount: Number(order.delivery_fee),
      seller_payout_status: "pending",
      driver_payout_status: "pending",
    }, { onConflict: "order_id", ignoreDuplicates: true });
  if (payErr) throw new Error(`payments_insert_failed: ${payErr.message}`);

  // 3. Tell the seller — once, on the winning flip only. Best-effort.
  if (wonFlip) {
    try {
      const { data: seller } = await supabase
        .from("sellers")
        .select("user_id")
        .eq("id", order.seller_id)
        .single();
      if (seller?.user_id) {
        await notifyUser(supabase, seller.user_id, {
          type: "new_order",
          title: "New order!",
          body: "You have a new paid order. Tap to review and accept it.",
          data: { orderId: order.id },
        });
      }
    } catch (e) {
      console.warn("finalizeOrderPaid: seller notify failed (non-fatal):", e);
    }
  }

  return wonFlip ? "finalized" : "already_paid";
}
