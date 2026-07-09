// HalalBasket — seller earnings: totals + per-order net rows from the
// payments split, with a Stripe Connect setup prompt when payouts unconfigured.

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
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { lightColors, spacing } from '../../constants/theme';
import { supabase } from '../config/supabase';
import { useSession } from '../context/SessionContext';
import { formatMoney } from '../utils/pricing';
import type { MainStackParamList } from '../navigation/types';
import type { PaymentRow } from '../types/database';

type Props = NativeStackScreenProps<MainStackParamList, 'SellerEarnings'>;

type PaymentWithOrder = PaymentRow & {
  orders: { placed_at: string; status: string; seller_id: string } | null;
};

export default function SellerEarningsScreen({ navigation }: Props) {
  const { user, seller } = useSession();
  const [payments, setPayments] = useState<PaymentWithOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!seller) return;
    const { data } = await supabase
      .from('payments')
      .select('*, orders!inner(placed_at, status, seller_id)')
      .eq('orders.seller_id', seller.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (data) setPayments(data as unknown as PaymentWithOrder[]);
    setLoading(false);
    setRefreshing(false);
  }, [seller]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const delivered = payments.filter((p) => p.orders?.status === 'delivered');
  const totalEarned = delivered.reduce((sum, p) => sum + p.seller_amount, 0);
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const weekEarned = delivered
    .filter((p) => p.orders && new Date(p.orders.placed_at).getTime() >= weekAgo)
    .reduce((sum, p) => sum + p.seller_amount, 0);
  const needsPayoutSetup = !user?.stripe_account_id;

  const renderRow = ({ item }: { item: PaymentWithOrder }) => {
    const shortCode = item.order_id.replace(/-/g, '').slice(0, 8).toUpperCase();
    const paidOut = item.seller_payout_status === 'completed';
    return (
      <View style={styles.row}>
        <View style={styles.rowLeft}>
          <Text style={styles.rowCode}>#{shortCode}</Text>
          <Text style={styles.rowDate}>
            {item.orders ? new Date(item.orders.placed_at).toLocaleDateString() : ''}
          </Text>
        </View>
        <View style={styles.rowRight}>
          <Text style={styles.rowNet}>{formatMoney(item.seller_amount)}</Text>
          {item.commission_amount > 0 && (
            <Text style={styles.rowCommission}>−{formatMoney(item.commission_amount)} fee</Text>
          )}
          <View style={[styles.payoutChip, paidOut ? styles.payoutDone : styles.payoutPending]}>
            <Ionicons
              name={paidOut ? 'checkmark' : 'time-outline'}
              size={11}
              color={paidOut ? lightColors.primary : lightColors.textMuted}
            />
            <Text style={[styles.payoutChipText, paidOut && styles.payoutChipTextDone]}>
              {paidOut ? 'Paid out' : 'Pending'}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={lightColors.textDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Earnings</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={lightColors.primary} />
        </View>
      ) : (
        <FlatList
          data={payments}
          keyExtractor={(p) => p.id}
          renderItem={renderRow}
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
          ListHeaderComponent={
            <View style={styles.summaryBlock}>
              <View style={styles.summaryRow}>
                <View style={[styles.summaryCard, styles.summaryHero]}>
                  <Text style={styles.summaryHeroLabel}>Total earned</Text>
                  <Text style={styles.summaryHeroValue}>{formatMoney(totalEarned)}</Text>
                </View>
              </View>
              <View style={styles.summaryRow}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>This week</Text>
                  <Text style={styles.summaryValue}>{formatMoney(weekEarned)}</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Orders</Text>
                  <Text style={styles.summaryValue}>{delivered.length}</Text>
                </View>
              </View>

              {seller?.seller_type === 'home_cook' && (
                <View style={styles.homeCookNote}>
                  <Ionicons name="heart" size={15} color={lightColors.primary} />
                  <Text style={styles.homeCookNoteText}>
                    Home cooks pay no commission — you keep 100% of your food price.
                  </Text>
                </View>
              )}

              {needsPayoutSetup && (
                <TouchableOpacity
                  style={styles.setupCard}
                  activeOpacity={0.9}
                  onPress={() => navigation.navigate('StripeConnect')}
                >
                  <Ionicons name="card-outline" size={22} color={lightColors.primary} />
                  <View style={styles.setupBody}>
                    <Text style={styles.setupTitle}>Set up payouts</Text>
                    <Text style={styles.setupSubtitle}>
                      Connect your bank to receive your earnings automatically.
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={lightColors.textMuted} />
                </TouchableOpacity>
              )}

              {payments.length > 0 && <Text style={styles.sectionHeader}>Order history</Text>}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="cash-outline" size={56} color={lightColors.textMuted} />
              <Text style={styles.emptyTitle}>No earnings yet</Text>
              <Text style={styles.emptySubtitle}>Completed orders will show up here.</Text>
            </View>
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
  summaryBlock: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: lightColors.divider,
    gap: 4,
  },
  summaryHero: {
    backgroundColor: lightColors.primary,
    borderColor: lightColors.primary,
  },
  summaryHeroLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.75)',
  },
  summaryHeroValue: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  summaryLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: lightColors.textMuted,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '800',
    color: lightColors.textDark,
  },
  homeCookNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: lightColors.chipBg,
    borderRadius: 12,
    padding: spacing.md,
  },
  homeCookNoteText: {
    flex: 1,
    fontSize: 13,
    color: lightColors.primary,
    fontWeight: '600',
  },
  setupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: lightColors.primary,
  },
  setupBody: {
    flex: 1,
  },
  setupTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: lightColors.textDark,
  },
  setupSubtitle: {
    fontSize: 13,
    color: lightColors.textMuted,
    marginTop: 2,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '800',
    color: lightColors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: lightColors.divider,
    marginBottom: spacing.sm,
  },
  rowLeft: {
    gap: 2,
  },
  rowCode: {
    fontSize: 14.5,
    fontWeight: '700',
    color: lightColors.textDark,
  },
  rowDate: {
    fontSize: 12.5,
    color: lightColors.textMuted,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 3,
  },
  rowNet: {
    fontSize: 15,
    fontWeight: '800',
    color: lightColors.textDark,
  },
  rowCommission: {
    fontSize: 12,
    color: lightColors.textMuted,
  },
  payoutChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 9999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  payoutDone: {
    backgroundColor: lightColors.chipBg,
  },
  payoutPending: {
    backgroundColor: lightColors.inputBg,
  },
  payoutChipText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: lightColors.textMuted,
  },
  payoutChipTextDone: {
    color: lightColors.primary,
  },
});
