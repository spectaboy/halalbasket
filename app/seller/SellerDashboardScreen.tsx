// SellerDashboardScreen — the seller's home tab.
// Open/closed toggle, today's numbers, pending-order badge, quick actions,
// and (home cooks) the compliance-progress nudge. Falls back to the
// verification-pending presentation while the application is under review.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { lightColors, spacing } from '../../constants/theme';
import BackgroundPattern from '../components/BackgroundPattern';
import { notify } from '../lib/notify';
import { logger } from '../utils/logger';
import { useScreenLogger } from '../utils/loggerHooks';
import { supabase } from '../config/supabase';
import { useSession } from '../context/SessionContext';
import { formatMoney } from '../utils/pricing';
import type { MainStackParamList, SellerTabParamList } from '../navigation/types';
import type { OrderStatus, PermitStatus, SellerRow } from '../types/database';

type Props = CompositeScreenProps<
  BottomTabScreenProps<SellerTabParamList, 'SellerDashboard'>,
  NativeStackScreenProps<MainStackParamList>
>;

const REVENUE_STATUSES: OrderStatus[] = [
  'accepted',
  'preparing',
  'ready',
  'driver_assigned',
  'picked_up',
  'en_route',
  'delivered',
];

const PERMIT_LADDER: PermitStatus[] = ['none', 'course_done', 'permit_applied', 'inspection_scheduled', 'approved'];

interface TodayStats {
  ordersToday: number;
  revenueToday: number;
  pendingCount: number;
}

export default function SellerDashboardScreen({ navigation }: Props) {
  useScreenLogger('SellerDashboardScreen');
  const { seller, refresh } = useSession();

  const [isOpen, setIsOpen] = useState<boolean>(seller?.is_open ?? false);
  const [togglingOpen, setTogglingOpen] = useState(false);
  const [stats, setStats] = useState<TodayStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const sellerId = seller?.id;
  const approved = seller?.verification_status === 'approved';
  const isHomeCook = seller?.seller_type === 'home_cook';

  useEffect(() => {
    setIsOpen(seller?.is_open ?? false);
  }, [seller?.is_open]);

  // While pending, watch for the approval decision so the dashboard flips live.
  useEffect(() => {
    if (!sellerId || approved) return;
    const channel = supabase
      .channel(`seller-dashboard-verification:${sellerId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sellers', filter: `id=eq.${sellerId}` },
        (payload: { new: SellerRow }) => {
          if (payload.new?.verification_status === 'approved') {
            notify.success("You're approved — your shop is live-ready!");
          }
          void refresh();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sellerId, approved, refresh]);

  const loadStats = useCallback(async () => {
    if (!sellerId) return;
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from('orders')
        .select('id, status, subtotal, commission_amount, placed_at')
        .eq('seller_id', sellerId)
        .gte('placed_at', startOfDay.toISOString());
      if (error) throw error;
      const rows = data ?? [];
      const counted = rows.filter(
        (r) => r.status !== 'pending_payment' && r.status !== 'cancelled' && r.status !== 'refunded'
      );
      const revenue = counted
        .filter((r) => REVENUE_STATUSES.includes(r.status as OrderStatus))
        .reduce((sum, r) => sum + Number(r.subtotal) - Number(r.commission_amount), 0);
      // Pending (new) orders aren't limited to today — count everything awaiting acceptance.
      const { count } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('seller_id', sellerId)
        .eq('status', 'paid');
      setStats({ ordersToday: counted.length, revenueToday: revenue, pendingCount: count ?? 0 });
    } catch (e: unknown) {
      logger.error('Supabase', 'dashboard stats failed', { error: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoadingStats(false);
    }
  }, [sellerId]);

  useFocusEffect(
    useCallback(() => {
      void loadStats();
    }, [loadStats])
  );

  // Live order feed keeps the pending badge honest without polling.
  useEffect(() => {
    if (!sellerId || !approved) return;
    const channel = supabase
      .channel(`seller-dashboard-orders:${sellerId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `seller_id=eq.${sellerId}` },
        () => void loadStats()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sellerId, approved, loadStats]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refresh(), loadStats()]);
    setRefreshing(false);
  }, [refresh, loadStats]);

  const toggleOpen = async (next: boolean) => {
    if (!sellerId || togglingOpen) return;
    setTogglingOpen(true);
    setIsOpen(next); // optimistic — the switch should feel instant
    const { error } = await supabase.from('sellers').update({ is_open: next }).eq('id', sellerId);
    setTogglingOpen(false);
    if (error) {
      setIsOpen(!next);
      notify.error("Couldn't update your shop status. Try again.");
      return;
    }
    notify.success(next ? "You're open — orders can come in!" : "You're closed. Rest well!");
    void refresh();
  };

  const permitStepIndex = useMemo(
    () => (seller ? PERMIT_LADDER.indexOf(seller.permit_status) : 0),
    [seller]
  );

  // ── No seller record: gentle push into onboarding ────────────────────────
  if (!seller) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <BackgroundPattern />
        <View style={styles.emptyWrap}>
          <View style={styles.heroCircle}>
            <Ionicons name="storefront-outline" size={48} color={lightColors.primary} />
          </View>
          <Text style={styles.emptyTitle}>Start selling on HalalBasket</Text>
          <Text style={styles.emptySubtitle}>
            Restaurants, butchers, farms and home cooks — there's a place for you here.
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => navigation.navigate('SellerOnboarding')}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>Become a seller</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Pending / rejected: verification-pending presentation ───────────────
  if (!approved) {
    const rejected = seller.verification_status === 'rejected';
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <BackgroundPattern />
        <ScrollView
          contentContainerStyle={styles.pendingScroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={lightColors.primary} />}
        >
          <View style={styles.heroCircleOuter}>
            <View style={styles.heroCircle}>
              <Ionicons
                name={rejected ? 'refresh-outline' : 'time-outline'}
                size={48}
                color={rejected ? lightColors.error : lightColors.primary}
              />
            </View>
          </View>
          <Text style={styles.emptyTitle}>
            {rejected ? 'Your application needs an update' : "We're reviewing your application"}
          </Text>
          <Text style={styles.emptySubtitle}>
            {rejected
              ? seller.rejection_reason || 'Our team flagged an issue with your application.'
              : "Hang tight — most sellers are approved within 1–2 business days. We'll notify you the moment it's done."}
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => navigation.navigate('SellerVerificationPending')}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>{rejected ? 'Review & resubmit' : 'View application status'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Approved dashboard ───────────────────────────────────────────────────
  const quickActions: Array<{
    key: string;
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    onPress: () => void;
  }> = [
    { key: 'listing', icon: 'add-circle-outline', label: 'Add listing', onPress: () => navigation.navigate('EditListing', {}) },
    ...(isHomeCook
      ? [{ key: 'drop', icon: 'calendar-outline' as const, label: 'New meal drop', onPress: () => navigation.navigate('CreatePreOrderWindow', {}) }]
      : []),
    { key: 'earnings', icon: 'cash-outline', label: 'Earnings', onPress: () => navigation.navigate('SellerEarnings') },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <BackgroundPattern />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={lightColors.primary} />}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>Salaam 👋</Text>
            <Text style={styles.businessName} numberOfLines={1}>
              {seller.business_name}
            </Text>
          </View>
          {seller.avg_rating != null && (
            <View style={styles.ratingPill}>
              <Ionicons name="star" size={14} color="#E9A23B" />
              <Text style={styles.ratingPillText}>{Number(seller.avg_rating).toFixed(1)}</Text>
            </View>
          )}
        </View>

        {/* Open / closed — the big satisfying switch */}
        <View style={[styles.openCard, isOpen ? styles.openCardOn : styles.openCardOff]}>
          <View style={{ flex: 1 }}>
            <View style={styles.openStateRow}>
              <View style={[styles.openDot, { backgroundColor: isOpen ? '#2ECC71' : lightColors.textMuted }]} />
              <Text style={styles.openTitle}>{isOpen ? "You're open" : "You're closed"}</Text>
            </View>
            <Text style={styles.openSubtitle}>
              {isOpen
                ? isHomeCook
                  ? 'Your meal drops are visible to customers.'
                  : 'Customers can order from you right now.'
                : 'Flip the switch when you\'re ready to take orders.'}
            </Text>
          </View>
          <Switch
            value={isOpen}
            onValueChange={toggleOpen}
            disabled={togglingOpen}
            trackColor={{ false: 'rgba(0,0,0,0.10)', true: 'rgba(46,204,113,0.45)' }}
            thumbColor={isOpen ? lightColors.primary : '#FFFFFF'}
            ios_backgroundColor="rgba(0,0,0,0.10)"
            style={styles.bigSwitch}
          />
        </View>

        {/* Today's stats */}
        <Text style={styles.sectionTitle}>Today</Text>
        {loadingStats ? (
          <View style={styles.statsLoading}>
            <ActivityIndicator color={lightColors.primary} />
          </View>
        ) : (
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats?.ordersToday ?? 0}</Text>
              <Text style={styles.statLabel}>Orders</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{formatMoney(stats?.revenueToday ?? 0)}</Text>
              <Text style={styles.statLabel}>Revenue</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>
                {seller.avg_rating != null ? Number(seller.avg_rating).toFixed(1) : '—'}
              </Text>
              <Text style={styles.statLabel}>Avg rating</Text>
            </View>
          </View>
        )}

        {/* Pending orders */}
        <TouchableOpacity
          style={styles.pendingCard}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('SellerOrders')}
        >
          <View style={styles.pendingIconWrap}>
            <Ionicons name="receipt-outline" size={20} color={lightColors.primary} />
            {(stats?.pendingCount ?? 0) > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{stats?.pendingCount}</Text>
              </View>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.pendingTitle}>
              {(stats?.pendingCount ?? 0) > 0
                ? `${stats?.pendingCount} new order${(stats?.pendingCount ?? 0) === 1 ? '' : 's'} waiting`
                : 'No new orders right now'}
            </Text>
            <Text style={styles.pendingSubtitle}>
              {(stats?.pendingCount ?? 0) > 0 ? 'Tap to accept them' : "We'll light this up when one arrives"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={lightColors.textMuted} />
        </TouchableOpacity>

        {/* Compliance nudge (home cooks not yet fully permitted) */}
        {isHomeCook && seller.permit_status !== 'approved' && (
          <TouchableOpacity
            style={styles.complianceCard}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('SellerCompliance')}
          >
            <View style={styles.complianceHeader}>
              <View style={styles.complianceIconWrap}>
                <Ionicons name="trending-up-outline" size={20} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.complianceTitle}>Unlock full meal listings</Text>
                <Text style={styles.complianceSubtitle}>
                  {permitStepIndex === 0
                    ? 'Start with the food handler course — we\'ll walk you through it.'
                    : `You're ${permitStepIndex} of ${PERMIT_LADDER.length - 1} steps in. Keep going!`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={lightColors.primary} />
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[styles.progressFill, { width: `${(permitStepIndex / (PERMIT_LADDER.length - 1)) * 100}%` }]}
              />
            </View>
          </TouchableOpacity>
        )}

        {/* Quick actions */}
        <Text style={styles.sectionTitle}>Quick actions</Text>
        <View style={styles.actionsRow}>
          {quickActions.map((a) => (
            <TouchableOpacity key={a.key} style={styles.actionCard} onPress={a.onPress} activeOpacity={0.85}>
              <View style={styles.actionIconWrap}>
                <Ionicons name={a.icon} size={22} color={lightColors.primary} />
              </View>
              <Text style={styles.actionLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: lightColors.background },
  scrollContent: { padding: spacing.md, paddingBottom: 40 },

  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  greeting: { fontSize: 13, color: lightColors.textMuted, fontWeight: '600' },
  businessName: { fontSize: 22, fontWeight: '800', color: lightColors.textDark, marginTop: 2 },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: lightColors.chipBg,
    borderRadius: 9999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  ratingPillText: { fontSize: 13, fontWeight: '800', color: lightColors.textDark },

  openCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    padding: 16,
    paddingVertical: 18,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  openCardOn: {
    backgroundColor: '#F3FBF6',
    borderColor: 'rgba(39,174,96,0.35)',
    shadowColor: lightColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  openCardOff: { backgroundColor: lightColors.surface, borderColor: lightColors.divider },
  openStateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  openDot: { width: 10, height: 10, borderRadius: 5 },
  openTitle: { fontSize: 18, fontWeight: '800', color: lightColors.textDark },
  openSubtitle: { fontSize: 12.5, color: lightColors.textMuted, marginTop: 4, lineHeight: 17 },
  bigSwitch: { transform: [{ scaleX: 1.25 }, { scaleY: 1.25 }], marginRight: 4 },

  sectionTitle: { fontSize: 15, fontWeight: '800', color: lightColors.textDark, marginBottom: 10 },
  statsLoading: { paddingVertical: 24, alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: spacing.lg },
  statCard: {
    flex: 1,
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    alignItems: 'center',
  },
  statValue: { fontSize: 19, fontWeight: '800', color: lightColors.textDark },
  statLabel: { fontSize: 12, color: lightColors.textMuted, marginTop: 3, fontWeight: '600' },

  pendingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    marginBottom: spacing.md,
  },
  pendingIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: lightColors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  pendingTitle: { fontSize: 14.5, fontWeight: '700', color: lightColors.textDark },
  pendingSubtitle: { fontSize: 12, color: lightColors.textMuted, marginTop: 2 },

  complianceCard: {
    backgroundColor: '#F3FBF6',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(39,174,96,0.30)',
    marginBottom: spacing.lg,
  },
  complianceHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  complianceIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: lightColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  complianceTitle: { fontSize: 14.5, fontWeight: '800', color: lightColors.textDark },
  complianceSubtitle: { fontSize: 12, color: lightColors.textMuted, marginTop: 2, lineHeight: 16 },
  progressTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(26,92,56,0.12)',
    marginTop: 14,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: lightColors.primary },

  actionsRow: { flexDirection: 'row', gap: 10 },
  actionCard: {
    flex: 1,
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    alignItems: 'center',
    gap: 8,
  },
  actionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontSize: 12.5, fontWeight: '700', color: lightColors.textDark, textAlign: 'center' },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  pendingScroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  heroCircleOuter: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(39,174,96,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  heroCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: lightColors.textDark,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  emptySubtitle: {
    fontSize: 14,
    color: lightColors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
    marginBottom: spacing.lg,
    paddingHorizontal: 12,
  },
  primaryBtn: {
    backgroundColor: lightColors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
