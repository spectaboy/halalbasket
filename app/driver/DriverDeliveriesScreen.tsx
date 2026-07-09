// Deliveries tab — the driver's delivery history: any in-flight delivery pinned
// on top (tap to resume), followed by completed deliveries with the fee earned.

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { lightColors, spacing } from '../../constants/theme';
import { supabase } from '../config/supabase';
import { useSession } from '../context/SessionContext';
import { ORDER_STATUS_LABELS } from '../services/orders';
import { formatMoney } from '../utils/pricing';
import { logger } from '../utils/logger';
import BackgroundPattern from '../components/BackgroundPattern';
import type { OrderRow, OrderStatus } from '../types/database';
import type { MainStackParamList } from '../navigation/types';

const ACTIVE_STATUSES: OrderStatus[] = ['driver_assigned', 'picked_up', 'en_route'];

interface DeliveryListRow extends OrderRow {
  seller: { business_name: string } | null;
}

const shortenAddress = (addr: string | null | undefined): string => {
  if (!addr) return '—';
  return addr.split(',')[0].trim();
};

const formatDate = (iso: string | null): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function DriverDeliveriesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { driver } = useSession();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryListRow[]>([]);

  const loadDeliveries = useCallback(async () => {
    if (!driver) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*, seller:sellers(business_name)')
        .eq('driver_id', driver.id)
        .in('status', [...ACTIVE_STATUSES, 'delivered'])
        .order('placed_at', { ascending: false });
      if (error) throw error;
      setDeliveries((data ?? []) as unknown as DeliveryListRow[]);
      setLoadError(null);
    } catch (err: any) {
      logger.error('Supabase', 'driver deliveries load failed', { error: err?.message });
      setLoadError('Could not load your deliveries');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [driver]);

  useFocusEffect(
    useCallback(() => {
      void loadDeliveries();
    }, [loadDeliveries])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadDeliveries();
  }, [loadDeliveries]);

  const inFlight = deliveries.filter((d) => ACTIVE_STATUSES.includes(d.status));
  const completed = deliveries.filter((d) => d.status === 'delivered');

  const renderInFlightCard = (item: DeliveryListRow) => (
    <TouchableOpacity
      key={item.id}
      style={styles.inFlightCard}
      onPress={() => navigation.navigate('ActiveDelivery', { orderId: item.id })}
      activeOpacity={0.9}
    >
      <View style={styles.inFlightIcon}>
        <Ionicons name="navigate" size={20} color="#fff" />
      </View>
      <View style={styles.cardTextWrap}>
        <Text style={styles.inFlightTitle} numberOfLines={1}>
          {item.seller?.business_name ?? 'Pickup'} → {shortenAddress(item.delivery_address)}
        </Text>
        <Text style={styles.inFlightSubtitle}>{ORDER_STATUS_LABELS[item.status]} · tap to resume</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#fff" />
    </TouchableOpacity>
  );

  const renderCompletedCard = (item: DeliveryListRow) => (
    <View key={item.id} style={styles.deliveryCard}>
      <View style={styles.deliveryIcon}>
        <Ionicons name="checkmark" size={16} color={lightColors.primary} />
      </View>
      <View style={styles.cardTextWrap}>
        <Text style={styles.deliveryRoute} numberOfLines={1}>
          {item.seller?.business_name ?? 'Pickup'} → {shortenAddress(item.delivery_address)}
        </Text>
        <Text style={styles.deliveryDate}>{formatDate(item.delivered_at ?? item.placed_at)}</Text>
      </View>
      <Text style={styles.deliveryAmount}>+{formatMoney(item.delivery_fee)}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <BackgroundPattern />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Deliveries</Text>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={lightColors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={lightColors.primary} />
          }
        >
          {loadError ? (
            <View style={styles.emptyState}>
              <Ionicons name="cloud-offline-outline" size={40} color={lightColors.textMuted} />
              <Text style={styles.emptyTitle}>{loadError}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => void loadDeliveries()}>
                <Text style={styles.retryBtnText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : deliveries.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="cube-outline" size={40} color={lightColors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>No deliveries yet</Text>
              <Text style={styles.emptyText}>
                Go online from the Deliver tab to accept your first delivery.
              </Text>
            </View>
          ) : (
            <>
              {inFlight.length > 0 ? (
                <>
                  <Text style={styles.sectionTitle}>In progress</Text>
                  {inFlight.map(renderInFlightCard)}
                </>
              ) : null}

              {completed.length > 0 ? (
                <>
                  <Text style={styles.sectionTitle}>Completed</Text>
                  {completed.map(renderCompletedCard)}
                </>
              ) : null}
            </>
          )}
          <View style={styles.bottomSpacer} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.background,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: lightColors.textDark,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    padding: spacing.md,
    paddingTop: spacing.xs,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: lightColors.textDark,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },

  inFlightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightColors.primary,
    borderRadius: 16,
    padding: 16,
    marginBottom: spacing.sm,
  },
  inFlightIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  cardTextWrap: { flex: 1 },
  inFlightTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  inFlightSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
  },

  deliveryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    marginBottom: spacing.sm,
  },
  deliveryIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  deliveryRoute: {
    fontSize: 14,
    fontWeight: '700',
    color: lightColors.textDark,
    marginBottom: 2,
  },
  deliveryDate: {
    fontSize: 13,
    color: lightColors.textMuted,
  },
  deliveryAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: lightColors.primary,
    marginLeft: spacing.sm,
  },

  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl * 2,
    paddingHorizontal: spacing.lg,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: lightColors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: lightColors.textDark,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    color: lightColors.textMuted,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: lightColors.chipBg,
  },
  retryBtnText: {
    color: lightColors.primary,
    fontWeight: '700',
    fontSize: 14,
  },
  bottomSpacer: {
    height: 40,
  },
});
