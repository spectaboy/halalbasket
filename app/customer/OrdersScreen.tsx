// HalalBasket — customer Orders tab: active orders (live tap-through to
// tracking) and past orders with reorder + rate actions.

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { lightColors, spacing } from '../../constants/theme';
import { supabase } from '../config/supabase';
import { useSession } from '../context/SessionContext';
import { useCart } from '../context/CartContext';
import { notify } from '../lib/notify';
import { formatMoney } from '../utils/pricing';
import { ORDER_STATUS_LABELS } from '../services/orders';
import type { MainStackParamList } from '../navigation/types';
import type { OrderItemRow, OrderRow, VisibleListingRow } from '../types/database';

type Nav = NativeStackNavigationProp<MainStackParamList>;

type OrderWithMeta = OrderRow & {
  order_items: OrderItemRow[];
  sellers: { business_name: string; seller_type: string } | null;
  reviews: { id: string }[] | null;
};

const ACTIVE_STATUSES = new Set([
  'pending_payment', 'paid', 'accepted', 'preparing', 'ready', 'driver_assigned', 'picked_up', 'en_route',
]);

export default function OrdersScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useSession();
  const cart = useCart();
  const [orders, setOrders] = useState<OrderWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*), sellers(business_name, seller_type), reviews(id)')
      .eq('customer_id', user.id)
      .neq('status', 'pending_payment')
      .order('placed_at', { ascending: false })
      .limit(50);
    if (!error && data) setOrders(data as unknown as OrderWithMeta[]);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const reorder = async (order: OrderWithMeta) => {
    const listingIds = order.order_items.map((i) => i.listing_id).filter(Boolean) as string[];
    if (listingIds.length === 0) {
      notify.error('Those items are no longer available.');
      return;
    }
    const { data } = await supabase.from('visible_listings').select('*').in('id', listingIds);
    const listings = (data ?? []) as VisibleListingRow[];
    if (listings.length === 0) {
      notify.error('Those items are no longer available.');
      return;
    }
    const sellerInfo = {
      sellerId: order.seller_id,
      sellerType: listings[0].seller_type,
      businessName: order.sellers?.business_name ?? '',
    };
    cart.clearCart();
    for (const listing of listings) {
      cart.addItem(listing, sellerInfo);
      const wanted = order.order_items.find((i) => i.listing_id === listing.id)?.quantity ?? 1;
      if (wanted > 1) cart.setQuantity(listing.id, wanted);
    }
    if (listings.length < listingIds.length) {
      notify.info('Some items were unavailable and were skipped.');
    }
    navigation.navigate('Cart');
  };

  const renderOrder = ({ item }: { item: OrderWithMeta }) => {
    const active = ACTIVE_STATUSES.has(item.status);
    const shortCode = item.id.replace(/-/g, '').slice(0, 8).toUpperCase();
    const itemsSummary = item.order_items
      .map((i) => `${i.quantity}× ${i.name}`)
      .slice(0, 3)
      .join(', ');
    const hasReview = (item.reviews?.length ?? 0) > 0;

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('OrderTracking', { orderId: item.id })}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.sellerName} numberOfLines={1}>
            {item.sellers?.business_name ?? 'Seller'}
          </Text>
          <View style={[styles.statusChip, active ? styles.statusActive : styles.statusDone]}>
            <Text style={[styles.statusText, active ? styles.statusTextActive : styles.statusTextDone]}>
              {ORDER_STATUS_LABELS[item.status]}
            </Text>
          </View>
        </View>
        <Text style={styles.itemsSummary} numberOfLines={1}>{itemsSummary}</Text>
        <View style={styles.cardFooter}>
          <Text style={styles.meta}>#{shortCode} · {new Date(item.placed_at).toLocaleDateString()}</Text>
          <Text style={styles.total}>{formatMoney(item.total)}</Text>
        </View>

        {item.status === 'delivered' && (
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.actionBtn} activeOpacity={0.85} onPress={() => void reorder(item)}>
              <Ionicons name="repeat" size={15} color={lightColors.primary} />
              <Text style={styles.actionText}>Reorder</Text>
            </TouchableOpacity>
            {!hasReview && (
              <TouchableOpacity
                style={styles.actionBtn}
                activeOpacity={0.85}
                onPress={() =>
                  navigation.navigate('LeaveReview', {
                    orderId: item.id,
                    sellerId: item.seller_id,
                    sellerName: item.sellers?.business_name ?? 'this seller',
                  })
                }
              >
                <Ionicons name="star-outline" size={15} color={lightColors.primary} />
                <Text style={styles.actionText}>Rate</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const activeOrders = orders.filter((o) => ACTIVE_STATUSES.has(o.status));
  const pastOrders = orders.filter((o) => !ACTIVE_STATUSES.has(o.status));

  const sections: { title: string; data: OrderWithMeta[] }[] = [
    ...(activeOrders.length ? [{ title: 'Active', data: activeOrders }] : []),
    ...(pastOrders.length ? [{ title: 'Past orders', data: pastOrders }] : []),
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>Your orders</Text>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={lightColors.primary} />
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="receipt-outline" size={56} color={lightColors.textMuted} />
          <Text style={styles.emptyTitle}>No orders yet</Text>
          <Text style={styles.emptySubtitle}>When you order, it'll show up here.</Text>
        </View>
      ) : (
        <FlatList
          data={sections.flatMap((s) => [{ header: s.title } as any, ...s.data])}
          keyExtractor={(item: any, index) => item.header ?? item.id ?? String(index)}
          renderItem={({ item }: { item: any }) =>
            item.header ? (
              <Text style={styles.sectionHeader}>{item.header}</Text>
            ) : (
              renderOrder({ item })
            )
          }
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              tintColor={lightColors.primary}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.background,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: lightColors.textDark,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: spacing.xl,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: lightColors.textDark,
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: lightColors.textMuted,
  },
  list: {
    padding: spacing.md,
    paddingBottom: 40,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '800',
    color: lightColors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: lightColors.divider,
    marginBottom: spacing.sm,
    gap: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sellerName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: lightColors.textDark,
  },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  statusActive: {
    backgroundColor: lightColors.chipBg,
  },
  statusDone: {
    backgroundColor: lightColors.inputBg,
  },
  statusText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  statusTextActive: {
    color: lightColors.primary,
  },
  statusTextDone: {
    color: lightColors.textMuted,
  },
  itemsSummary: {
    fontSize: 13.5,
    color: lightColors.textMuted,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  meta: {
    fontSize: 12.5,
    color: lightColors.textMuted,
  },
  total: {
    fontSize: 15,
    fontWeight: '800',
    color: lightColors.textDark,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: lightColors.chipBg,
    borderRadius: 9999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '700',
    color: lightColors.primary,
  },
});
