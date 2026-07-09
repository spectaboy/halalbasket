// SellerOrdersScreen — the incoming-order feed tab.
// Realtime via OrderService.subscribeToSellerOrders on top of an initial fetch.
// Sections: New (paid) -> In progress (accepted/preparing) -> Ready & out for
// delivery -> Past. Inline one-tap status transitions.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { lightColors, spacing } from '../../constants/theme';
import BackgroundPattern from '../components/BackgroundPattern';
import { notify } from '../lib/notify';
import { logger } from '../utils/logger';
import { useScreenLogger } from '../utils/loggerHooks';
import { supabase } from '../config/supabase';
import { OrderService, ORDER_STATUS_LABELS } from '../services/orders';
import { useSession } from '../context/SessionContext';
import { formatMoney } from '../utils/pricing';
import type { MainStackParamList, SellerTabParamList } from '../navigation/types';
import type { OrderItemRow, OrderRow, OrderStatus } from '../types/database';

type Props = CompositeScreenProps<
  BottomTabScreenProps<SellerTabParamList, 'SellerOrders'>,
  NativeStackScreenProps<MainStackParamList>
>;

type OrderWithItems = OrderRow & { order_items?: OrderItemRow[] };

interface OrderSection {
  key: string;
  title: string;
  data: OrderWithItems[];
}

const NEXT_ACTION: Partial<Record<OrderStatus, { label: string; next: OrderStatus; icon: keyof typeof Ionicons.glyphMap }>> = {
  paid: { label: 'Accept', next: 'accepted', icon: 'checkmark' },
  accepted: { label: 'Start preparing', next: 'preparing', icon: 'flame-outline' },
  preparing: { label: 'Mark ready', next: 'ready', icon: 'bag-check-outline' },
};

const timeAgo = (iso: string): string => {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const shortId = (id: string) => `#${id.slice(0, 8).toUpperCase()}`;

export default function SellerOrdersScreen({ navigation }: Props) {
  useScreenLogger('SellerOrdersScreen');
  const { seller } = useSession();

  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [customerNames, setCustomerNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Orders that arrived over realtime while this screen is open — subtle highlight.
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [actingOn, setActingOn] = useState<string | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());

  const sellerId = seller?.id;

  const loadNames = useCallback(async (customerIds: string[]) => {
    if (customerIds.length === 0) return;
    // Best effort: users RLS may hide customer rows from sellers; fall back to "Customer".
    const { data } = await supabase.from('users').select('id, first_name').in('id', customerIds);
    if (!data) return;
    setCustomerNames((prev) => {
      const next = { ...prev };
      for (const row of data as Array<{ id: string; first_name: string | null }>) {
        if (row.first_name) next[row.id] = row.first_name;
      }
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    if (!sellerId) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('seller_id', sellerId)
        .neq('status', 'pending_payment')
        .order('placed_at', { ascending: false })
        .limit(100);
      if (err) throw err;
      const rows = (data as unknown as OrderWithItems[]) ?? [];
      setOrders(rows);
      knownIdsRef.current = new Set(rows.map((r) => r.id));
      void loadNames(Array.from(new Set(rows.map((r) => r.customer_id))));
    } catch (e: unknown) {
      logger.error('Supabase', 'seller orders load failed', { error: e instanceof Error ? e.message : String(e) });
      setError("We couldn't load your orders.");
    } finally {
      setLoading(false);
    }
  }, [sellerId, loadNames]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime feed — merge changed rows, flag brand-new paid orders.
  useEffect(() => {
    if (!sellerId) return;
    const channel = OrderService.subscribeToSellerOrders(sellerId, (order) => {
      if (order.status === 'pending_payment') return;
      const isNew = !knownIdsRef.current.has(order.id);
      knownIdsRef.current.add(order.id);
      setOrders((prev) => {
        const idx = prev.findIndex((o) => o.id === order.id);
        if (idx === -1) return [{ ...order }, ...prev];
        const next = [...prev];
        // keep previously-fetched order_items — realtime payloads don't include them
        next[idx] = { ...next[idx], ...order };
        return next;
      });
      if (isNew && order.status === 'paid') {
        setFreshIds((prev) => new Set(prev).add(order.id));
        notify.info('New order just came in!');
        // Realtime rows don't carry joined items — fetch them quietly.
        void supabase
          .from('order_items')
          .select('*')
          .eq('order_id', order.id)
          .then(({ data }) => {
            if (!data) return;
            setOrders((prev) =>
              prev.map((o) => (o.id === order.id ? { ...o, order_items: data as OrderItemRow[] } : o))
            );
          });
        void loadNames([order.customer_id]);
      }
    });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sellerId, loadNames]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const advance = async (order: OrderWithItems) => {
    const action = NEXT_ACTION[order.status];
    if (!action || actingOn) return;
    setActingOn(order.id);
    try {
      await OrderService.updateStatus(order.id, action.next);
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: action.next } : o)));
      setFreshIds((prev) => {
        if (!prev.has(order.id)) return prev;
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
      notify.success(`Order ${shortId(order.id)} — ${ORDER_STATUS_LABELS[action.next].toLowerCase()}.`);
    } catch {
      notify.error("Couldn't update the order. Try again.");
    } finally {
      setActingOn(null);
    }
  };

  const sections: OrderSection[] = (() => {
    const news: OrderWithItems[] = [];
    const inProgress: OrderWithItems[] = [];
    const ready: OrderWithItems[] = [];
    const past: OrderWithItems[] = [];
    for (const o of orders) {
      if (o.status === 'paid') news.push(o);
      else if (o.status === 'accepted' || o.status === 'preparing') inProgress.push(o);
      else if (o.status === 'ready' || o.status === 'driver_assigned' || o.status === 'picked_up' || o.status === 'en_route')
        ready.push(o);
      else past.push(o);
    }
    const out: OrderSection[] = [];
    if (news.length) out.push({ key: 'new', title: 'New', data: news });
    if (inProgress.length) out.push({ key: 'progress', title: 'In progress', data: inProgress });
    if (ready.length) out.push({ key: 'ready', title: 'Ready & out for delivery', data: ready });
    if (past.length) out.push({ key: 'past', title: 'Past', data: past });
    return out;
  })();

  const itemsSummary = (o: OrderWithItems) => {
    const items = o.order_items ?? [];
    if (items.length === 0) return 'Order details inside';
    const text = items.map((i) => `${i.quantity}× ${i.name}`).join(', ');
    return text.length > 64 ? `${text.slice(0, 61)}…` : text;
  };

  const renderOrder = ({ item }: { item: OrderWithItems }) => {
    const action = NEXT_ACTION[item.status];
    const fresh = freshIds.has(item.id);
    const isPast = item.status === 'delivered' || item.status === 'cancelled' || item.status === 'refunded';
    return (
      <TouchableOpacity
        style={[styles.card, fresh && styles.cardFresh, isPast && styles.cardPast]}
        activeOpacity={0.85}
        onPress={() => {
          setFreshIds((prev) => {
            if (!prev.has(item.id)) return prev;
            const next = new Set(prev);
            next.delete(item.id);
            return next;
          });
          navigation.navigate('SellerOrderDetail', { orderId: item.id });
        }}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.orderId}>{shortId(item.id)}</Text>
          {fresh && (
            <View style={styles.newChip}>
              <Text style={styles.newChipText}>NEW</Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
          <Text style={styles.timeAgo}>{timeAgo(item.placed_at)}</Text>
        </View>
        <Text style={styles.itemsSummary} numberOfLines={2}>
          {itemsSummary(item)}
        </Text>
        <View style={styles.cardMetaRow}>
          <Ionicons name="person-outline" size={13} color={lightColors.textMuted} />
          <Text style={styles.metaText}>{customerNames[item.customer_id] ?? 'Customer'}</Text>
          <View style={styles.metaDot} />
          <Text style={styles.totalText}>{formatMoney(Number(item.total))}</Text>
          <View style={{ flex: 1 }} />
          <View style={styles.statusChip}>
            <Text style={styles.statusChipText}>{ORDER_STATUS_LABELS[item.status]}</Text>
          </View>
        </View>
        {action && (
          <TouchableOpacity
            style={[styles.actionBtn, actingOn === item.id && { opacity: 0.6 }]}
            onPress={() => void advance(item)}
            disabled={actingOn === item.id}
            activeOpacity={0.85}
          >
            {actingOn === item.id ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name={action.icon} size={16} color="#FFFFFF" />
                <Text style={styles.actionBtnText}>{action.label}</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <BackgroundPattern />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Orders</Text>
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={lightColors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centerFill}>
          <Ionicons name="cloud-offline-outline" size={40} color={lightColors.textMuted} />
          <Text style={styles.emptyTitle}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void load()}>
            <Text style={styles.retryBtnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderOrder}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <View style={styles.countPill}>
                <Text style={styles.countPillText}>{section.data.length}</Text>
              </View>
            </View>
          )}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={lightColors.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="receipt-outline" size={34} color={lightColors.primary} />
              </View>
              <Text style={styles.emptyTitle}>No orders yet</Text>
              <Text style={styles.emptySubtitle}>
                When customers order from you, they'll appear here in real time.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: lightColors.background },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  header: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  headerTitle: { fontSize: 20, fontWeight: '800', color: lightColors.textDark },
  listContent: { padding: spacing.md, paddingBottom: 40, flexGrow: 1 },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: spacing.sm,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: lightColors.textDark },
  countPill: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  countPillText: { fontSize: 12, fontWeight: '800', color: lightColors.primary },

  card: {
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    marginBottom: spacing.sm + 4,
  },
  cardFresh: {
    borderColor: 'rgba(39,174,96,0.55)',
    backgroundColor: '#F6FCF8',
    shadowColor: lightColors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  cardPast: { opacity: 0.72 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  orderId: { fontSize: 13.5, fontWeight: '800', color: lightColors.textDark, letterSpacing: 0.3 },
  newChip: {
    backgroundColor: lightColors.primary,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  newChipText: { color: '#FFFFFF', fontSize: 9.5, fontWeight: '800', letterSpacing: 0.5 },
  timeAgo: { fontSize: 12, color: lightColors.textMuted, fontWeight: '600' },
  itemsSummary: { fontSize: 13.5, color: lightColors.textDark, marginTop: 8, lineHeight: 19 },

  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  metaText: { fontSize: 12.5, color: lightColors.textMuted, fontWeight: '600' },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: lightColors.textMuted, marginHorizontal: 3 },
  totalText: { fontSize: 13, fontWeight: '800', color: lightColors.textDark },
  statusChip: {
    backgroundColor: lightColors.chipBg,
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusChipText: { fontSize: 11, fontWeight: '700', color: lightColors.primary },

  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: lightColors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 12,
  },
  actionBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl },
  emptyIconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: lightColors.textDark,
    textAlign: 'center',
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 13.5,
    color: lightColors.textMuted,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 6,
    paddingHorizontal: 32,
  },
  retryBtn: {
    marginTop: spacing.md,
    backgroundColor: lightColors.chipBg,
    borderRadius: 9999,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryBtnText: { color: lightColors.primary, fontWeight: '700' },
});
