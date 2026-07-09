// HalalBasket — debounced search across sellers (public_sellers.business_name)
// and items (visible_listings.name). Recent searches held in component state.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { lightColors, spacing } from '../../constants/theme';
import type { CustomerTabParamList, MainStackParamList } from '../navigation/types';
import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import { formatMoney } from '../utils/pricing';
import type { Database, VisibleListingRow } from '../types/database';

type PublicSeller = Database['public']['Views']['public_sellers']['Row'];

type Props = CompositeScreenProps<
  BottomTabScreenProps<CustomerTabParamList, 'Search'>,
  NativeStackScreenProps<MainStackParamList>
>;

const DEBOUNCE_MS = 350;
const MAX_RECENTS = 8;

/** Escape %/_ so user input can't act as wildcards in ilike. */
const escapeLike = (s: string) => s.replace(/[%_]/g, (m) => `\\${m}`);

export default function SearchScreen({ navigation, route }: Props) {
  const [query, setQuery] = useState(route.params?.initialQuery ?? '');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sellers, setSellers] = useState<PublicSeller[]>([]);
  const [items, setItems] = useState<VisibleListingRow[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const requestSeq = useRef(0);

  const trimmed = useMemo(() => query.trim(), [query]);

  // Pick up a fresh initialQuery when re-navigated to this tab.
  useEffect(() => {
    if (route.params?.initialQuery) setQuery(route.params.initialQuery);
  }, [route.params?.initialQuery]);

  useEffect(() => {
    if (trimmed.length < 2) {
      setSellers([]);
      setItems([]);
      setSearching(false);
      setHasSearched(false);
      setError(null);
      return;
    }

    setSearching(true);
    const seq = ++requestSeq.current;
    const timer = setTimeout(async () => {
      try {
        setError(null);
        const pattern = `%${escapeLike(trimmed)}%`;
        const [sellerRes, itemRes] = await Promise.all([
          supabase
            .from('public_sellers')
            .select('*')
            .ilike('business_name', pattern)
            .order('avg_rating', { ascending: false, nullsFirst: false })
            .limit(15),
          supabase
            .from('visible_listings')
            .select('*')
            .ilike('name', pattern)
            .limit(25),
        ]);
        if (seq !== requestSeq.current) return; // stale response
        if (sellerRes.error) throw sellerRes.error;
        if (itemRes.error) throw itemRes.error;
        setSellers((sellerRes.data ?? []) as PublicSeller[]);
        setItems((itemRes.data ?? []) as VisibleListingRow[]);
        setHasSearched(true);
        setRecents((prev) => {
          const next = [trimmed, ...prev.filter((r) => r.toLowerCase() !== trimmed.toLowerCase())];
          return next.slice(0, MAX_RECENTS);
        });
      } catch (e: any) {
        if (seq !== requestSeq.current) return;
        logger.error('Search', 'search failed', { query: trimmed, error: e?.message });
        setError('Search is having trouble right now. Please try again.');
      } finally {
        if (seq === requestSeq.current) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [trimmed]);

  const openSeller = (sellerId: string) => {
    Keyboard.dismiss();
    navigation.navigate('SellerDetail', { sellerId });
  };

  const renderSellerRow = (seller: PublicSeller) => (
    <TouchableOpacity
      key={seller.id}
      style={styles.row}
      activeOpacity={0.8}
      onPress={() => openSeller(seller.id)}
    >
      {seller.logo_url ? (
        <Image source={{ uri: seller.logo_url }} style={styles.rowImage} />
      ) : (
        <View style={[styles.rowImage, styles.rowImagePlaceholder]}>
          <Ionicons name="storefront-outline" size={20} color={lightColors.primary} />
        </View>
      )}
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {seller.business_name}
        </Text>
        <View style={styles.rowMetaRow}>
          <Ionicons name="star" size={12} color="#F5A623" />
          <Text style={styles.rowMeta}>
            {seller.avg_rating != null ? Number(seller.avg_rating).toFixed(1) : 'New'}
          </Text>
          {(seller.cuisine_tags ?? []).length > 0 && (
            <Text style={styles.rowMeta} numberOfLines={1}>
              · {(seller.cuisine_tags ?? []).slice(0, 2).join(' · ')}
            </Text>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={lightColors.textMuted} />
    </TouchableOpacity>
  );

  const renderItemRow = (item: VisibleListingRow) => (
    <TouchableOpacity
      key={item.id}
      style={styles.row}
      activeOpacity={0.8}
      onPress={() => openSeller(item.seller_id)}
    >
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={styles.rowImage} />
      ) : (
        <View style={[styles.rowImage, styles.rowImagePlaceholder]}>
          <Ionicons name="fast-food-outline" size={20} color={lightColors.primary} />
        </View>
      )}
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {formatMoney(item.price)} · {item.business_name}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={lightColors.textMuted} />
    </TouchableOpacity>
  );

  const showRecents = trimmed.length < 2 && recents.length > 0;
  const noResults = hasSearched && !searching && sellers.length === 0 && items.length === 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Search</Text>
      </View>

      {/* Search input */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={lightColors.textMuted} />
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Search halal food, butchers, cooks…"
          placeholderTextColor={lightColors.textMuted}
          autoCorrect={false}
          returnKeyType="search"
          autoCapitalize="none"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color={lightColors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {searching && (
          <View style={styles.searchingRow}>
            <ActivityIndicator size="small" color={lightColors.primary} />
            <Text style={styles.searchingText}>Searching…</Text>
          </View>
        )}

        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={18} color={lightColors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Recent searches */}
        {showRecents && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Recent searches</Text>
              <TouchableOpacity onPress={() => setRecents([])}>
                <Text style={styles.clearText}>Clear</Text>
              </TouchableOpacity>
            </View>
            {recents.map((r) => (
              <TouchableOpacity key={r} style={styles.recentRow} onPress={() => setQuery(r)}>
                <Ionicons name="time-outline" size={16} color={lightColors.textMuted} />
                <Text style={styles.recentText}>{r}</Text>
                <Ionicons name="arrow-up-outline" size={14} color={lightColors.textMuted} style={styles.recentArrow} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Idle hint */}
        {trimmed.length < 2 && recents.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="search-circle-outline" size={64} color={lightColors.chipBg} />
            <Text style={styles.emptyTitle}>Find everything halal</Text>
            <Text style={styles.emptyHint}>
              Try “biryani”, “ribeye”, or the name of your favourite local cook.
            </Text>
          </View>
        )}

        {/* Sellers section */}
        {sellers.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sellers</Text>
            {sellers.map(renderSellerRow)}
          </View>
        )}

        {/* Items section */}
        {items.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Items</Text>
            {items.map(renderItemRow)}
          </View>
        )}

        {noResults && !error && (
          <View style={styles.emptyState}>
            <Ionicons name="sad-outline" size={48} color={lightColors.textMuted} />
            <Text style={styles.emptyTitle}>No matches for “{trimmed}”</Text>
            <Text style={styles.emptyHint}>Check the spelling or try something more general.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.background,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: lightColors.textDark,
    letterSpacing: -0.3,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: lightColors.inputBg,
    borderRadius: 14,
    marginHorizontal: spacing.md,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: lightColors.divider,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: lightColors.textDark,
    paddingVertical: 12,
    fontWeight: '500',
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: 60,
  },
  searchingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  searchingText: {
    color: lightColors.textMuted,
    fontSize: 13,
    fontWeight: '600',
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
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: lightColors.textDark,
    marginBottom: 8,
  },
  clearText: {
    fontSize: 13,
    fontWeight: '700',
    color: lightColors.primary,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: lightColors.divider,
  },
  recentText: {
    flex: 1,
    fontSize: 14.5,
    color: lightColors.textDark,
    fontWeight: '500',
  },
  recentArrow: {
    transform: [{ rotate: '45deg' }],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: lightColors.divider,
  },
  rowImage: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: lightColors.inputBg,
  },
  rowImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    gap: 3,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: lightColors.textDark,
  },
  rowMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rowMeta: {
    fontSize: 12.5,
    color: lightColors.textMuted,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 48,
    paddingHorizontal: spacing.lg,
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
});
