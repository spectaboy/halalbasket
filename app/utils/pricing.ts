// HalalBasket order economics (spec section 9).
// Customer pays: subtotal + delivery fee + service fee + tax.
// Seller receives: subtotal - commission (commission 0 for home cooks at launch).
// Driver is paid from the delivery fee; platform keeps commission + service fee + margin.

import { supabase } from '../config/supabase';
import type { SellerType } from '../types/database';

export interface PlatformFees {
  commissionRates: Record<SellerType, number>;
  deliveryFeeBase: number;
  serviceFee: number;
  taxRate: number;
}

const DEFAULTS: PlatformFees = {
  commissionRates: { restaurant: 0.15, butcher: 0.1, home_cook: 0 },
  deliveryFeeBase: 3.99,
  serviceFee: 1.49,
  taxRate: 0.05,
};

let cached: PlatformFees | null = null;

/** Load fee configuration from platform_config, falling back to defaults. */
export async function getPlatformFees(): Promise<PlatformFees> {
  if (cached) return cached;
  try {
    const { data } = await supabase.from('platform_config').select('key, value');
    const map = new Map((data ?? []).map((r: any) => [r.key, Number(r.value)]));
    cached = {
      commissionRates: {
        restaurant: map.get('commission_rate_restaurant') ?? DEFAULTS.commissionRates.restaurant,
        butcher: map.get('commission_rate_butcher') ?? DEFAULTS.commissionRates.butcher,
        home_cook: map.get('commission_rate_home_cook') ?? DEFAULTS.commissionRates.home_cook,
      },
      deliveryFeeBase: map.get('delivery_fee_base') ?? DEFAULTS.deliveryFeeBase,
      serviceFee: map.get('service_fee') ?? DEFAULTS.serviceFee,
      taxRate: map.get('tax_rate') ?? DEFAULTS.taxRate,
    };
    return cached;
  } catch {
    return DEFAULTS;
  }
}

export interface OrderQuote {
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  tax: number;
  total: number;
  commissionRate: number;
  commissionAmount: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Quote an order. commissionRate comes from the seller row (per-seller override)
 * or the platform default for the seller type.
 */
export function quoteOrder(
  subtotal: number,
  sellerType: SellerType,
  fees: PlatformFees,
  sellerCommissionRate?: number
): OrderQuote {
  const commissionRate = sellerCommissionRate ?? fees.commissionRates[sellerType];
  const deliveryFee = fees.deliveryFeeBase;
  const serviceFee = fees.serviceFee;
  const tax = round2(subtotal * fees.taxRate);
  return {
    subtotal: round2(subtotal),
    deliveryFee,
    serviceFee,
    tax,
    total: round2(subtotal + deliveryFee + serviceFee + tax),
    commissionRate,
    commissionAmount: round2(subtotal * commissionRate),
  };
}

export const formatMoney = (n: number) => `$${n.toFixed(2)}`;
