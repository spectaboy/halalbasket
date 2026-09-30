import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { lightColors as c } from '../../constants/theme';
import { fonts } from '../../constants/typography';
import type { MainStackParamList } from '../navigation/types';
import { supabase } from '../config/supabase';
import { useDemo } from '../demo/DemoContext';
import { demoSellers } from '../demo/catalog';
import BasketBar from '../components/ui/BasketBar';
import { logger } from '../utils/logger';
import { BackButton, categories, DiscoveryEmpty, SellerCard } from '../components/ui/Discovery';
import type { Database, PreOrderWindowRow } from '../types/database';

type Seller = Database['public']['Views']['public_sellers']['Row'];
type Props = NativeStackScreenProps<MainStackParamList, 'CategoryBrowse'>;
export default function CategoryBrowseScreen({ navigation, route }: Props) {
  const demo = useDemo();
  const insets = useSafeAreaInsets();
  const { sellerType } = route.params;
  const category = categories.find((item) => item.type === sellerType)!;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [nextWindows, setNextWindows] = useState<Record<string, PreOrderWindowRow>>({});
  const [availableOnly, setAvailableOnly] = useState(false);
  const [topRated, setTopRated] = useState(false);

  const fetchSellers = useCallback(async () => {
    try {
      setError(null);
      if (demo.enabled) {
        setSellers(demoSellers.filter((s) => s.seller_type === sellerType));
        setNextWindows(Object.fromEntries(demo.windows.map((w) => [w.seller_id, w])));
        return;
      }
      const { data, error: err } = await supabase
        .from('public_sellers')
        .select('*')
        .eq('seller_type', sellerType)
        .order('avg_rating', { ascending: false, nullsFirst: false });
      if (err) throw err;
      const rows = (data ?? []) as Seller[];
      setSellers(rows);
      const next: Record<string, PreOrderWindowRow> = {};
      if (sellerType === 'home_cook' && rows.length) {
        const { data: windows, error: windowError } = await supabase
          .from('pre_order_windows')
          .select('*')
          .in(
            'seller_id',
            rows.map((row) => row.id),
          )
          .eq('status', 'open')
          .gt('order_cutoff', new Date().toISOString())
          .order('order_cutoff', { ascending: true });
        if (windowError) throw windowError;
        for (const window of (windows ?? []) as PreOrderWindowRow[])
          if (!next[window.seller_id]) next[window.seller_id] = window;
      }
      setNextWindows(next);
    } catch (e: any) {
      logger.error('CategoryBrowse', 'fetch failed', { sellerType, error: e?.message });
      setError('We could not load sellers. Please try again.');
    }
  }, [sellerType, demo.enabled, demo.windows]);
  useEffect(() => {
    setLoading(true);
    setAvailableOnly(false);
    setTopRated(false);
    void fetchSellers().finally(() => setLoading(false));
  }, [fetchSellers]);
  const refresh = async () => {
    setRefreshing(true);
    await fetchSellers();
    setRefreshing(false);
  };
  const visible = useMemo(
    () =>
      sellers.filter(
        (seller) =>
          (!availableOnly ||
            (sellerType === 'home_cook' ? !!nextWindows[seller.id] : seller.is_open)) &&
          (!topRated || (seller.avg_rating != null && Number(seller.avg_rating) >= 4)),
      ),
    [sellers, availableOnly, topRated, sellerType, nextWindows],
  );
  const filtered = availableOnly || topRated;

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <FlatList
        data={loading || error ? [] : visible}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.list, { paddingBottom: 110 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.primary} />
        }
        ListHeaderComponent={
          <>
            <View style={s.hero}>
              <Image source={category.image} style={s.heroImage} />
              <View style={s.back}>
                <BackButton onPress={() => navigation.goBack()} />
              </View>
            </View>
            <View style={s.heading}>
              <Text style={s.title}>{category.title}</Text>
              <Text style={s.subtitle}>{category.subtitle}</Text>
              <View style={s.filters}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityState={{ selected: availableOnly }}
                  aria-selected={availableOnly}
                  style={[s.filter, availableOnly && s.selected]}
                  onPress={() => setAvailableOnly((value) => !value)}
                >
                  <Text style={[s.filterText, availableOnly && s.selectedText]}>
                    {sellerType === 'home_cook' ? 'Open pre-orders' : 'Open now'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Top rated, 4 stars and above"
                  accessibilityState={{ selected: topRated }}
                  aria-selected={topRated}
                  style={[s.filter, topRated && s.selected]}
                  onPress={() => setTopRated((value) => !value)}
                >
                  <Text style={[s.filterText, topRated && s.selectedText]}>Top rated</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        }
        renderItem={({ item }) => (
          <View style={s.item}>
            <SellerCard
              seller={item}
              onPress={() => navigation.navigate('SellerDetail', { sellerId: item.id })}
              footer={
                sellerType === 'home_cook'
                  ? nextWindows[item.id]
                    ? `Next drop · ${new Date(`${nextWindows[item.id].cook_date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                    : 'New meal drops coming soon'
                  : undefined
              }
            />
          </View>
        )}
        ListEmptyComponent={
          <View style={s.item}>
            {loading ? (
              <View style={s.loading}>
                <ActivityIndicator color={c.primary} />
                <Text style={s.subtitle}>Finding local favourites…</Text>
              </View>
            ) : error ? (
              <DiscoveryEmpty
                error
                title="Let's try that again"
                message={error}
                onPress={refresh}
                action="Try again"
              />
            ) : (
              <DiscoveryEmpty
                title={filtered ? 'A little quiet right now' : 'Good food is on its way'}
                message={
                  filtered
                    ? 'Try all sellers to discover more in this category.'
                    : sellerType === 'home_cook'
                      ? 'Local cooks will share their upcoming meal drops here. Check back soon.'
                      : `Your ${category.title.toLowerCase()} will appear here as they join HalalBasket.`
                }
                onPress={
                  filtered
                    ? () => {
                        setAvailableOnly(false);
                        setTopRated(false);
                      }
                    : () => navigation.goBack()
                }
                action={filtered ? 'Show all sellers' : 'Explore other categories'}
              />
            )}
          </View>
        }
      />
      <BasketBar onPress={() => navigation.navigate('Cart')} bottom={insets.bottom + 12} />
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  list: { paddingBottom: 24, width: '100%', maxWidth: 620, alignSelf: 'center' },
  hero: { height: 255 },
  heroImage: { width: '100%', height: '100%' },
  back: { position: 'absolute', top: 16, left: 20 },
  heading: { padding: 20, paddingBottom: 18, gap: 7 },
  title: {
    color: c.textDark,
    fontFamily: fonts.extraBold,
    fontSize: 34,
    lineHeight: 42,
    letterSpacing: -1,
  },
  subtitle: { color: c.textMuted, fontFamily: fonts.regular, fontSize: 15, lineHeight: 23 },
  filters: { flexDirection: 'row', gap: 10, marginTop: 15, flexWrap: 'wrap' },
  filter: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#C8CEC2',
    justifyContent: 'center',
  },
  selected: { backgroundColor: c.primary, borderColor: c.primary },
  filterText: { color: c.textDark, fontFamily: fonts.semibold, fontSize: 14 },
  selectedText: { color: '#FFFFFF' },
  item: { paddingHorizontal: 20 },
  loading: { padding: 30, gap: 12, alignItems: 'center' },
});
