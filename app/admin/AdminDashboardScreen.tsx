// Admin overview tab: verification-queue + order stat cards and a recent
// activity feed built from order_status_events. Each card taps through to the
// relevant admin tab. RLS: admins have full read via is_admin().

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { MainStackParamList } from '../navigation/types';
import { supabase } from '../config/supabase';
import { lightColors } from '../../constants/theme';
import { notify } from '../lib/notify';
import { ORDER_STATUS_LABELS } from '../services/orders';
import { formatMoney } from '../utils/pricing';
import type { OrderStatus } from '../types/database';

type Nav = NativeStackNavigationProp<MainStackParamList>;

const ACTIVE_STATUSES: OrderStatus[] = [
  'paid',
  'accepted',
  'preparing',
  'ready',
  'driver_assigned',
  'picked_up',
  'en_route',
];

interface ActivityEvent {
  id: string;
  order_id: string;
  status: OrderStatus;
  created_at: string;
  orders: {
    total: number;
    sellers: { business_name: string } | null;
  } | null;
}

interface Stats {
  pendingSellers: number;
  pendingDrivers: number;
  ordersToday: number;
  activeOrders: number;
}

const STATUS_ICONS: Partial<Record<OrderStatus, keyof typeof Ionicons.glyphMap>> = {
  pending_payment: 'card-outline',
  paid: 'receipt-outline',
  accepted: 'checkmark-circle-outline',
  preparing: 'restaurant-outline',
  ready: 'cube-outline',
  driver_assigned: 'person-outline',
  picked_up: 'bag-check-outline',
  en_route: 'bicycle-outline',
  delivered: 'home-outline',
  cancelled: 'close-circle-outline',
  refunded: 'arrow-undo-outline',
};

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

export default function AdminDashboardScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const [sellersRes, driversRes, todayRes, activeRes, eventsRes] = await Promise.all([
        supabase
          .from('sellers')
          .select('id', { count: 'exact', head: true })
          .eq('verification_status', 'pending'),
        supabase
          .from('drivers')
          .select('id', { count: 'exact', head: true })
          .eq('verification_status', 'pending'),
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .gte('placed_at', startOfDay.toISOString()),
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .in('status', ACTIVE_STATUSES),
        supabase
          .from('order_status_events')
          .select('id, order_id, status, created_at, orders(total, sellers(business_name))')
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      const firstError =
        sellersRes.error ?? driversRes.error ?? todayRes.error ?? activeRes.error ?? eventsRes.error;
      if (firstError) throw firstError;
      if (!mounted.current) return;

      setStats({
        pendingSellers: sellersRes.count ?? 0,
        pendingDrivers: driversRes.count ?? 0,
        ordersToday: todayRes.count ?? 0,
        activeOrders: activeRes.count ?? 0,
      });
      setActivity((eventsRes.data ?? []) as unknown as ActivityEvent[]);
    } catch (e: any) {
      notify.error(e?.message ?? 'Failed to load dashboard');
    } finally {
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const goTab = (screen: 'AdminSellers' | 'AdminDrivers' | 'AdminOrders') =>
    navigation.navigate('AdminTabs', { screen });

  const StatCard = ({
    icon,
    label,
    value,
    color,
    onPress,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    value: number;
    color: string;
    onPress: () => void;
  }) => (
    <TouchableOpacity style={styles.statCard} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.statIcon, { backgroundColor: color + '1A' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Admin overview</Text>
      </View>

      {loading && !stats ? (
        <View style={styles.center}>
          <ActivityIndicator color={lightColors.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={lightColors.primary}
            />
          }
        >
          <View style={styles.grid}>
            <StatCard
              icon="storefront-outline"
              label="Pending sellers"
              value={stats?.pendingSellers ?? 0}
              color="#E67E22"
              onPress={() => goTab('AdminSellers')}
            />
            <StatCard
              icon="car-outline"
              label="Pending drivers"
              value={stats?.pendingDrivers ?? 0}
              color="#8E44AD"
              onPress={() => goTab('AdminDrivers')}
            />
            <StatCard
              icon="receipt-outline"
              label="Orders today"
              value={stats?.ordersToday ?? 0}
              color={lightColors.primary}
              onPress={() => goTab('AdminOrders')}
            />
            <StatCard
              icon="flash-outline"
              label="Active orders"
              value={stats?.activeOrders ?? 0}
              color="#2980B9"
              onPress={() => goTab('AdminOrders')}
            />
          </View>

          <Text style={styles.sectionTitle}>Recent activity</Text>
          {activity.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="pulse-outline" size={28} color={lightColors.textMuted} />
              <Text style={styles.emptyText}>No order activity yet.</Text>
            </View>
          ) : (
            <View style={styles.activityCard}>
              {activity.map((ev, i) => (
                <TouchableOpacity
                  key={ev.id}
                  style={[styles.activityRow, i > 0 && styles.activityDivider]}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('AdminOrderDetail', { orderId: ev.order_id })}
                >
                  <View style={styles.activityIcon}>
                    <Ionicons
                      name={STATUS_ICONS[ev.status] ?? 'ellipse-outline'}
                      size={18}
                      color={lightColors.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activityTitle}>
                      {ORDER_STATUS_LABELS[ev.status] ?? ev.status}
                    </Text>
                    <Text style={styles.activitySub} numberOfLines={1}>
                      {ev.orders?.sellers?.business_name ?? 'Unknown seller'}
                      {ev.orders ? ` · ${formatMoney(ev.orders.total)}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.activityTime}>{fmtTime(ev.created_at)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  statValue: { fontSize: 26, fontWeight: '800', color: lightColors.textDark },
  statLabel: { fontSize: 13, color: lightColors.textMuted, marginTop: 2 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: lightColors.textDark,
    marginTop: 24,
    marginBottom: 10,
  },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: lightColors.divider,
  },
  emptyText: { fontSize: 14, color: lightColors.textMuted },
  activityCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    paddingHorizontal: 16,
  },
  activityRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  activityDivider: { borderTopWidth: 1, borderTopColor: lightColors.divider },
  activityIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityTitle: { fontSize: 14, fontWeight: '700', color: lightColors.textDark },
  activitySub: { fontSize: 12, color: lightColors.textMuted, marginTop: 1 },
  activityTime: { fontSize: 11, color: lightColors.textMuted },
});
