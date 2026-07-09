// HalalBasket — browse sellers of a given type (Restaurants / Butchers & Farms / Home Cooks).

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { lightColors, spacing } from '../../constants/theme';
import type { MainStackParamList } from '../navigation/types';
import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import type { Database, PreOrderWindowRow, SellerType } from '../types/database';

type PublicSeller = Database['public']['Views']['public_sellers']['Row'];

type Props = NativeStackScreenProps<MainStackParamList, 'CategoryBrowse'>;

const TITLES: Record<SellerType, string> = {
  restaurant: 'Restaurants',
  butcher: 'Butchers & Farms',
  home_cook: 'Home Cooks',
};

const EMPTY_COPY: Record<SellerType, string> = {
  restaurant: 'No halal restaurants have joined yet — they are on their way. Check back soon!',
  butcher: 'No butchers or farms are live yet. Fresh halal cuts are coming soon!',
  home_cook: 'No home cooks are live yet. Neighbourhood meal drops land here soon!',
};

const formatCookDate = (cookDate: string): string => {
  const [y, m, d] = cookDate.split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};

export default function CategoryBrowseScreen({ navigation, route }: Props) {
  const { sellerType } = route.params;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sellers, setSellers] = useState<PublicSeller[]>([]);
  /** sellerId -> next open pre-order window (home cooks only). */
  const [nextWindows, setNextWindows] = useState<Record<string, PreOrderWindowRow>>({});

  const fetchSellers = useCallback(async () => {
    try {
      setError(null);
      const { data, error: err } = await supabase
        .from('public_sellers')
        .select('*')
        .eq('seller_type', sellerType)
        .order('avg_rating', { ascending: false, nullsFirst: false });
      if (err) throw err;
      const rows = (data ?? []) as PublicSeller[];
      setSellers(rows);

      if (sellerType === 'home_cook' && rows.length > 0) {
        const { data: windows, error: wErr } = await supabase
          .from('pre_order_windows')
          .select('*')
          .in('seller_id', rows.map((s) => s.id))
          .eq('status', 'open')
          .gt('order_cutoff', new Date().toISOString())
          .order('order_cutoff', { ascending: true });
        if (wErr) throw wErr;
        const map: Record<string, PreOrderWindowRow> = {};
        for (const w of (windows ?? []) as PreOrderWindowRow[]) {
          if (!map[w.seller_id]) map[w.seller_id] = w;
        }
        setNextWindows(map);
      }
    } catch (e: any) {
      logger.error('CategoryBrowse', 'fetch failed', { sellerType, error: e?.message });
      setError('We could not load sellers. Please try again.');
    }
  }, [sellerType]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchSellers();
      setLoading(false);
    })();
  }, [fetchSellers]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchSellers();
    setRefreshing(false);
  }, [fetchSellers]);

  const renderSeller = ({ item }: { item: PublicSeller }) => {
    const nextWindow = nextWindows[item.id];
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('SellerDetail', { sellerId: item.id })}
      >
        {item.banner_url ? (
          <Image source={{ uri: item.banner_url }} style={styles.banner} />
        ) : (
          <View style={[styles.banner, styles.bannerPlaceholder]}>
            <Ionicons name="image-outline" size={30} color={lightColors.textMuted} />
          </View>
        )}
        <View style={styles.cardBody}>
          <View style={styles.nameRow}>
            {item.logo_url ? (
              <Image source={{ uri: item.logo_url }} style={styles.logo} />
            ) : (
              <View style={[styles.logo, styles.logoPlaceholder]}>
                <Ionicons name="leaf" size={16} color={lightColors.primary} />
              </View>
            )}
            <Text style={styles.name} numberOfLines={1}>
              {item.business_name}
            </Text>
            {sellerType === 'home_cook' ? (
              <View style={styles.preOrderBadge}>
                <Ionicons name="calendar" size={11} color="#fff" />
                <Text style={styles.preOrderBadgeText}>Pre-order</Text>
              </View>
            ) : (
              <View style={[styles.openChip, !item.is_open && styles.closedChip]}>
                <Text style={[styles.openChipText, !item.is_open && styles.closedChipText]}>
                  {item.is_open ? 'Open' : 'Closed'}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.metaRow}>
            <Ionicons name="star" size={14} color="#F5A623" />
            <Text style={styles.rating}>
              {item.avg_rating != null ? Number(item.avg_rating).toFixed(1) : 'New'}
            </Text>
            {item.rating_count != null && item.rating_count > 0 && (
              <Text style={styles.ratingCount}>({item.rating_count})</Text>
            )}
            {(item.cuisine_tags ?? []).length > 0 && (
              <Text style={styles.tags} numberOfLines={1}>
                · {(item.cuisine_tags ?? []).slice(0, 3).join(' · ')}
              </Text>
            )}
          </View>

          {sellerType === 'home_cook' && (
            <View style={styles.windowRow}>
              <Ionicons name="time-outline" size={13} color={lightColors.primary} />
              <Text style={styles.windowText}>
                {nextWindow
                  ? `Next drop cooks ${formatCookDate(nextWindow.cook_date)}`
                  : 'No open drops right now'}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={lightColors.textDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{TITLES[sellerType]}</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={lightColors.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={44} color={lightColors.textMuted} />
          <Text style={styles.emptyTitle}>Something went wrong</Text>
          <Text style={styles.emptyHint}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={onRefresh}>
            <Text style={styles.retryBtnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={sellers}
          keyExtractor={(s) => s.id}
          renderItem={renderSeller}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={lightColors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="basket-outline" size={48} color={lightColors.textMuted} />
              <Text style={styles.emptyTitle}>Nothing here yet</Text>
              <Text style={styles.emptyHint}>{EMPTY_COPY[sellerType]}</Text>
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
    paddingVertical: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: lightColors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: lightColors.textDark,
  },
  center: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: spacing.xl,
    marginTop: 40,
  },
  listContent: {
    padding: spacing.md,
    paddingBottom: 40,
    gap: 14,
    flexGrow: 1,
  },
  card: {
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    overflow: 'hidden',
  },
  banner: {
    width: '100%',
    height: 140,
    backgroundColor: lightColors.inputBg,
  },
  bannerPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    padding: 16,
    gap: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: lightColors.chipBg,
  },
  logoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    color: lightColors.textDark,
  },
  openChip: {
    backgroundColor: lightColors.chipBg,
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  openChipText: {
    color: lightColors.primary,
    fontSize: 11.5,
    fontWeight: '700',
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
    gap: 4,
    backgroundColor: lightColors.primary,
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  preOrderBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  rating: {
    fontSize: 13.5,
    fontWeight: '700',
    color: lightColors.textDark,
  },
  ratingCount: {
    fontSize: 12.5,
    color: lightColors.textMuted,
    fontWeight: '500',
  },
  tags: {
    flex: 1,
    fontSize: 12.5,
    color: lightColors.textMuted,
    fontWeight: '500',
  },
  windowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: lightColors.chipBg,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  windowText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: lightColors.primary,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: lightColors.textDark,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 13.5,
    color: lightColors.textMuted,
    textAlign: 'center',
    lineHeight: 19,
  },
  retryBtn: {
    marginTop: 6,
    backgroundColor: lightColors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  retryBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
