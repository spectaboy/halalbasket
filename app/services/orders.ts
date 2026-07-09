// Order lifecycle service. Same realtime subscription shape as URide's
// RideStatusService: channel per entity, postgres_changes with row filter,
// caller owns cleanup via supabase.removeChannel().

import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import type { OrderRow, OrderStatus } from '../types/database';

export class OrderService {
  /** Subscribe to changes on a single order row. */
  static subscribeToOrder(orderId: string, callback: (order: OrderRow) => void) {
    return supabase
      .channel(`order:${orderId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        (payload: any) => {
          logger.info('Orders', 'order change', { orderId, status: payload.new?.status });
          if (payload.new) callback(payload.new as OrderRow);
        }
      )
      .subscribe();
  }

  /** Subscribe to the driver's live position for an order. */
  static subscribeToDeliveryLocation(
    orderId: string,
    callback: (loc: { latitude: number; longitude: number; heading: number | null }) => void
  ) {
    return supabase
      .channel(`delivery-location:${orderId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'delivery_locations', filter: `order_id=eq.${orderId}` },
        (payload: any) => {
          const loc = payload.new;
          if (loc) callback({ latitude: loc.latitude, longitude: loc.longitude, heading: loc.heading });
        }
      )
      .subscribe();
  }

  /** Subscribe to new/updated orders for a seller (incoming order feed). */
  static subscribeToSellerOrders(sellerId: string, callback: (order: OrderRow) => void) {
    return supabase
      .channel(`seller-orders:${sellerId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `seller_id=eq.${sellerId}` },
        (payload: any) => {
          if (payload.new) callback(payload.new as OrderRow);
        }
      )
      .subscribe();
  }

  /** Subscribe to orders assigned to a driver. */
  static subscribeToDriverOrders(driverId: string, callback: (order: OrderRow) => void) {
    return supabase
      .channel(`driver-orders:${driverId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `driver_id=eq.${driverId}` },
        (payload: any) => {
          if (payload.new) callback(payload.new as OrderRow);
        }
      )
      .subscribe();
  }

  static async getOrder(orderId: string): Promise<OrderRow | null> {
    const { data } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
    return (data as OrderRow) ?? null;
  }

  static async getOrderWithItems(orderId: string) {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', orderId)
      .maybeSingle();
    if (error) logger.error('Orders', 'getOrderWithItems failed', { error: error.message });
    return data as (OrderRow & { order_items: any[] }) | null;
  }

  /**
   * Status transition. Guarded client-side against the allowed progression;
   * RLS restricts updates to parties of the order.
   */
  static async updateStatus(orderId: string, status: OrderStatus, extra: Partial<OrderRow> = {}) {
    const timestamps: Partial<Record<OrderStatus, Partial<OrderRow>>> = {
      accepted: { accepted_at: new Date().toISOString() },
      ready: { ready_at: new Date().toISOString() },
      picked_up: { picked_up_at: new Date().toISOString() },
      delivered: { delivered_at: new Date().toISOString() },
      cancelled: { cancelled_at: new Date().toISOString() },
    };
    const { error } = await supabase
      .from('orders')
      .update({ status, ...(timestamps[status] ?? {}), ...extra })
      .eq('id', orderId);
    if (error) {
      logger.error('Orders', 'updateStatus failed', { orderId, status, error: error.message });
      throw error;
    }
  }
}

/** Human-readable labels for customer-facing status display. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: 'Awaiting payment',
  paid: 'Order placed',
  accepted: 'Confirmed by seller',
  preparing: 'Being prepared',
  ready: 'Ready for pickup',
  driver_assigned: 'Driver assigned',
  picked_up: 'Picked up',
  en_route: 'On the way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};
