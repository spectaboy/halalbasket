// Admin orders tab: all orders newest first with status chips, seller +
// customer names, totals; filterable by status group. Live-updates via a
// table-wide postgres_changes subscription on orders.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { MainStackParamList } from '../navigation/types';
import { supabase } from '../config/supabase';
import { lightColors } from '../../constants/theme';
import { notify } from '../lib/notify';
import { ORDER_STATUS_LABELS } from '../services/orders';
import { formatMoney } from '../utils/pricing';
import type { OrderRow, OrderStatus } from '../types/database';

type Nav = NativeStackNavigationProp<MainStackParamList>;

interface AdminOrderListRow extends OrderRow {
  sellers: { business_name: string } | null;
  users: { first_name: string | null; last_name: string | null } | null;
}

type FilterKey = 'all' | 'active' | 'delivered' | 'cancelled';

const ACTIVE_STATUSES: OrderStatus[] = [
  'pending_payment',
  'paid',
  'accepted',
  'preparing',
  'ready',
  'driver_assigned',
  'picked_up',
  'en_route',
];

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'cancelled', label: 'Cancelled' },
];

export const STATUS_COLORS: Record<OrderStatus, string> = {
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

export default function AdminOrdersScreen() {
  const navigation = useNavigation<Nav>();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [orders, setOrders] = useState<AdminOrderListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (f: FilterKey) => {
    try {
      let query = supabase
        .from('orders')
        .select('*, sellers(business_name), users(first_name, last_name)')
        .order('placed_at', { ascending: false })
        .limit(100);
      if (f === 'active') query = query.in('status', ACTIVE_STATUSES);
      else if (f === 'delivered') query = query.eq('status', 'delivered');
      else if (f === 'cancelled') query = query.in('status', ['cancelled', 'refunded']);

      const { data, error } = await query;
      if (error) throw error;
      setOrders((data ?? []) as unknown as AdminOrderListRow[]);
    } catch (e: any) {
      notify.error(e?.message ?? 'Failed to load orders');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load(filter);
  }, [filter, load]);

  // Realtime: one channel for the whole table; reload the current filter.
  const reloadRef = useRef<() => void>(() => {});
  reloadRef.current = () => load(filter);
  useEffect(() => {
    const ch = supabase
      .channel('admin-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        reloadRef.current();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    load(filter);
  };

  const renderItem = ({ item }: { item: AdminOrderListRow }) => {
    const statusColor = STATUS_COLORS[item.status];
    const customer =
      [item.users?.first_name, item.users?.last_name].filter(Boolean).join(' ') || 'Unknown customer';
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('AdminOrderDetail', { orderId: item.id })}
      >
        <View style={styles.cardTop}>
          <Text style={styles.sellerName} numberOfLines={1}>
            {item.sellers?.business_name ?? 'Unknown seller'}
          </Text>
          <View style={[styles.statusChip, { backgroundColor: statusColor + '1A' }]}>
            <Text style={[styles.statusChipText, { color: statusColor }]}>
              {ORDER_STATUS_LABELS[item.status] ?? item.status}
            </Text>
          </View>
        </View>
        <View style={styles.metaRow}>
          <Ionicons name="person-outline" size={13} color={lightColors.textMuted} />
          <Text style={styles.metaText} numberOfLines={1}>
            {customer}
          </Text>
          <Text style={styles.total}>{formatMoney(item.total)}</Text>
        </View>
        <Text style={styles.time}>{fmtDateTime(item.placed_at)}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Orders</Text>
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={lightColors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={lightColors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="receipt-outline" size={40} color="#9CA3AF" />
              <Text style={styles.emptyText}>No orders here yet.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9F8' },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ECEFED',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: lightColors.textDark },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 14 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#ECEFED',
  },
  filterChipActive: { backgroundColor: lightColors.primary },
  filterText: { fontSize: 13, fontWeight: '600', color: lightColors.textMuted },
  filterTextActive: { color: '#fff', fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: lightColors.divider,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sellerName: { flex: 1, fontSize: 15, fontWeight: '700', color: lightColors.textDark },
  statusChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusChipText: { fontSize: 11, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  metaText: { flex: 1, fontSize: 13, color: lightColors.textMuted },
  total: { fontSize: 14, fontWeight: '800', color: lightColors.textDark },
  time: { fontSize: 11, color: lightColors.textMuted, marginTop: 6 },
  emptyWrap: { alignItems: 'center', gap: 10, marginTop: 60 },
  emptyText: { fontSize: 15, color: lightColors.textMuted },
});
