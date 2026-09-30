import { fonts } from '../../constants/typography';
// HalalBasket — seller storefront. Restaurants/butchers get a grouped menu with
// instant add-to-basket; home cooks get their open pre-order windows (meal drops).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

type Props = NativeStackScreenProps<MainStackParamList, 'SellerDetail'>;

interface WindowWithProgress extends PreOrderWindowRow {
  orderCount: number;
}

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const todayHoursLabel = (
  openHours: Record<string, { open: string; close: string } | null> | null | undefined,
): string | null => {
  if (!openHours) return null;
  const today = openHours[DAY_KEYS[new Date().getDay()]];
  if (!today) return 'Closed today';
  return `Today ${today.open} – ${today.close}`;
};

const formatCookDate = (cookDate: string): string => {
  const [y, m, d] = cookDate.split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
};

const cutoffCountdown = (cutoffIso: string): string => {
  const ms = new Date(cutoffIso).getTime() - Date.now();
  if (ms <= 0) return 'Ordering closed';
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (days > 0) return `Order closes in ${days}d ${hours}h`;
  if (hours > 0) return `Order closes in ${hours}h ${mins}m`;
  return `Order closes in ${mins}m`;
};

export default function SellerDetailScreen({ navigation, route }: Props) {
  const demo = useDemo();
  const { sellerId } = route.params;
  const insets = useSafeAreaInsets();
  const { addItem, replaceCart, itemCount, subtotal, seller: cartSeller } = useCart();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seller, setSeller] = useState<PublicSeller | null>(null);
  const [listings, setListings] = useState<VisibleListingRow[]>([]);
  const [windows, setWindows] = useState<WindowWithProgress[]>([]);

  const fetchAll = useCallback(async () => {
    try {
      setError(null);
      if (demo.enabled) {
        setSeller(demoSellers.find((s) => s.id === sellerId) ?? null);
        setListings(demoListings.filter((l) => l.seller_id === sellerId));
        setWindows(
          demo.windows
            .filter((w) => w.seller_id === sellerId)
            .map((w) => ({
              ...w,
              orderCount: 7 + demo.orders.filter((o) => o.pre_order_window_id === w.id).length,
            })),
        );
        return;
      }
      const { data: sellerRow, error: sErr } = await supabase
        .from('public_sellers')
        .select('*')
        .eq('id', sellerId)
        .maybeSingle();
      if (sErr) throw sErr;
      if (!sellerRow) {
        setError('This seller is no longer available.');
        return;
      }
      const typed = sellerRow as PublicSeller;
      setSeller(typed);

      const { data: listingRows, error: lErr } = await supabase
        .from('visible_listings')
        .select('*')
        .eq('seller_id', sellerId)
        .order('category', { ascending: true })
        .order('name', { ascending: true });
      if (lErr) throw lErr;
      setListings((listingRows ?? []) as VisibleListingRow[]);

      if (typed.seller_type === 'home_cook') {
        const { data: windowRows, error: wErr } = await supabase
          .from('pre_order_windows')
          .select('*')
          .eq('seller_id', sellerId)
          .eq('status', 'open')
          .gt('order_cutoff', new Date().toISOString())
          .order('order_cutoff', { ascending: true });
        if (wErr) throw wErr;
        const openWindows = (windowRows ?? []) as PreOrderWindowRow[];
        const withCounts = await Promise.all(
          openWindows.map(async (w) => {
            const { count } = await supabase
              .from('orders')
              .select('id', { count: 'exact', head: true })
              .eq('pre_order_window_id', w.id)
              .neq('status', 'cancelled');
            return { ...w, orderCount: count ?? 0 };
          }),
        );
        setWindows(withCounts);
      }
    } catch (e: any) {
      logger.error('SellerDetail', 'fetch failed', { sellerId, error: e?.message });
      setError('We could not load this seller. Please try again.');
    }
  }, [sellerId, demo.enabled, demo.windows, demo.orders]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchAll();
      setLoading(false);
    })();
  }, [fetchAll]);

  const grouped = useMemo(() => {
    const map = new Map<string, VisibleListingRow[]>();
    for (const l of listings) {
      const key = l.category?.trim() || 'Menu';
      const bucket = map.get(key) ?? [];
      bucket.push(l);
      map.set(key, bucket);
    }
    return Array.from(map.entries());
  }, [listings]);

  const handleAdd = (listing: VisibleListingRow) => {
    if (!seller) return;
    if (!seller.is_open) {
      notify.info('This seller is closed right now. Browse another favourite.');
      return;
    }
    if (listing.sold_out) {
      notify.warning('This item is sold out right now.');
      return;
    }
    const info: CartSellerInfo = {
      sellerId: seller.id,
      sellerType: seller.seller_type,
      businessName: seller.business_name,
    };
    const added = addItem(listing, info);
    if (added) {
      notify.success(`${listing.name} added to your basket.`);
      return;
    }
    notify.confirm({
      title: 'Start a new basket?',
      message: `Your basket has items from ${cartSeller?.businessName ?? 'another seller'}. Clear it and start a new basket from ${seller.business_name}?`,
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

  if (error || !seller) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.headerBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={lightColors.textDark} />
          </TouchableOpacity>
        </View>
        <View style={styles.center}>
          <Ionicons name="storefront-outline" size={48} color={lightColors.textMuted} />
          <Text style={styles.emptyTitle}>{error ?? 'Seller unavailable'}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void fetchAll()}>
            <Text style={styles.retryBtnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isHomeCook = seller.seller_type === 'home_cook';
  const hoursLabel = demo.enabled
    ? seller.is_open
      ? `${seller.prep_time_mins}–${(seller.prep_time_mins ?? 25) + 10} min`
      : null
    : todayHoursLabel(seller.open_hours);

  const renderListingRow = (listing: VisibleListingRow) => (
    <TouchableOpacity
      key={listing.id}
      style={styles.itemRow}
      activeOpacity={0.85}
      accessibilityLabel={`View ${listing.name}`}
      onPress={() =>
        isHomeCook && windows.length
          ? navigation.navigate('PreOrderWindowDetail', {
              windowId: windows[0].id,
              sellerId: seller.id,
            })
          : navigation.navigate('ListingDetail', { listingId: listing.id, sellerId: seller.id })
      }
    >
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
        <View style={styles.itemPriceRow}>
          <Text style={styles.itemPrice}>{formatMoney(listing.price)}</Text>
          {listing.sold_out && (
            <View style={styles.soldOutChip}>
              <Text style={styles.soldOutText}>Sold out</Text>
            </View>
          )}
          {isHomeCook && (
            <View style={styles.dropsChip}>
              <Text style={styles.dropsChipText}>Available in drops</Text>
            </View>
          )}
        </View>
      </View>
      {!isHomeCook && (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`Add ${listing.name}`}
          style={[styles.addBtn, listing.sold_out && styles.addBtnDisabled]}
          onPress={(event) => {
            event.stopPropagation();
            handleAdd(listing);
          }}
          disabled={listing.sold_out}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: itemCount > 0 ? 120 : 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Banner header ── */}
        <View style={styles.bannerWrap}>
          {seller.banner_url ? (
            <Image source={marketplaceImage(seller.banner_url)} style={styles.banner} />
          ) : (
            <View style={[styles.banner, styles.bannerPlaceholder]}>
              <Ionicons name="leaf" size={40} color={lightColors.primary} />
            </View>
          )}
          <TouchableOpacity
            style={[styles.backBtn, styles.bannerBack]}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={22} color={lightColors.textDark} />
          </TouchableOpacity>
        </View>

        {/* ── Seller info card ── */}
        <View style={styles.infoCard}>
          <View style={styles.infoTitleRow}>
            {seller.logo_url ? (
              <Image source={marketplaceImage(seller.logo_url)} style={styles.logo} />
            ) : (
              <View style={[styles.logo, styles.logoPlaceholder]}>
                <Ionicons name="leaf" size={20} color={lightColors.primary} />
              </View>
            )}
            <View style={styles.infoTitleText}>
              <Text style={styles.sellerName}>{seller.business_name}</Text>
              <View style={styles.metaRow}>
                <Ionicons name="star" size={14} color="#F5A623" />
                <Text style={styles.rating}>
                  {seller.avg_rating != null ? Number(seller.avg_rating).toFixed(1) : 'New'}
                </Text>
                {seller.rating_count != null && seller.rating_count > 0 && (
                  <Text style={styles.ratingCount}>({seller.rating_count} reviews)</Text>
                )}
              </View>
            </View>
          </View>

          {(seller.cuisine_tags ?? []).length > 0 && (
            <View style={styles.tagsRow}>
              {(seller.cuisine_tags ?? []).slice(0, 4).map((tag) => (
                <View key={tag} style={styles.tagChip}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.statusRow}>
            {isHomeCook ? (
              <View style={styles.preOrderBadge}>
                <Ionicons name="calendar" size={12} color="#fff" />
                <Text style={styles.preOrderBadgeText}>Pre-order only</Text>
              </View>
            ) : (
              <View style={[styles.openChip, !seller.is_open && styles.closedChip]}>
                <Text style={[styles.openChipText, !seller.is_open && styles.closedChipText]}>
                  {seller.is_open ? 'Open now' : 'Closed'}
                </Text>
              </View>
            )}
            {!!hoursLabel && !isHomeCook && (
              <View style={styles.hoursChip}>
                <Ionicons name="time-outline" size={13} color={lightColors.primary} />
                <Text style={styles.hoursText}>{hoursLabel}</Text>
              </View>
            )}
          </View>

          {!!seller.description && <Text style={styles.description}>{seller.description}</Text>}
        </View>

        {/* ── Home cook: open windows ── */}
        {isHomeCook && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Open meal drops</Text>
            {windows.length === 0 ? (
              <View style={styles.inlineEmpty}>
                <Ionicons name="calendar-outline" size={28} color={lightColors.textMuted} />
                <Text style={styles.inlineEmptyText}>
                  No open drops right now. Check back — new drops are posted regularly.
                </Text>
              </View>
            ) : (
              windows.map((w) => {
                const progress = Math.min(1, w.orderCount / Math.max(1, w.min_orders));
                return (
                  <TouchableOpacity
                    key={w.id}
                    style={styles.windowCard}
                    activeOpacity={0.85}
                    onPress={() =>
                      navigation.navigate('PreOrderWindowDetail', {
                        windowId: w.id,
                        sellerId: seller.id,
                      })
                    }
                  >
                    <View style={styles.windowTitleRow}>
                      <Text style={styles.windowTitle} numberOfLines={1}>
                        {w.title ?? `Drop — ${formatCookDate(w.cook_date)}`}
                      </Text>
                      <Ionicons name="chevron-forward" size={18} color={lightColors.textMuted} />
                    </View>
                    <View style={styles.windowMetaRow}>
                      <Ionicons name="calendar-outline" size={13} color={lightColors.textMuted} />
                      <Text style={styles.windowMeta}>Cooks {formatCookDate(w.cook_date)}</Text>
                    </View>
                    <View style={styles.windowMetaRow}>
                      <Ionicons name="time-outline" size={13} color={lightColors.textMuted} />
                      <Text style={styles.windowMeta}>{cutoffCountdown(w.order_cutoff)}</Text>
                    </View>
                    <View style={styles.progressWrap}>
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                      </View>
                      <Text style={styles.progressText}>
                        {w.orderCount} of {w.min_orders} orders
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}

        {/* ── Menu ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{isHomeCook ? 'Their dishes' : 'Menu'}</Text>
          {listings.length === 0 ? (
            <View style={styles.inlineEmpty}>
              <Ionicons name="fast-food-outline" size={28} color={lightColors.textMuted} />
              <Text style={styles.inlineEmptyText}>No items listed yet.</Text>
            </View>
          ) : (
            grouped.map(([category, rows]) => (
              <View key={category} style={styles.categoryBlock}>
                {grouped.length > 1 && <Text style={styles.categoryTitle}>{category}</Text>}
                {rows.map(renderListingRow)}
              </View>
            ))
          )}
        </View>
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
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  bannerWrap: {
    position: 'relative',
  },
  banner: {
    width: '100%',
    height: 245,
    backgroundColor: lightColors.inputBg,
  },
  bannerPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerBack: {
    position: 'absolute',
    top: 12,
    left: 16,
  },

  infoCard: {
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    padding: 16,
    marginHorizontal: spacing.md,
    marginTop: -28,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0,
    shadowRadius: 10,
    elevation: 0,
  },
  infoTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: lightColors.chipBg,
  },
  logoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTitleText: {
    flex: 1,
    gap: 3,
  },
  sellerName: {
    fontSize: 26,
    fontFamily: fonts.extraBold,
    color: lightColors.textDark,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  rating: {
    fontSize: 13.5,
    fontFamily: fonts.bold,
    color: lightColors.textDark,
  },
  ratingCount: {
    fontSize: 12.5,
    color: lightColors.textMuted,
    fontFamily: fonts.medium,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagChip: {
    backgroundColor: lightColors.chipBg,
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: {
    color: lightColors.primary,
    fontSize: 12,
    fontFamily: fonts.semibold,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  openChip: {
    backgroundColor: lightColors.chipBg,
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  openChipText: {
    color: lightColors.primary,
    fontSize: 12,
    fontFamily: fonts.bold,
  },
  closedChip: {
    backgroundColor: '#F4F4F4',
  },
  closedChipText: {
    color: lightColors.textMuted,
  },
  preOrderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: lightColors.primary,
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  preOrderBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: fonts.extraBold,
  },
  hoursChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: lightColors.inputBg,
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  hoursText: {
    color: lightColors.primary,
    fontSize: 12,
    fontFamily: fonts.semibold,
  },
  description: {
    fontSize: 13.5,
    color: lightColors.textMuted,
    lineHeight: 19,
  },

  section: {
    paddingHorizontal: spacing.md,
    marginTop: spacing.lg,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: fonts.extraBold,
    color: lightColors.textDark,
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
    lineHeight: 19,
  },

  // Pre-order windows
  windowCard: {
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    padding: 16,
    marginBottom: 12,
    gap: 6,
  },
  windowTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  windowTitle: {
    flex: 1,
    fontSize: 15.5,
    fontFamily: fonts.extraBold,
    color: lightColors.textDark,
  },
  windowMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  windowMeta: {
    fontSize: 12.5,
    color: lightColors.textMuted,
    fontFamily: fonts.medium,
  },
  progressWrap: {
    marginTop: 4,
    gap: 5,
  },
  progressTrack: {
    height: 6,
    backgroundColor: lightColors.chipBg,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: lightColors.primary,
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: lightColors.primary,
  },

  // Menu items
  categoryBlock: {
    marginBottom: spacing.md,
  },
  categoryTitle: {
    fontSize: 14,
    fontFamily: fonts.extraBold,
    color: lightColors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
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
  itemPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  itemPrice: {
    fontSize: 14,
    fontFamily: fonts.extraBold,
    color: lightColors.primary,
  },
  soldOutChip: {
    backgroundColor: '#F4F4F4',
    borderRadius: 9999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  soldOutText: {
    color: lightColors.textMuted,
    fontSize: 10.5,
    fontFamily: fonts.bold,
  },
  dropsChip: {
    backgroundColor: lightColors.chipBg,
    borderRadius: 9999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  dropsChipText: {
    color: lightColors.primary,
    fontSize: 10.5,
    fontFamily: fonts.bold,
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

  // Sticky basket bar
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
