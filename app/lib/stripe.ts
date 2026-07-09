// app/lib/stripe.ts
//
// Client helpers for the HalalBasket order payment flow.
//
//   1. createOrderPaymentSession(orderId)  — server creates/reuses the
//      PaymentIntent for the order (server-authoritative amount) and returns
//      what @stripe/stripe-react-native's initPaymentSheet needs.
//   2. <present PaymentSheet>
//   3. confirmOrderPayment(orderId)        — server verifies the PI with
//      Stripe and flips the order pending_payment -> paid (idempotent; the
//      stripe-webhook backstop converges if the app dies mid-flow).

import { supabase } from '../config/supabase';

export interface OrderPaymentSession {
  clientSecret: string;
  ephemeralKey: string | null;
  customerId: string;
  paymentIntentId?: string;
}

export interface ConfirmOrderPaymentResult {
  success: boolean;
  orderId: string;
  status: string;
  alreadyFinalized?: boolean;
}

export async function createOrderPaymentSession(orderId: string): Promise<OrderPaymentSession> {
  const { data, error } = await supabase.functions.invoke('create-order-payment', {
    body: { orderId },
  });
  if (error) {
    throw new Error(error.message || 'Failed to create payment session');
  }
  if (!data?.clientSecret) {
    throw new Error(data?.error || 'Payment session missing clientSecret');
  }
  return {
    clientSecret: data.clientSecret,
    ephemeralKey: data.ephemeralKey ?? null,
    customerId: data.customerId,
    paymentIntentId: data.paymentIntentId,
  };
}

export async function confirmOrderPayment(orderId: string): Promise<ConfirmOrderPaymentResult> {
  const { data, error } = await supabase.functions.invoke('confirm-order-payment', {
    body: { orderId },
  });
  if (error) {
    throw new Error(error.message || 'Failed to confirm payment');
  }
  return data as ConfirmOrderPaymentResult;
}
