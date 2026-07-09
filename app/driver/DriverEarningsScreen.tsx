// Earnings tab (adapted from URide's DriverEarningsScreen): total earned /
// this week / delivery count from payments.driver_amount joined through orders,
// per-delivery rows with payout status chips, and a Stripe Connect CTA when the
// driver has no payout account yet.

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
import { formatMoney } from '../utils/pricing';
import { logger } from '../utils/logger';
import BackgroundPattern from '../components/BackgroundPattern';
import type { OrderRow, PaymentRow, PayoutStatus } from '../types/database';
import type { MainStackParamList } from '../navigation/types';

interface EarningRow extends PaymentRow {
  order: (OrderRow & { seller: { business_name: string } | null }) | null;
}

const PAYOUT_CHIPS: Record<PayoutStatus, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: '#B9770E', bg: 'rgba(255,152,0,0.12)' },
  completed: { label: 'Paid out', color: lightColors.primary, bg: lightColors.chipBg },
  failed: { label: 'Failed', color: lightColors.error, bg: 'rgba(231,76,60,0.10)' },
  not_applicable: { label: 'N/A', color: lightColors.textMuted, bg: lightColors.inputBg },
};

const shortenAddress = (addr: string | null | undefined): string => {
  if (!addr) return '—';
  return addr.split(',')[0].trim();
};

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });

/** Start of the current week (Monday, local time). */
const startOfWeek = (): Date => {
  const now = new Date();
  const daysSinceMonday = (now.getDay() + 6) % 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday);
};

export default function DriverEarningsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { user, driver } = useSession();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [earnings, setEarnings] = useState<EarningRow[]>([]);

  const loadEarnings = useCallback(async () => {
    if (!driver) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('*, order:orders!inner(*, seller:sellers(business_name))')
        .eq('order.driver_id', driver.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setEarnings((data ?? []) as unknown as EarningRow[]);
      setLoadError(null);
    } catch (err: any) {
      logger.error('Supabase', 'driver earnings load failed', { error: err?.message });
      setLoadError('Could not load your earnings');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [driver]);

  useFocusEffect(
    useCallback(() => {
      void loadEarnings();
    }, [loadEarnings])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadEarnings();
  }, [loadEarnings]);

  const delivered = earnings.filter((e) => e.order?.status === 'delivered');
  const totalEarned = delivered.reduce((sum, e) => sum + Number(e.driver_amount), 0);
  const weekStart = startOfWeek();
  const thisWeek = delivered
    .filter((e) => {
      const deliveredAt = e.order?.delivered_at;
      return deliveredAt ? new Date(deliveredAt) >= weekStart : false;
    })
    .reduce((sum, e) => sum + Number(e.driver_amount), 0);

  const needsPayoutSetup = !user?.stripe_account_id;

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <BackgroundPattern />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={lightColors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <BackgroundPattern />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Earnings</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('StripeConnect')}
          style={styles.settingsBtn}
          activeOpacity={0.8}
        >
          <Ionicons name="card-outline" size={20} color={lightColors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={lightColors.primary} />
        }
      >
        {/* Summary cards */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total earned</Text>
            <Text style={styles.summaryValue}>{formatMoney(totalEarned)}</Text>
            <Text style={styles.summaryMeta}>
              {delivered.length} deliver{delivered.length === 1 ? 'y' : 'ies'}
            </Text>
          </View>
          <View style={[styles.summaryCard, styles.summaryCardAccent]}>
            <Text style={[styles.summaryLabel, styles.summaryLabelOnAccent]}>This week</Text>
            <Text style={[styles.summaryValue, styles.summaryValueOnAccent]}>{formatMoney(thisWeek)}</Text>
            <Text style={[styles.summaryMeta, styles.summaryMetaOnAccent]}>since Monday</Text>
          </View>
        </View>

        {/* Payout setup CTA */}
        {needsPayoutSetup ? (
          <TouchableOpacity
            style={styles.payoutCta}
            onPress={() => navigation.navigate('StripeConnect')}
            activeOpacity={0.9}
          >
            <View style={styles.payoutCtaIcon}>
              <Ionicons name="card-outline" size={22} color={lightColors.primary} />
            </View>
            <View style={styles.payoutCtaTextWrap}>
              <Text style={styles.payoutCtaTitle}>Set up payouts</Text>
              <Text style={styles.payoutCtaBody}>
                Connect your bank account to receive your delivery earnings.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={lightColors.primary} />
          </TouchableOpacity>
        ) : null}

        <Text style={styles.sectionTitle}>Delivery history</Text>

        {loadError ? (
          <View style={styles.emptyState}>
            <Ionicons name="cloud-offline-outline" size={40} color={lightColors.textMuted} />
            <Text style={styles.emptyTitle}>{loadError}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => void loadEarnings()}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : earnings.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="receipt-outline" size={40} color={lightColors.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No earnings yet</Text>
            <Text style={styles.emptyText}>Complete your first delivery to start earning.</Text>
          </View>
        ) : (
          earnings.map((row) => {
            const chip = PAYOUT_CHIPS[row.driver_payout_status] ?? PAYOUT_CHIPS.pending;
            return (
              <View key={row.id} style={styles.earningCard}>
                <View style={styles.earningLeft}>
                  <Text style={styles.earningRoute} numberOfLines={1}>
                    {row.order?.seller?.business_name ?? 'Delivery'} →{' '}
                    {shortenAddress(row.order?.delivery_address)}
                  </Text>
                  <Text style={styles.earningDate}>
                    {formatDate(row.order?.delivered_at ?? row.created_at)}
                  </Text>
                </View>
                <View style={styles.earningRight}>
                  <Text style={styles.earningAmount}>+{formatMoney(Number(row.driver_amount))}</Text>
                  <View style={[styles.payoutChip, { backgroundColor: chip.bg }]}>
                    <Text style={[styles.payoutChipText, { color: chip.color }]}>{chip.label}</Text>
                  </View>
                </View>
              </View>
            );
          })
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: lightColors.textDark,
  },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
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

  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
  },
  summaryCardAccent: {
    backgroundColor: lightColors.primary,
    borderColor: lightColors.primary,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: lightColors.textMuted,
    marginBottom: 6,
  },
  summaryLabelOnAccent: { color: 'rgba(255,255,255,0.85)' },
  summaryValue: {
    fontSize: 24,
    fontWeight: '800',
    color: lightColors.textDark,
    marginBottom: 2,
  },
  summaryValueOnAccent: { color: '#fff' },
  summaryMeta: {
    fontSize: 12,
    color: lightColors.textMuted,
  },
  summaryMetaOnAccent: { color: 'rgba(255,255,255,0.7)' },

  payoutCta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightColors.chipBg,
    borderRadius: 16,
    padding: 16,
    marginBottom: spacing.md,
  },
  payoutCtaIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: lightColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  payoutCtaTextWrap: { flex: 1 },
  payoutCtaTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: lightColors.textDark,
    marginBottom: 2,
  },
  payoutCtaBody: {
    fontSize: 13,
    lineHeight: 18,
    color: lightColors.textMuted,
  },

  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: lightColors.textDark,
    marginBottom: spacing.sm,
  },
  earningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    marginBottom: spacing.sm,
  },
  earningLeft: {
    flex: 1,
    marginRight: spacing.sm,
  },
  earningRoute: {
    fontSize: 14,
    fontWeight: '700',
    color: lightColors.textDark,
    marginBottom: 2,
  },
  earningDate: {
    fontSize: 13,
    color: lightColors.textMuted,
  },
  earningRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  earningAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: lightColors.primary,
  },
  payoutChip: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  payoutChipText: {
    fontSize: 11,
    fontWeight: '700',
  },

  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
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
