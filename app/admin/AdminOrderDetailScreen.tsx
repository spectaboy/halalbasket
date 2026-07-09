// Admin order detail: items + full money breakdown (incl. commission),
// customer / seller / driver cards, status timeline from order_status_events,
// and admin overrides — reassign driver, cancel, and a manual status override
// picker for dispute resolution. Live-updates via OrderService.subscribeToOrder.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { MainStackParamList } from '../navigation/types';
import { supabase } from '../config/supabase';
import { lightColors } from '../../constants/theme';
import { notify } from '../lib/notify';
import { OrderService, ORDER_STATUS_LABELS } from '../services/orders';
import { formatMoney } from '../utils/pricing';
import type {
  OrderRow,
  OrderItemRow,
  OrderStatus,
  OrderStatusEventRow,
  DriverRow,
} from '../types/database';

type Props = NativeStackScreenProps<MainStackParamList, 'AdminOrderDetail'>;

interface OrderDetail extends OrderRow {
  order_items: OrderItemRow[];
  users: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  sellers: { business_name: string; seller_type: string } | null;
  drivers: {
    id: string;
    vehicle_info: DriverRow['vehicle_info'];
    users: { first_name: string | null; last_name: string | null; phone: string | null } | null;
  } | null;
}

interface CandidateDriver {
  id: string;
  vehicle_info: DriverRow['vehicle_info'];
  users: { first_name: string | null; last_name: string | null } | null;
}

const ALL_STATUSES: OrderStatus[] = [
  'pending_payment',
  'paid',
  'accepted',
  'preparing',
  'ready',
  'driver_assigned',
  'picked_up',
  'en_route',
  'delivered',
  'cancelled',
  'refunded',
];

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending_payment: '#95A5A6',
  paid: '#2980B9',
  accepted: '#2980B9',
  preparing: '#E67E22',
  ready: '#E67E22',
  driver_assigned: '#8E44AD',
  picked_up: '#8E44AD',
  en_route: '#8E44AD',
  delivered: '#1A5C38',
  cancelled: '#E74C3C',
  refunded: '#E74C3C',
};

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

const personName = (
  u: { first_name: string | null; last_name: string | null } | null | undefined,
  fallback: string
) => [u?.first_name, u?.last_name].filter(Boolean).join(' ') || fallback;

const vehicleSummary = (v: DriverRow['vehicle_info'] | undefined): string => {
  const main = [v?.year, v?.make, v?.model].filter(Boolean).join(' ');
  const extra = [v?.color, v?.plate].filter(Boolean).join(' · ');
  return [main, extra].filter(Boolean).join(' · ') || 'No vehicle info';
};

export default function AdminOrderDetailScreen({ navigation, route }: Props) {
  const { orderId } = route.params;
  const insets = useSafeAreaInsets();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [events, setEvents] = useState<OrderStatusEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [candidates, setCandidates] = useState<CandidateDriver[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [orderRes, eventsRes] = await Promise.all([
        supabase
          .from('orders')
          .select(
            '*, order_items(*), users(first_name, last_name, email, phone), ' +
              'sellers(business_name, seller_type), ' +
              'drivers(id, vehicle_info, users(first_name, last_name, phone))'
          )
          .eq('id', orderId)
          .maybeSingle(),
        supabase
          .from('order_status_events')
          .select('*')
          .eq('order_id', orderId)
          .order('created_at', { ascending: true }),
      ]);
      if (orderRes.error) throw orderRes.error;
      if (eventsRes.error) throw eventsRes.error;
      setOrder(orderRes.data as unknown as OrderDetail | null);
      setEvents((eventsRes.data ?? []) as OrderStatusEventRow[]);
    } catch (e: any) {
      notify.error(e?.message ?? 'Failed to load order');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: any change to this order reloads the full view (joins + events).
  useEffect(() => {
    const ch = OrderService.subscribeToOrder(orderId, () => {
      load();
    });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [orderId, load]);

  // ── Admin overrides ────────────────────────────────────────────────────────

  const openReassign = async () => {
    setReassignOpen(true);
    setCandidatesLoading(true);
    try {
      const { data, error } = await supabase
        .from('drivers')
        .select('id, vehicle_info, users(first_name, last_name)')
        .eq('verification_status', 'approved')
        .eq('is_online', true);
      if (error) throw error;
      setCandidates((data ?? []) as unknown as CandidateDriver[]);
    } catch (e: any) {
      notify.error(e?.message ?? 'Failed to load drivers');
    } finally {
      setCandidatesLoading(false);
    }
  };

  const reassign = async (d: CandidateDriver) => {
    const name = personName(d.users, 'this driver');
    const ok = await notify.confirm({
      title: 'Reassign driver',
      message: `Assign ${name} to this order? Status becomes "Driver assigned".`,
      confirmText: 'Assign',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await OrderService.updateStatus(orderId, 'driver_assigned', { driver_id: d.id });
      setReassignOpen(false);
      notify.success(`Driver reassigned to ${name}`);
      await load();
    } catch (e: any) {
      notify.error(e?.message ?? 'Failed to reassign driver');
    } finally {
      setBusy(false);
    }
  };

  const cancelOrder = async () => {
    const ok = await notify.confirm({
      title: 'Cancel order',
      message: 'Cancel this order? The customer and seller will see it as cancelled.',
      confirmText: 'Cancel order',
      cancelText: 'Keep order',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await OrderService.updateStatus(orderId, 'cancelled', {
        cancellation_reason: 'Cancelled by admin',
      });
      notify.success('Order cancelled');
      await load();
    } catch (e: any) {
      notify.error(e?.message ?? 'Failed to cancel order');
    } finally {
      setBusy(false);
    }
  };

  const overrideStatus = async (status: OrderStatus) => {
    if (!order || status === order.status) return;
    const ok = await notify.confirm({
      title: 'Override status',
      message: `Force this order from "${ORDER_STATUS_LABELS[order.status]}" to "${ORDER_STATUS_LABELS[status]}"? Use only for dispute resolution.`,
      confirmText: 'Override',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await OrderService.updateStatus(orderId, status);
      setOverrideOpen(false);
      notify.success(`Status set to "${ORDER_STATUS_LABELS[status]}"`);
      await load();
    } catch (e: any) {
      notify.error(e?.message ?? 'Failed to override status');
    } finally {
      setBusy(false);
    }
  };

  // ── Small render helpers ───────────────────────────────────────────────────

  const MoneyRow = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
    <View style={styles.moneyRow}>
      <Text style={[styles.moneyLabel, bold && styles.moneyBold]}>{label}</Text>
      <Text style={[styles.moneyValue, bold && styles.moneyBold]}>{value}</Text>
    </View>
  );

  const PersonRow = ({
    icon,
    value,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    value: string | null | undefined;
  }) =>
    value ? (
      <View style={styles.personRow}>
        <Ionicons name={icon} size={14} color={lightColors.textMuted} />
        <Text style={styles.personText}>{value}</Text>
      </View>
    ) : null;

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header navigation={navigation} />
        <View style={styles.center}>
          <ActivityIndicator color={lightColors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header navigation={navigation} />
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color="#9CA3AF" />
          <Text style={styles.emptyText}>Order not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusColor = STATUS_COLORS[order.status];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header navigation={navigation} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
        {/* Status */}
        <View style={styles.card}>
          <View style={styles.statusTop}>
            <View style={[styles.statusChip, { backgroundColor: statusColor + '1A' }]}>
              <Text style={[styles.statusChipText, { color: statusColor }]}>
                {ORDER_STATUS_LABELS[order.status]}
              </Text>
            </View>
            <Text style={styles.placedAt}>Placed {fmtDateTime(order.placed_at)}</Text>
          </View>
          {order.cancellation_reason ? (
            <Text style={styles.cancelReason}>Reason: {order.cancellation_reason}</Text>
          ) : null}
        </View>

        {/* Items + money */}
        <Text style={styles.sectionTitle}>Items</Text>
        <View style={styles.card}>
          {order.order_items.map((it) => (
            <View key={it.id} style={styles.itemRow}>
              <Text style={styles.itemQty}>{it.quantity}×</Text>
              <Text style={styles.itemName} numberOfLines={1}>
                {it.name}
              </Text>
              <Text style={styles.itemPrice}>{formatMoney(it.unit_price * it.quantity)}</Text>
            </View>
          ))}
          <View style={styles.moneyDivider} />
          <MoneyRow label="Subtotal" value={formatMoney(order.subtotal)} />
          <MoneyRow label="Delivery fee" value={formatMoney(order.delivery_fee)} />
          <MoneyRow label="Service fee" value={formatMoney(order.service_fee)} />
          <MoneyRow label="Tax" value={formatMoney(order.tax)} />
          <MoneyRow label="Total" value={formatMoney(order.total)} bold />
          <View style={styles.moneyDivider} />
          <MoneyRow
            label={`Commission (${(order.commission_rate * 100).toFixed(1)}%)`}
            value={formatMoney(order.commission_amount)}
          />
        </View>

        {/* People */}
        <Text style={styles.sectionTitle}>Customer</Text>
        <View style={styles.card}>
          <Text style={styles.personName}>{personName(order.users, 'Unknown customer')}</Text>
          <PersonRow icon="call-outline" value={order.users?.phone} />
          <PersonRow icon="mail-outline" value={order.users?.email} />
          <PersonRow icon="location-outline" value={order.delivery_address} />
          <PersonRow icon="chatbox-ellipses-outline" value={order.delivery_instructions} />
        </View>

        <Text style={styles.sectionTitle}>Seller</Text>
        <View style={styles.card}>
          <Text style={styles.personName}>{order.sellers?.business_name ?? 'Unknown seller'}</Text>
          <PersonRow icon="pricetag-outline" value={order.sellers?.seller_type?.replace('_', ' ')} />
        </View>

        <Text style={styles.sectionTitle}>Driver</Text>
        <View style={styles.card}>
          {order.drivers ? (
            <>
              <Text style={styles.personName}>
                {personName(order.drivers.users, 'Unnamed driver')}
              </Text>
              <PersonRow icon="call-outline" value={order.drivers.users?.phone} />
              <PersonRow icon="car-outline" value={vehicleSummary(order.drivers.vehicle_info)} />
            </>
          ) : (
            <Text style={styles.emptyText}>No driver assigned.</Text>
          )}
        </View>

        {/* Timeline */}
        <Text style={styles.sectionTitle}>Timeline</Text>
        <View style={styles.card}>
          {events.length === 0 ? (
            <Text style={styles.emptyText}>No status events.</Text>
          ) : (
            events.map((ev, i) => {
              const evStatus = ev.status as OrderStatus;
              return (
                <View key={ev.id} style={styles.timelineRow}>
                  <View style={styles.timelineRail}>
                    <View
                      style={[
                        styles.timelineDot,
                        { backgroundColor: STATUS_COLORS[evStatus] ?? '#95A5A6' },
                      ]}
                    />
                    {i < events.length - 1 && <View style={styles.timelineLine} />}
                  </View>
                  <View style={styles.timelineBody}>
                    <Text style={styles.timelineTitle}>
                      {ORDER_STATUS_LABELS[evStatus] ?? ev.status}
                    </Text>
                    <Text style={styles.timelineTime}>{fmtDateTime(ev.created_at)}</Text>
                    {ev.note ? <Text style={styles.timelineNote}>{ev.note}</Text> : null}
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Admin overrides */}
        <Text style={styles.sectionTitle}>Admin actions</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={[styles.actionRow, busy && styles.disabled]}
            disabled={busy}
            onPress={openReassign}
          >
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(142,68,173,0.10)' }]}>
              <Ionicons name="swap-horizontal-outline" size={18} color="#8E44AD" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionLabel}>Reassign driver</Text>
              <Text style={styles.actionHint}>Pick from online approved drivers</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionRow, styles.actionDivider, busy && styles.disabled]}
            disabled={busy}
            onPress={() => setOverrideOpen(true)}
          >
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(41,128,185,0.10)' }]}>
              <Ionicons name="build-outline" size={18} color="#2980B9" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionLabel}>Override status</Text>
              <Text style={styles.actionHint}>Force any status — dispute resolution</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionRow,
              styles.actionDivider,
              (busy || order.status === 'cancelled') && styles.disabled,
            ]}
            disabled={busy || order.status === 'cancelled'}
            onPress={cancelOrder}
          >
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(231,76,60,0.10)' }]}>
              <Ionicons name="close-circle-outline" size={18} color={lightColors.error} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionLabel, { color: lightColors.error }]}>Cancel order</Text>
              <Text style={styles.actionHint}>Marks the order cancelled</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Reassign driver modal */}
      <Modal
        visible={reassignOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setReassignOpen(false)}
      >
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Reassign driver</Text>
              <TouchableOpacity onPress={() => setReassignOpen(false)}>
                <Ionicons name="close" size={22} color={lightColors.textDark} />
              </TouchableOpacity>
            </View>
            {candidatesLoading ? (
              <ActivityIndicator style={{ marginVertical: 32 }} color={lightColors.primary} />
            ) : (
              <FlatList
                data={candidates}
                keyExtractor={(d) => d.id}
                style={{ maxHeight: 380 }}
                ListEmptyComponent={
                  <Text style={[styles.emptyText, { textAlign: 'center', marginVertical: 24 }]}>
                    No approved drivers are online right now.
                  </Text>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.driverOption, busy && styles.disabled]}
                    disabled={busy}
                    onPress={() => reassign(item)}
                  >
                    <View style={styles.driverAvatar}>
                      <Ionicons name="person" size={16} color={lightColors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.driverName}>
                        {personName(item.users, 'Unnamed driver')}
                      </Text>
                      <Text style={styles.driverVehicle} numberOfLines={1}>
                        {vehicleSummary(item.vehicle_info)}
                      </Text>
                    </View>
                    {order.driver_id === item.id ? (
                      <Text style={styles.currentTag}>Current</Text>
                    ) : (
                      <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                    )}
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Status override modal */}
      <Modal
        visible={overrideOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setOverrideOpen(false)}
      >
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Override status</Text>
              <TouchableOpacity onPress={() => setOverrideOpen(false)}>
                <Ionicons name="close" size={22} color={lightColors.textDark} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 420 }}>
              {ALL_STATUSES.map((s) => {
                const current = s === order.status;
                return (
                  <TouchableOpacity
                    key={s}
                    style={[styles.statusOption, (busy || current) && styles.disabled]}
                    disabled={busy || current}
                    onPress={() => overrideStatus(s)}
                  >
                    <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[s] }]} />
                    <Text style={styles.statusOptionText}>{ORDER_STATUS_LABELS[s]}</Text>
                    {current && <Text style={styles.currentTag}>Current</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Header({ navigation }: { navigation: Props['navigation'] }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="arrow-back" size={24} color={lightColors.textDark} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Order detail</Text>
      <View style={{ width: 24 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9F8' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ECEFED',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: lightColors.textDark },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyText: { fontSize: 14, color: lightColors.textMuted },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: lightColors.textDark,
    marginTop: 10,
    marginBottom: 10,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: lightColors.divider,
  },
  statusTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  statusChipText: { fontSize: 13, fontWeight: '700' },
  placedAt: { fontSize: 12, color: lightColors.textMuted },
  cancelReason: { fontSize: 13, color: lightColors.error, marginTop: 10 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  itemQty: { fontSize: 14, fontWeight: '700', color: lightColors.primary, width: 30 },
  itemName: { flex: 1, fontSize: 14, color: lightColors.textDark, fontWeight: '600' },
  itemPrice: { fontSize: 14, color: lightColors.textDark, fontWeight: '600' },
  moneyDivider: { height: 1, backgroundColor: lightColors.divider, marginVertical: 8 },
  moneyRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  moneyLabel: { fontSize: 13, color: lightColors.textMuted },
  moneyValue: { fontSize: 13, color: lightColors.textDark, fontWeight: '600' },
  moneyBold: { fontSize: 15, fontWeight: '800', color: lightColors.textDark },
  personName: { fontSize: 15, fontWeight: '700', color: lightColors.textDark, marginBottom: 4 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 },
  personText: { flex: 1, fontSize: 13, color: lightColors.textMuted },
  timelineRow: { flexDirection: 'row', gap: 12 },
  timelineRail: { alignItems: 'center', width: 14 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  timelineLine: { flex: 1, width: 2, backgroundColor: lightColors.divider, marginVertical: 2 },
  timelineBody: { flex: 1, paddingBottom: 14 },
  timelineTitle: { fontSize: 14, fontWeight: '700', color: lightColors.textDark },
  timelineTime: { fontSize: 12, color: lightColors.textMuted, marginTop: 1 },
  timelineNote: { fontSize: 12, color: lightColors.textMuted, marginTop: 3, fontStyle: 'italic' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  actionDivider: { borderTopWidth: 1, borderTopColor: lightColors.divider },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontSize: 14, fontWeight: '700', color: lightColors.textDark },
  actionHint: { fontSize: 12, color: lightColors.textMuted, marginTop: 1 },
  disabled: { opacity: 0.45 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: lightColors.textDark },
  driverOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: lightColors.divider,
  },
  driverAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverName: { fontSize: 14, fontWeight: '700', color: lightColors.textDark },
  driverVehicle: { fontSize: 12, color: lightColors.textMuted, marginTop: 1 },
  currentTag: { fontSize: 11, fontWeight: '700', color: lightColors.primary },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: lightColors.divider,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusOptionText: { flex: 1, fontSize: 14, fontWeight: '600', color: lightColors.textDark },
});
