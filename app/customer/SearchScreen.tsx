import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { lightColors as c } from '../../constants/theme';
import { fonts } from '../../constants/typography';
import type { CustomerTabParamList, MainStackParamList } from '../navigation/types';
import { supabase } from '../config/supabase';
import { useDemo } from '../demo/DemoContext';
import { searchDemo } from '../demo/catalog';
import { marketplaceImage } from '../demo/images';
import BasketBar from '../components/ui/BasketBar';
import { logger } from '../utils/logger';
import { formatMoney } from '../utils/pricing';
import {
  BackButton,
  categories,
  CategoryTiles,
  DiscoveryEmpty,
  SellerCard,
} from '../components/ui/Discovery';
import type { Database, SellerType, VisibleListingRow } from '../types/database';

type Seller = Database['public']['Views']['public_sellers']['Row'];
type Props = CompositeScreenProps<
  BottomTabScreenProps<CustomerTabParamList, 'Search'>,
  NativeStackScreenProps<MainStackParamList>
>;
const escapeLike = (value: string) => value.replace(/[%_]/g, (character) => `\\${character}`);
const filters: { key: 'all' | SellerType; label: string }[] = [
  { key: 'all', label: 'All' },
  ...categories.map((category) => ({ key: category.type, label: category.shortTitle })),
];

export default function SearchScreen({ navigation, route }: Props) {
  const demo = useDemo();
  const [savedOnly, setSavedOnly] = useState(false);
  const [query, setQuery] = useState(route.params?.initialQuery ?? '');
  const [filter, setFilter] = useState<'all' | SellerType>('all');
  const [searching, setSearching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [items, setItems] = useState<VisibleListingRow[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [retry, setRetry] = useState(0);
  const requestSeq = useRef(0);
  const trimmed = query.trim();
  const isSearch = trimmed.length >= 2;

  useEffect(() => {
    if (route.params?.initialQuery != null) setQuery(route.params.initialQuery);
  }, [route.params?.initialQuery]);
  useEffect(() => {
    if (route.params?.savedOnly == null) return;
    setSavedOnly(route.params.savedOnly);
    setQuery('');
    setFilter('all');
    navigation.setParams({ savedOnly: undefined });
  }, [navigation, route.params?.savedOnly]);
  useEffect(() => {
    const seq = ++requestSeq.current;
    let active = true;
    setSearching(true);
    setError(null);
    // Hide the preceding query's results while new results are pending.
    setSellers([]);
    setItems([]);
    const timer = setTimeout(
      async () => {
        try {
          if (demo.enabled) {
            const result = searchDemo(
              isSearch ? trimmed : '',
              filter,
              savedOnly ? demo.favourites : undefined,
            );
            if (!active || seq !== requestSeq.current) return;
            setSellers(result.sellers);
            setItems(result.items);
            if (isSearch)
              setRecents((previous) =>
                [trimmed, ...previous.filter((v) => v !== trimmed)].slice(0, 6),
              );
            return;
          }
          let sellerQuery = supabase
            .from('public_sellers')
            .select('*')
            .order('avg_rating', { ascending: false, nullsFirst: false })
            .limit(15);
          let itemQuery = supabase.from('visible_listings').select('*').limit(25);
          if (filter !== 'all') {
            sellerQuery = sellerQuery.eq('seller_type', filter);
            itemQuery = itemQuery.eq('seller_type', filter);
          }
          if (isSearch) {
            const pattern = `%${escapeLike(trimmed)}%`;
            sellerQuery = sellerQuery.ilike('business_name', pattern);
            itemQuery = itemQuery.ilike('name', pattern);
          }
          const [sellerResult, itemResult] = await Promise.all([
            sellerQuery,
            isSearch ? itemQuery : Promise.resolve({ data: [], error: null }),
          ]);
          if (!active || seq !== requestSeq.current) return;
          if (sellerResult.error) throw sellerResult.error;
          if (itemResult.error) throw itemResult.error;
          setSellers((sellerResult.data ?? []) as Seller[]);
          setItems((itemResult.data ?? []) as VisibleListingRow[]);
          if (isSearch)
            setRecents((previous) =>
              [
                trimmed,
                ...previous.filter((value) => value.toLowerCase() !== trimmed.toLowerCase()),
              ].slice(0, 6),
            );
        } catch (e: any) {
          if (!active || seq !== requestSeq.current) return;
          logger.error('Search', 'search failed', { query: trimmed, error: e?.message });
          setError('We could not load results. Please try again.');
        } finally {
          if (active && seq === requestSeq.current) setSearching(false);
        }
      },
      isSearch ? 350 : 0,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [trimmed, isSearch, filter, retry, demo.enabled, demo.favourites, savedOnly]);

  const openSeller = (sellerId: string) => {
    Keyboard.dismiss();
    navigation.navigate('SellerDetail', { sellerId });
  };
  const empty = !searching && !error && sellers.length === 0 && items.length === 0;
  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <View style={s.top}>
        <BackButton onPress={() => navigation.navigate('Home')} />
        <View style={s.search}>
          <Ionicons name="search-outline" size={21} color={c.textDark} />
          <TextInput
            accessibilityLabel="Search food and sellers"
            style={s.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Search dishes or restaurants…"
            placeholderTextColor={c.textMuted}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={Keyboard.dismiss}
          />
          {!!query && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              style={s.clear}
              onPress={() => setQuery('')}
            >
              <Ionicons name="close-circle" size={20} color={c.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filters}
        >
          {filters.map((item) => (
            <TouchableOpacity
              key={item.key}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === item.key }}
              aria-selected={filter === item.key}
              style={[s.filter, filter === item.key && s.selected]}
              onPress={() => setFilter(item.key)}
            >
              <Text style={[s.filterText, filter === item.key && s.selectedText]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
          {demo.enabled && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Show saved favourites"
              accessibilityState={{ selected: savedOnly }}
              style={[s.filter, savedOnly && s.selected]}
              onPress={() => setSavedOnly((value) => !value)}
            >
              <Text style={[s.filterText, savedOnly && s.selectedText]}>♥ Saved</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: 110 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.heading}>
          {savedOnly
            ? 'Your saved\nfavourites'
            : isSearch
              ? `Results for “${trimmed}”`
              : 'Find your next\nfavourite'}
        </Text>
        {!isSearch && recents.length > 0 && (
          <View style={s.recentSection}>
            <View style={s.recentHeader}>
              <Text style={s.sectionTitle}>Recent searches</Text>
              <TouchableOpacity
                style={s.clear}
                accessibilityRole="button"
                onPress={() => setRecents([])}
              >
                <Text style={s.link}>Clear</Text>
              </TouchableOpacity>
            </View>
            <View style={s.recentChips}>
              {recents.map((value) => (
                <TouchableOpacity key={value} style={s.recent} onPress={() => setQuery(value)}>
                  <Ionicons name="time-outline" size={15} color={c.primary} />
                  <Text style={s.recentText}>{value}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
        {searching && (
          <View style={s.loading}>
            <ActivityIndicator color={c.primary} />
            <Text style={s.body}>
              {isSearch ? 'Searching your local favourites…' : 'Discovering local sellers…'}
            </Text>
          </View>
        )}
        {error && (
          <DiscoveryEmpty
            error
            title="Let's try that again"
            message={error}
            action="Try again"
            onPress={() => setRetry((value) => value + 1)}
          />
        )}
        {sellers.map((seller) => (
          <SellerCard key={seller.id} seller={seller} onPress={() => openSeller(seller.id)} />
        ))}
        {!!items.length && <Text style={s.sectionTitle}>Dishes & fresh finds</Text>}
        {items.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={s.item}
            accessibilityRole="button"
            accessibilityLabel={`View ${item.name} from ${item.business_name}`}
            onPress={() => {
              Keyboard.dismiss();
              if (item.seller_type === 'home_cook') openSeller(item.seller_id);
              else
                navigation.navigate('ListingDetail', {
                  listingId: item.id,
                  sellerId: item.seller_id,
                });
            }}
          >
            {item.image_url ? (
              <Image source={marketplaceImage(item.image_url)} style={s.itemImage} />
            ) : (
              <View style={[s.itemImage, s.itemFallback]}>
                <Ionicons name="restaurant-outline" size={28} color={c.primary} />
              </View>
            )}
            <View style={s.itemBody}>
              <Text style={s.itemTitle}>{item.name}</Text>
              <Text style={s.body}>{item.business_name}</Text>
              <Text style={s.price}>{formatMoney(item.price)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={19} color={c.primary} />
          </TouchableOpacity>
        ))}
        {empty &&
          (savedOnly ? (
            <DiscoveryEmpty
              title="Keep your favourites close"
              message="Tap the heart on a seller to save them here."
              action="Explore sellers"
              onPress={() => {
                setSavedOnly(false);
                setQuery('');
              }}
            />
          ) : isSearch ? (
            <DiscoveryEmpty
              title="No matches just yet"
              message="Try a dish like biryani, a fresh cut, or the name of a local seller."
              action="Clear search"
              onPress={() => setQuery('')}
            />
          ) : (
            <>
              <CategoryTiles
                onPress={(sellerType) => navigation.navigate('CategoryBrowse', { sellerType })}
              />
              <View style={{ height: 20 }} />
              <DiscoveryEmpty
                title="Your next favourite starts here"
                message="Restaurant meals, fresh halal cuts and pre-order home cooking. Local sellers will appear here as they join."
                action={filter === 'all' ? 'Browse restaurants' : 'Show all categories'}
                onPress={() =>
                  filter === 'all'
                    ? navigation.navigate('CategoryBrowse', { sellerType: 'restaurant' })
                    : setFilter('all')
                }
              />
            </>
          ))}
      </ScrollView>
      <BasketBar onPress={() => navigation.navigate('Cart')} />
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  top: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, gap: 4 },
  search: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#D8DCD1',
    borderRadius: 16,
    paddingLeft: 14,
    paddingRight: 4,
  },
  input: {
    flex: 1,
    minWidth: 0,
    color: c.textDark,
    fontFamily: fonts.regular,
    fontSize: 14,
    paddingVertical: 14,
  },
  clear: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  filters: { paddingHorizontal: 20, gap: 8, paddingBottom: 4 },
  filter: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#CDD2C8',
    borderRadius: 15,
    justifyContent: 'center',
    paddingHorizontal: 13,
  },
  selected: { backgroundColor: c.primary, borderColor: c.primary },
  filterText: { fontFamily: fonts.semibold, fontSize: 12, color: c.textDark },
  selectedText: { color: '#FFFFFF' },
  content: { padding: 20, paddingBottom: 32, width: '100%', maxWidth: 620, alignSelf: 'center' },
  heading: {
    fontFamily: fonts.extraBold,
    fontSize: 34,
    lineHeight: 41,
    letterSpacing: -1.2,
    color: c.textDark,
    marginBottom: 24,
  },
  loading: { paddingVertical: 30, alignItems: 'center', gap: 12 },
  body: { color: c.textMuted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 21 },
  sectionTitle: { color: c.textDark, fontFamily: fonts.bold, fontSize: 19, marginBottom: 12 },
  recentSection: { marginBottom: 22 },
  recentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recentChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  recent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: c.chipBg,
  },
  recentText: { color: c.primary, fontFamily: fonts.medium, fontSize: 13 },
  link: { color: c.primary, fontFamily: fonts.bold, fontSize: 13 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: c.divider,
    gap: 12,
  },
  itemImage: { width: 88, height: 92, borderRadius: 15 },
  itemFallback: { backgroundColor: c.chipBg, alignItems: 'center', justifyContent: 'center' },
  itemBody: { flex: 1, gap: 4 },
  itemTitle: { color: c.textDark, fontFamily: fonts.bold, fontSize: 16 },
  price: { color: c.primary, fontFamily: fonts.bold, fontSize: 15 },
});
