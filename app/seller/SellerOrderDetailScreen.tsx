// HalalBasket — seller order detail: items, money breakdown (with commission
// line — home cooks keep 100%), status timeline, next-transition action.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { lightColors, spacing } from '../../constants/theme';
import { supabase } from '../config/supabase';
import { useSession } from '../context/SessionContext';
import { notify } from '../lib/notify';
import { formatMoney } from '../utils/pricing';
import { OrderService, ORDER_STATUS_LABELS } from '../services/orders';
import type { MainStackParamList } from '../navigation/types';
import type {
  OrderItemRow,
  OrderRow,
  OrderStatus,
  OrderStatusEventRow,
} from '../types/database';

type Props = NativeStackScreenProps<MainStackParamList, 'SellerOrderDetail'>;

type FullOrder = OrderRow & {
  order_items: OrderItemRow[];
  users: { first_name: string | null; last_name: string | null } | null;
};

const NEXT_ACTION: Partial<Record<OrderStatus, { next: OrderStatus; label: string; icon: string }>> = {
  paid: { next: 'accepted', label: 'Accept order', icon: 'checkmark-circle-outline' },
  accepted: { next: 'preparing', label: 'Start preparing', icon: 'flame-outline' },
  preparing: { next: 'ready', label: 'Mark ready for pickup', icon: 'bag-check-outline' },
};

export default function SellerOrderDetailScreen({ navigation, route }: Props) {
  const { orderId } = route.params;
  const { seller } = useSession();
  const [order, setOrder] = useState<FullOrder | null>(null);
  const [events, setEvents] = useState<OrderStatusEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    const [{ data: o }, { data: ev }] = await Promise.all([
      supabase
        .from('orders')
        .select('*, order_items(*), users!orders_customer_id_fkey(first_name, last_name)')
        .eq('id', orderId)
        .maybeSingle(),
      supabase
        .from('order_status_events')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true }),
    ]);
    if (o) setOrder(o as unknown as FullOrder);
    if (ev) setEvents(ev as OrderStatusEventRow[]);
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    void load();
    const channel = OrderService.subscribeToOrder(orderId, () => void load());
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orderId, load]);

  const advance = async (next: OrderStatus) => {
    setActing(true);
    try {
      await OrderService.updateStatus(orderId, next);
      notify.success(`Order marked "${ORDER_STATUS_LABELS[next]}"`);
    } catch {
      notify.error('Could not update the order. Try again.');
    } finally {
      setActing(false);
    }
  };

  const cancelOrder = () => {
    void notify.confirm({
      title: 'Cancel order',
      message: 'Cancel this order? The customer will be refunded.',
      confirmText: 'Cancel order',
      destructive: true,
      onConfirm: () => {
        setActing(true);
        OrderService.updateStatus(orderId, 'cancelled', {
          cancellation_reason: 'Cancelled by seller',
        })
          .then(() => notify.success('Order cancelled'))
          .catch(() => notify.error('Could not cancel the order.'))
          .finally(() => setActing(false));
      },
    });
  };

  if (loading || !order) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={lightColors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const isHomeCook = seller?.seller_type === 'home_cook';
  const netToSeller = order.subtotal - order.commission_amount;
  const shortCode = order.id.replace(/-/g, '').slice(0, 8).toUpperCase();
  const action = NEXT_ACTION[order.status];
  const customerName = [order.users?.first_name, order.users?.last_name].filter(Boolean).join(' ') || 'Customer';
  const cancellable = ['paid', 'accepted', 'preparing'].includes(order.status);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={lightColors.textDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Order #{shortCode}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.statusBanner}>
          <Text style={styles.statusBannerText}>{ORDER_STATUS_LABELS[order.status]}</Text>
        </View>

        {/* items */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Items</Text>
          {order.order_items.map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <Text style={styles.itemQty}>{item.quantity}×</Text>
              <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.itemPrice}>{formatMoney(item.unit_price * item.quantity)}</Text>
            </View>
          ))}
        </View>

        {/* money */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Payout</Text>
          <View style={styles.moneyRow}>
            <Text style={styles.moneyLabel}>Food subtotal</Text>
            <Text style={styles.moneyValue}>{formatMoney(order.subtotal)}</Text>
          </View>
          <View style={styles.moneyRow}>
            <Text style={styles.moneyLabel}>
              {isHomeCook
                ? 'Commission — you keep 100%'
                : `HalalBasket commission (${Math.round(order.commission_rate * 100)}%)`}
            </Text>
            <Text style={[styles.moneyValue, !isHomeCook && styles.moneyNegative]}>
              {order.commission_amount > 0 ? `−${formatMoney(order.commission_amount)}` : '$0.00'}
            </Text>
          </View>
          <View style={[styles.moneyRow, styles.moneyTotalRow]}>
            <Text style={styles.moneyTotalLabel}>You receive</Text>
            <Text style={styles.moneyTotalValue}>{formatMoney(netToSeller)}</Text>
          </View>
        </View>

        {/* customer */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Delivery</Text>
          <View style={styles.customerRow}>
            <Ionicons name="person-circle-outline" size={22} color={lightColors.textMuted} />
            <Text style={styles.customerName}>{customerName}</Text>
          </View>
          <View style={styles.customerRow}>
            <Ionicons name="location-outline" size={20} color={lightColors.textMuted} />
            <Text style={styles.address}>{order.delivery_address}</Text>
          </View>
          {order.delivery_instructions ? (
            <View style={styles.customerRow}>
              <Ionicons name="chatbox-ellipses-outline" size={20} color={lightColors.textMuted} />
              <Text style={styles.address}>{order.delivery_instructions}</Text>
            </View>
          ) : null}
        </View>

        {/* timeline */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Timeline</Text>
          {events.map((ev, idx) => (
            <View key={ev.id} style={styles.timelineRow}>
              <View style={styles.timelineDotWrap}>
                <View style={[styles.timelineDot, idx === events.length - 1 && styles.timelineDotActive]} />
                {idx < events.length - 1 && <View style={styles.timelineLine} />}
              </View>
              <View style={styles.timelineBody}>
                <Text style={styles.timelineStatus}>{ORDER_STATUS_LABELS[ev.status]}</Text>
                <Text style={styles.timelineTime}>
                  {new Date(ev.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {action && (
          <TouchableOpacity
            style={styles.primaryBtn}
            activeOpacity={0.9}
            disabled={acting}
            onPress={() => void advance(action.next)}
          >
            {acting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name={action.icon as any} size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>{action.label}</Text>
              </>
            )}
          </TouchableOpacity>
        )}
        {cancellable && (
          <TouchableOpacity style={styles.cancelBtn} activeOpacity={0.85} disabled={acting} onPress={cancelOrder}>
            <Text style={styles.cancelBtnText}>Cancel order</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: lightColors.textDark,
  },
  scroll: {
    padding: spacing.md,
    paddingBottom: 24,
    gap: spacing.sm,
  },
  statusBanner: {
    backgroundColor: lightColors.chipBg,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  statusBannerText: {
    fontSize: 15,
    fontWeight: '800',
    color: lightColors.primary,
  },
  card: {
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: lightColors.divider,
    gap: 10,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: lightColors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  itemQty: {
    fontSize: 14,
    fontWeight: '800',
    color: lightColors.primary,
    width: 30,
  },
  itemName: {
    flex: 1,
    fontSize: 14.5,
    color: lightColors.textDark,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: lightColors.textDark,
  },
  moneyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  moneyLabel: {
    fontSize: 13.5,
    color: lightColors.textMuted,
    flex: 1,
    paddingRight: 8,
  },
  moneyValue: {
    fontSize: 14,
    fontWeight: '600',
    color: lightColors.textDark,
  },
  moneyNegative: {
    color: lightColors.error,
  },
  moneyTotalRow: {
    borderTopWidth: 1,
    borderTopColor: lightColors.divider,
    paddingTop: 10,
  },
  moneyTotalLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: lightColors.textDark,
  },
  moneyTotalValue: {
    fontSize: 16,
    fontWeight: '800',
    color: lightColors.primary,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  customerName: {
    fontSize: 14.5,
    fontWeight: '700',
    color: lightColors.textDark,
  },
  address: {
    flex: 1,
    fontSize: 14,
    color: lightColors.textDark,
    lineHeight: 20,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: 10,
  },
  timelineDotWrap: {
    alignItems: 'center',
    width: 16,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: lightColors.textMuted,
    marginTop: 4,
  },
  timelineDotActive: {
    backgroundColor: lightColors.primary,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: lightColors.divider,
    marginVertical: 2,
  },
  timelineBody: {
    flex: 1,
    paddingBottom: 12,
  },
  timelineStatus: {
    fontSize: 14,
    fontWeight: '700',
    color: lightColors.textDark,
  },
  timelineTime: {
    fontSize: 12.5,
    color: lightColors.textMuted,
  },
  footer: {
    padding: spacing.md,
    gap: 8,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: lightColors.primary,
    borderRadius: 12,
    paddingVertical: 16,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  cancelBtnText: {
    color: lightColors.error,
    fontSize: 14,
    fontWeight: '700',
  },
});
