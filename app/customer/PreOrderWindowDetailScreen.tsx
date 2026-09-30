import { fonts } from '../../constants/typography';
// HalalBasket — pre-order window (meal drop) detail. Shows cook date, live
// cutoff countdown, min-order progress, and the drop's listings with
// add-to-basket. Adding tags the cart with preOrderWindowId.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { lightColors, spacing } from '../../constants/theme';
import type { MainStackParamList } from '../navigation/types';
import { supabase } from '../config/supabase';
import { useDemo } from '../demo/DemoContext';
import { demoSellers, demoListings } from '../demo/catalog';
import { marketplaceImage } from '../demo/images';
import { logger } from '../utils/logger';
import { notify } from '../lib/notify';
import { useCart, type CartSellerInfo } from '../context/CartContext';
import { formatMoney } from '../utils/pricing';
import type { Database, PreOrderWindowRow, VisibleListingRow } from '../types/database';

type PublicSeller = Database['public']['Views']['public_sellers']['Row'];

type Props = NativeStackScreenProps<MainStackParamList, 'PreOrderWindowDetail'>;

const formatCookDate = (cookDate: string): string => {
  const [y, m, d] = cookDate.split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
};

const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

const countdownParts = (cutoffIso: string): string => {
  const ms = new Date(cutoffIso).getTime() - Date.now();
  if (ms <= 0) return 'Ordering closed';
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return mins > 0 ? `${mins}m` : 'Less than a minute';
};

export default function PreOrderWindowDetailScreen({ navigation, route }: Props) {
  const demo = useDemo();
  const { windowId, sellerId } = route.params;
  const insets = useSafeAreaInsets();
  const { addItem, replaceCart, itemCount, subtotal, seller: cartSeller } = useCart();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [window, setWindow] = useState<PreOrderWindowRow | null>(null);
  const [seller, setSeller] = useState<PublicSeller | null>(null);
  const [orderCount, setOrderCount] = useState(0);
  const [listings, setListings] = useState<VisibleListingRow[]>([]);
  const [countdown, setCountdown] = useState('');

  const fetchAll = useCallback(async () => {
    try {
      setError(null);
      if (demo.enabled) {
        setWindow(demo.windows.find((w) => w.id === windowId && w.seller_id === sellerId) ?? null);
        setSeller(demoSellers.find((s) => s.id === sellerId) ?? null);
        setOrderCount(7 + demo.orders.filter((o) => o.pre_order_window_id === windowId).length);
        setListings(demoListings.filter((l) => l.seller_id === sellerId));
        return;
      }
      const [windowRes, sellerRes, countRes, itemsRes] = await Promise.all([
        supabase.from('pre_order_windows').select('*').eq('id', windowId).maybeSingle(),
        supabase.from('public_sellers').select('*').eq('id', sellerId).maybeSingle(),
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('pre_order_window_id', windowId)
          .neq('status', 'cancelled'),
        supabase.from('pre_order_window_items').select('listing_id').eq('window_id', windowId),
      ]);
      if (windowRes.error) throw windowRes.error;
      if (sellerRes.error) throw sellerRes.error;
      if (itemsRes.error) throw itemsRes.error;
      if (!windowRes.data) {
        setError('This meal drop is no longer available.');
        return;
      }
      setWindow(windowRes.data as PreOrderWindowRow);
      setSeller((sellerRes.data as PublicSeller) ?? null);
      setOrderCount(countRes.count ?? 0);

      const listingIds = ((itemsRes.data ?? []) as Array<{ listing_id: string }>).map(
        (r) => r.listing_id,
      );
      if (listingIds.length > 0) {
        const { data: listingRows, error: lErr } = await supabase
          .from('visible_listings')
          .select('*')
          .in('id', listingIds);
        if (lErr) throw lErr;
        setListings((listingRows ?? []) as VisibleListingRow[]);
      } else {
        setListings([]);
      }
    } catch (e: any) {
      logger.error('PreOrderWindow', 'fetch failed', { windowId, error: e?.message });
      setError('We could not load this meal drop. Please try again.');
    }
  }, [windowId, sellerId, demo.enabled, demo.windows, demo.orders]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchAll();
      setLoading(false);
    })();
  }, [fetchAll]);

  // Meal drops are scheduled hours ahead; avoid rerendering the whole menu every second.
  useEffect(() => {
    if (!window) return;
    setCountdown(countdownParts(window.order_cutoff));
    const timer = setInterval(() => setCountdown(countdownParts(window.order_cutoff)), 15000);
    return () => clearInterval(timer);
  }, [window]);

  const cutoffPassed = window ? new Date(window.order_cutoff).getTime() <= Date.now() : false;

  const handleAdd = (listing: VisibleListingRow) => {
    if (!window || !seller) return;
    if (Date.now() >= Date.parse(window.order_cutoff)) {
      notify.warning('Ordering for this drop has closed.');
      return;
    }
    if (listing.sold_out) {
      notify.warning('This item is sold out for this drop.');
      return;
    }
    const info: CartSellerInfo = {
      sellerId: seller.id,
      sellerType: seller.seller_type,
      businessName: seller.business_name,
      preOrderWindowId: window.id,
    };
    const added = addItem(listing, info);
    if (added) {
      notify.success(`${listing.name} added to your drop order.`);
      return;
    }
    notify.confirm({
      title: 'Start a new basket?',
      message: `Your basket has items from ${cartSeller?.businessName ?? 'another seller'}. Clear it and start a pre-order basket from ${seller.business_name}?`,
      confirmText: 'Start new basket',
      cancelText: 'Keep current',
      destructive: true,
      onConfirm: () => {
        replaceCart(listing, info);
        notify.success(`New basket started with ${listing.name}.`);
      },
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={lightColors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !window) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.headerBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={lightColors.textDark} />
          </TouchableOpacity>
        </View>
        <View style={styles.center}>
          <Ionicons name="calendar-outline" size={48} color={lightColors.textMuted} />
          <Text style={styles.emptyTitle}>{error ?? 'Meal drop unavailable'}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void fetchAll()}>
            <Text style={styles.retryBtnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const progress = Math.min(1, orderCount / Math.max(1, window.min_orders));
  const minReached = orderCount >= window.min_orders;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={lightColors.textDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Meal drop
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: itemCount > 0 ? 130 : 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Window info card ── */}
        <Text style={[styles.sectionTitle, { fontSize: 28, lineHeight: 35 }]}>{window.title ?? 'The next meal drop'}</Text>
        {seller?.banner_url && (
          <Image
            source={marketplaceImage(seller.banner_url)}
            style={{ width: '100%', height: 220, borderRadius: 20, marginBottom: 16 }}
          />
        )}
        <View style={styles.infoCard}>
          {seller && (
            <TouchableOpacity
              style={styles.sellerRow}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('SellerDetail', { sellerId: seller.id })}
            >
              {seller.logo_url ? (
                <Image source={marketplaceImage(seller.logo_url)} style={styles.sellerLogo} />
              ) : (
                <View style={[styles.sellerLogo, styles.logoPlaceholder]}>
                  <Ionicons name="home" size={16} color={lightColors.primary} />
                </View>
              )}
              <Text style={styles.sellerName} numberOfLines={1}>
                {seller.business_name}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={lightColors.textMuted} />
            </TouchableOpacity>
          )}

          <View style={styles.infoRow}>
            <View style={styles.infoIconCircle}>
              <Ionicons name="calendar" size={16} color={lightColors.primary} />
            </View>
            <View style={styles.infoTextWrap}>
              <Text style={styles.infoLabel}>Cook date</Text>
              <Text style={styles.infoValue}>{formatCookDate(window.cook_date)}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoIconCircle}>
              <Ionicons
                name="hourglass"
                size={16}
                color={cutoffPassed ? lightColors.error : lightColors.primary}
              />
            </View>
            <View style={styles.infoTextWrap}>
              <Text style={styles.infoLabel}>Order cutoff</Text>
              <Text style={[styles.infoValue, cutoffPassed && styles.cutoffClosed]}>
                {cutoffPassed ? 'Ordering closed' : `${countdown} left`}
              </Text>
              <Text style={styles.infoSub}>{formatDateTime(window.order_cutoff)}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoIconCircle}>
              <Ionicons name="bag-check" size={16} color={lightColors.primary} />
            </View>
            <View style={styles.infoTextWrap}>
              <Text style={styles.infoLabel}>Ready for pickup</Text>
              <Text style={styles.infoValue}>{formatDateTime(window.pickup_ready_at)}</Text>
            </View>
          </View>

          {/* Min-order progress */}
          <View style={styles.progressBlock}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressTitle}>
                {orderCount} of {window.min_orders} orders
              </Text>
              {minReached && (
                <View style={styles.confirmedChip}>
                  <Ionicons name="checkmark-circle" size={13} color={lightColors.primary} />
                  <Text style={styles.confirmedChipText}>Minimum reached</Text>
                </View>
              )}
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
          </View>
        </View>

        {/* ── How drops work ── */}
        <View style={styles.explainCard}>
          <Ionicons name="information-circle" size={20} color={lightColors.primary} />
          <Text style={styles.explainText}>
            This cook prepares in batches. Order by the cutoff; if fewer than {window.min_orders}{' '}
            orders come in, the drop is cancelled and you're refunded.
          </Text>
        </View>

        {/* ── Linked listings ── */}
        <Text style={styles.sectionTitle}>In this drop</Text>
        {listings.length === 0 ? (
          <View style={styles.inlineEmpty}>
            <Ionicons name="fast-food-outline" size={28} color={lightColors.textMuted} />
            <Text style={styles.inlineEmptyText}>No items linked to this drop yet.</Text>
          </View>
        ) : (
          listings.map((listing) => (
            <View key={listing.id} style={styles.itemRow}>
              {listing.image_url ? (
                <Image source={marketplaceImage(listing.image_url)} style={styles.itemImage} />
              ) : (
                <View style={[styles.itemImage, styles.itemImagePlaceholder]}>
                  <Ionicons name="fast-food-outline" size={22} color={lightColors.primary} />
                </View>
              )}
              <View style={styles.itemBody}>
                <Text style={styles.itemName} numberOfLines={2}>
                  {listing.name}
                </Text>
                {!!listing.description && (
                  <Text style={styles.itemDesc} numberOfLines={2}>
                    {listing.description}
                  </Text>
                )}
                <Text style={styles.itemPrice}>{formatMoney(listing.price)}</Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Add ${listing.name}`}
                style={[styles.addBtn, (cutoffPassed || listing.sold_out) && styles.addBtnDisabled]}
                onPress={() => handleAdd(listing)}
                disabled={cutoffPassed || listing.sold_out}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="add" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>

      {/* ── Sticky basket bar ── */}
      {itemCount > 0 && (
        <TouchableOpacity
          accessibilityLabel="View basket"
          style={[styles.basketBar, { bottom: insets.bottom + 12 }]}
          activeOpacity={0.9}
          onPress={() => navigation.navigate('Cart')}
        >
          <View style={styles.basketCount}>
            <Text style={styles.basketCountText}>{itemCount}</Text>
          </View>
          <Text style={styles.basketBarText}>View basket</Text>
          <Text style={styles.basketBarTotal}>{formatMoney(subtotal)}</Text>
        </TouchableOpacity>
      )}
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
    gap: 12,
    padding: spacing.xl,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 20,
    backgroundColor: lightColors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 26,
    fontFamily: fonts.extraBold,
    color: lightColors.textDark,
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: fonts.extraBold,
    color: lightColors.textDark,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: lightColors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  retryBtnText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: fonts.bold,
  },

  infoCard: {
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    padding: 16,
    gap: 14,
  },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: lightColors.divider,
  },
  sellerLogo: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: lightColors.chipBg,
  },
  logoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerName: {
    flex: 1,
    fontSize: 15,
    fontFamily: fonts.bold,
    color: lightColors.textDark,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  infoIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTextWrap: {
    flex: 1,
    gap: 1,
  },
  infoLabel: {
    fontSize: 11.5,
    fontFamily: fonts.bold,
    color: lightColors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: lightColors.textDark,
  },
  cutoffClosed: {
    color: lightColors.error,
  },
  infoSub: {
    fontSize: 12,
    color: lightColors.textMuted,
    fontFamily: fonts.medium,
  },

  progressBlock: {
    gap: 8,
    paddingTop: 4,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressTitle: {
    fontSize: 14,
    fontFamily: fonts.extraBold,
    color: lightColors.textDark,
  },
  confirmedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: lightColors.chipBg,
    borderRadius: 9999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  confirmedChipText: {
    color: lightColors.primary,
    fontSize: 11.5,
    fontFamily: fonts.bold,
  },
  progressTrack: {
    height: 8,
    backgroundColor: lightColors.chipBg,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: lightColors.primary,
    borderRadius: 4,
  },

  explainCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: lightColors.chipBg,
    borderRadius: 16,
    padding: 14,
    marginTop: 12,
  },
  explainText: {
    flex: 1,
    fontSize: 13,
    color: lightColors.textDark,
    lineHeight: 19,
    fontFamily: fonts.medium,
  },

  sectionTitle: {
    fontSize: 18,
    fontFamily: fonts.extraBold,
    color: lightColors.textDark,
    marginTop: spacing.lg,
    marginBottom: 12,
  },
  inlineEmpty: {
    alignItems: 'center',
    gap: 8,
    padding: spacing.lg,
    backgroundColor: lightColors.inputBg,
    borderRadius: 16,
  },
  inlineEmptyText: {
    fontSize: 13.5,
    color: lightColors.textMuted,
    textAlign: 'center',
  },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    padding: 12,
    marginBottom: 10,
  },
  itemImage: {
    width: 90,
    height: 96,
    borderRadius: 12,
    backgroundColor: lightColors.inputBg,
  },
  itemImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemBody: {
    flex: 1,
    gap: 3,
  },
  itemName: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: lightColors.textDark,
  },
  itemDesc: {
    fontSize: 12.5,
    color: lightColors.textMuted,
    lineHeight: 17,
  },
  itemPrice: {
    fontSize: 14,
    fontFamily: fonts.extraBold,
    color: lightColors.primary,
    marginTop: 2,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: lightColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnDisabled: {
    backgroundColor: '#C9D5CD',
  },

  basketBar: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: lightColors.primary,
    borderRadius: 9999,
    paddingVertical: 16,
    paddingHorizontal: 20,
    shadowColor: lightColors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  basketCount: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  basketCountText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: fonts.extraBold,
  },
  basketBarText: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontFamily: fonts.bold,
  },
  basketBarTotal: {
    color: '#fff',
    fontSize: 15,
    fontFamily: fonts.extraBold,
  },
});
