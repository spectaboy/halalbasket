// HalalBasket — customer Home. The flagship discovery screen: category lanes,
// open-now + top-rated seller rails, upcoming home-cook meal drops.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { lightColors, spacing } from '../../constants/theme';
import type { CustomerTabParamList, MainStackParamList } from '../navigation/types';
import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import { useSession } from '../context/SessionContext';
import { useCart } from '../context/CartContext';
import { formatMoney } from '../utils/pricing';
import BackgroundPattern from '../components/BackgroundPattern';
import type { Database, PreOrderWindowRow, SellerType } from '../types/database';

type PublicSeller = Database['public']['Views']['public_sellers']['Row'];

interface WindowWithSeller extends PreOrderWindowRow {
  sellers: { business_name: string } | null;
}

type Props = CompositeScreenProps<
  BottomTabScreenProps<CustomerTabParamList, 'Home'>,
  NativeStackScreenProps<MainStackParamList>
>;

const CATEGORY_LANES: Array<{
  sellerType: SellerType;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
}> = [
  {
    sellerType: 'restaurant',
    title: 'Restaurants',
    subtitle: 'Zabiha-certified kitchens, delivered hot',
    icon: 'restaurant',
    tint: '#EAF5EE',
  },
  {
    sellerType: 'butcher',
    title: 'Butchers & Farms',
    subtitle: 'Fresh halal meat, cut to order',
    icon: 'storefront',
    tint: '#FDF3E7',
  },
  {
    sellerType: 'home_cook',
    title: 'Home Cooks',
    subtitle: 'Homemade meal drops from your neighbours',
    icon: 'home',
    tint: '#EFF3FB',
  },
];

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

const formatCookDate = (cookDate: string): string => {
  const [y, m, d] = cookDate.split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};

const cutoffLabel = (cutoffIso: string): string => {
  const ms = new Date(cutoffIso).getTime() - Date.now();
  if (ms <= 0) return 'Ordering closed';
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 48) return `Order within ${Math.floor(hours / 24)} days`;
  if (hours >= 1) return `Order within ${hours}h`;
  return `Closes in ${Math.max(1, Math.floor(ms / 60_000))} min`;
};

export default function HomeScreen({ navigation }: Props) {
  const { user } = useSession();
  const { itemCount, subtotal } = useCart();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openNow, setOpenNow] = useState<PublicSeller[]>([]);
  const [topRated, setTopRated] = useState<PublicSeller[]>([]);
  const [drops, setDrops] = useState<WindowWithSeller[]>([]);

  const fetchAll = useCallback(async () => {
    try {
      setLoadError(null);
      const [openRes, topRes, dropsRes] = await Promise.all([
        supabase
          .from('public_sellers')
          .select('*')
          .eq('is_open', true)
          .order('avg_rating', { ascending: false, nullsFirst: false })
          .limit(12),
        supabase
          .from('public_sellers')
          .select('*')
          .not('avg_rating', 'is', null)
          .order('avg_rating', { ascending: false })
          .order('rating_count', { ascending: false })
          .limit(12),
        supabase
          .from('pre_order_windows')
          .select('*, sellers(business_name)')
          .eq('status', 'open')
          .gt('order_cutoff', new Date().toISOString())
          .order('order_cutoff', { ascending: true })
          .limit(10),
      ]);
      if (openRes.error) throw openRes.error;
      if (topRes.error) throw topRes.error;
      if (dropsRes.error) throw dropsRes.error;
      setOpenNow((openRes.data ?? []) as PublicSeller[]);
      setTopRated((topRes.data ?? []) as PublicSeller[]);
      setDrops((dropsRes.data ?? []) as unknown as WindowWithSeller[]);
    } catch (e: any) {
      logger.error('Home', 'fetch failed', { error: e?.message });
      setLoadError('We could not load the marketplace. Pull to retry.');
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchAll();
      setLoading(false);
    })();
  }, [fetchAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  const renderSellerCard = ({ item }: { item: PublicSeller }) => (
    <TouchableOpacity
      style={styles.sellerCard}
      activeOpacity={0.85}
      onPress={() => navigation.navigate('SellerDetail', { sellerId: item.id })}
    >
      {item.banner_url ? (
        <Image source={{ uri: item.banner_url }} style={styles.sellerBanner} />
      ) : (
        <View style={[styles.sellerBanner, styles.bannerPlaceholder]}>
          <Ionicons name="image-outline" size={28} color={lightColors.textMuted} />
        </View>
      )}
      <View style={styles.sellerCardBody}>
        <View style={styles.sellerNameRow}>
          {item.logo_url ? (
            <Image source={{ uri: item.logo_url }} style={styles.sellerLogo} />
          ) : (
            <View style={[styles.sellerLogo, styles.logoPlaceholder]}>
              <Ionicons name="leaf" size={14} color={lightColors.primary} />
            </View>
          )}
          <Text style={styles.sellerName} numberOfLines={1}>
            {item.business_name}
          </Text>
        </View>
        <View style={styles.sellerMetaRow}>
          <Ionicons name="star" size={13} color="#F5A623" />
          <Text style={styles.sellerRating}>
            {item.avg_rating != null ? Number(item.avg_rating).toFixed(1) : 'New'}
          </Text>
          <View style={[styles.openChip, !item.is_open && styles.closedChip]}>
            <Text style={[styles.openChipText, !item.is_open && styles.closedChipText]}>
              {item.seller_type === 'home_cook' ? 'Pre-order' : item.is_open ? 'Open now' : 'Closed'}
            </Text>
          </View>
        </View>
        {(item.cuisine_tags ?? []).length > 0 && (
          <Text style={styles.sellerTags} numberOfLines={1}>
            {(item.cuisine_tags ?? []).slice(0, 3).join(' · ')}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderRail = (
    title: string,
    icon: keyof typeof Ionicons.glyphMap,
    data: PublicSeller[],
    emptyCopy: string
  ) => (
    <View style={styles.railSection}>
      <View style={styles.railHeader}>
        <Ionicons name={icon} size={18} color={lightColors.primary} />
        <Text style={styles.railTitle}>{title}</Text>
      </View>
      {data.length === 0 ? (
        <Text style={styles.railEmpty}>{emptyCopy}</Text>
      ) : (
        <FlatList
          horizontal
          data={data}
          keyExtractor={(s) => s.id}
          renderItem={renderSellerCard}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.railContent}
        />
      )}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={lightColors.primary} />
          <Text style={styles.loadingText}>Setting the table…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <BackgroundPattern />
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={lightColors.primary} />
        }
      >
        {/* ── Greeting header ── */}
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.greeting}>
              {getGreeting()}
              {user?.first_name ? `, ${user.first_name}` : ''}
            </Text>
            <Text style={styles.tagline}>Everything halal, in one place</Text>
          </View>
          <TouchableOpacity
            style={styles.addressChip}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('Profile')}
          >
            <Ionicons name="location" size={14} color={lightColors.primary} />
            <Text style={styles.addressText} numberOfLines={1}>
              {user?.default_address ?? 'Set delivery address'}
            </Text>
            <Ionicons name="chevron-down" size={13} color={lightColors.primary} />
          </TouchableOpacity>
        </View>

        {/* ── Search bar ── */}
        <TouchableOpacity
          style={styles.searchBar}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Search', { initialQuery: undefined })}
        >
          <View style={styles.searchIconCircle}>
            <Ionicons name="search" size={17} color="#fff" />
          </View>
          <Text style={styles.searchPlaceholder}>Search halal food, butchers, cooks…</Text>
        </TouchableOpacity>

        {loadError && (
          <View style={styles.errorBanner}>
            <Ionicons name="cloud-offline-outline" size={18} color={lightColors.error} />
            <Text style={styles.errorText}>{loadError}</Text>
          </View>
        )}

        {/* ── Category lanes ── */}
        <View style={styles.lanes}>
          {CATEGORY_LANES.map((lane) => (
            <TouchableOpacity
              key={lane.sellerType}
              style={[styles.laneCard, { backgroundColor: lane.tint }]}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('CategoryBrowse', { sellerType: lane.sellerType })}
            >
              <View style={styles.laneIconCircle}>
                <Ionicons name={lane.icon} size={24} color={lightColors.primary} />
              </View>
              <View style={styles.laneText}>
                <Text style={styles.laneTitle}>{lane.title}</Text>
                <Text style={styles.laneSubtitle}>{lane.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={lightColors.primary} />
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Open now rail ── */}
        {renderRail('Open now', 'flash', openNow, 'No sellers are open right now — check back soon.')}

        {/* ── Top rated rail ── */}
        {renderRail('Top rated', 'star', topRated, 'Ratings appear once orders start rolling in.')}

        {/* ── Upcoming meal drops ── */}
        <View style={styles.railSection}>
          <View style={styles.railHeader}>
            <Ionicons name="calendar" size={18} color={lightColors.primary} />
            <Text style={styles.railTitle}>Upcoming meal drops</Text>
          </View>
          {drops.length === 0 ? (
            <Text style={styles.railEmpty}>No open pre-order windows yet — home cooks post drops here.</Text>
          ) : (
            <FlatList
              horizontal
              data={drops}
              keyExtractor={(w) => w.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.railContent}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.dropCard}
                  activeOpacity={0.85}
                  onPress={() =>
                    navigation.navigate('PreOrderWindowDetail', {
                      windowId: item.id,
                      sellerId: item.seller_id,
                    })
                  }
                >
                  <View style={styles.dropBadge}>
                    <Ionicons name="flame" size={13} color="#fff" />
                    <Text style={styles.dropBadgeText}>Meal drop</Text>
                  </View>
                  <Text style={styles.dropTitle} numberOfLines={1}>
                    {item.title ?? 'Home-cooked drop'}
                  </Text>
                  <Text style={styles.dropSeller} numberOfLines={1}>
                    by {item.sellers?.business_name ?? 'Home cook'}
                  </Text>
                  <View style={styles.dropMetaRow}>
                    <Ionicons name="calendar-outline" size={13} color={lightColors.textMuted} />
                    <Text style={styles.dropMeta}>Cooks {formatCookDate(item.cook_date)}</Text>
                  </View>
                  <View style={styles.dropMetaRow}>
                    <Ionicons name="time-outline" size={13} color={lightColors.textMuted} />
                    <Text style={styles.dropMeta}>{cutoffLabel(item.order_cutoff)}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </ScrollView>

      {/* ── Floating cart pill ── */}
      {itemCount > 0 && (
        <TouchableOpacity
          style={[styles.cartPill, { bottom: insets.bottom + 16 }]}
          activeOpacity={0.9}
          onPress={() => navigation.navigate('Cart')}
        >
          <View style={styles.cartCountBubble}>
            <Text style={styles.cartCountText}>{itemCount}</Text>
          </View>
          <Text style={styles.cartPillText}>View basket</Text>
          <Text style={styles.cartPillSubtotal}>{formatMoney(subtotal)}</Text>
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
  },
  loadingText: {
    color: lightColors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },

  // Header
  header: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: 10,
  },
  headerText: {
    gap: 2,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '800',
    color: lightColors.textDark,
    letterSpacing: -0.3,
  },
  tagline: {
    fontSize: 14,
    color: lightColors.textMuted,
    fontWeight: '500',
  },
  addressChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: lightColors.chipBg,
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    maxWidth: '90%',
  },
  addressText: {
    color: lightColors.primary,
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },

  // Search bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: lightColors.inputBg,
    borderRadius: 9999,
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: lightColors.divider,
  },
  searchIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: lightColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: lightColors.textMuted,
  },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FDECEA',
    borderRadius: 12,
    padding: 12,
    marginBottom: spacing.md,
  },
  errorText: {
    flex: 1,
    color: lightColors.error,
    fontSize: 13,
    fontWeight: '600',
  },

  // Category lanes
  lanes: {
    gap: 10,
    marginBottom: spacing.lg,
  },
  laneCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
  },
  laneIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  laneText: {
    flex: 1,
    gap: 2,
  },
  laneTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: lightColors.textDark,
  },
  laneSubtitle: {
    fontSize: 12.5,
    color: lightColors.textMuted,
    fontWeight: '500',
  },

  // Rails
  railSection: {
    marginBottom: spacing.lg,
  },
  railHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  railTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: lightColors.textDark,
  },
  railEmpty: {
    color: lightColors.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  railContent: {
    gap: 12,
    paddingRight: spacing.md,
  },

  // Seller card
  sellerCard: {
    width: 220,
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    overflow: 'hidden',
  },
  sellerBanner: {
    width: '100%',
    height: 110,
    backgroundColor: lightColors.inputBg,
  },
  bannerPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerCardBody: {
    padding: 12,
    gap: 6,
  },
  sellerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sellerLogo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: lightColors.chipBg,
  },
  logoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: lightColors.textDark,
  },
  sellerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  sellerRating: {
    fontSize: 13,
    fontWeight: '700',
    color: lightColors.textDark,
    marginRight: 4,
  },
  openChip: {
    backgroundColor: lightColors.chipBg,
    borderRadius: 9999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  openChipText: {
    color: lightColors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  closedChip: {
    backgroundColor: '#F4F4F4',
  },
  closedChipText: {
    color: lightColors.textMuted,
  },
  sellerTags: {
    fontSize: 12,
    color: lightColors.textMuted,
    fontWeight: '500',
  },

  // Meal drop card
  dropCard: {
    width: 220,
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    padding: 16,
    gap: 6,
  },
  dropBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    backgroundColor: lightColors.primary,
    borderRadius: 9999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginBottom: 2,
  },
  dropBadgeText: {
    color: '#fff',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  dropTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: lightColors.textDark,
  },
  dropSeller: {
    fontSize: 12.5,
    color: lightColors.textMuted,
    fontWeight: '600',
  },
  dropMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dropMeta: {
    fontSize: 12,
    color: lightColors.textMuted,
    fontWeight: '500',
  },

  // Floating cart pill
  cartPill: {
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
  cartCountBubble: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  cartCountText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  cartPillText: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  cartPillSubtotal: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
});
