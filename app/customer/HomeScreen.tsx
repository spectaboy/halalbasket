import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { lightColors as c } from '../../constants/theme';
import { fonts } from '../../constants/typography';
import type { CustomerTabParamList, MainStackParamList } from '../navigation/types';
import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import { useSession } from '../context/SessionContext';
import { useCart } from '../context/CartContext';
import { useDemo } from '../demo/DemoContext';
import { demoSellers } from '../demo/catalog';
import DemoAddress from '../demo/DemoAddress';
import { marketplaceImage } from '../demo/images';
import { formatMoney } from '../utils/pricing';
import {
  CategoryTiles,
  DiscoveryEmpty,
  SellerCard,
  discoveryImages,
} from '../components/ui/Discovery';
import type { Database, PreOrderWindowRow } from '../types/database';

type Seller = Database['public']['Views']['public_sellers']['Row'];
type Drop = PreOrderWindowRow & { sellers: { business_name: string } | null };
type Props = CompositeScreenProps<
  BottomTabScreenProps<CustomerTabParamList, 'Home'>,
  NativeStackScreenProps<MainStackParamList>
>;
const cookDate = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

export default function HomeScreen({ navigation }: Props) {
  const demo = useDemo();
  const [addressOpen, setAddressOpen] = useState(false);
  const { user } = useSession();
  const { itemCount, subtotal } = useCart();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openNow, setOpenNow] = useState<Seller[]>([]);
  const [topRated, setTopRated] = useState<Seller[]>([]);
  const [drops, setDrops] = useState<Drop[]>([]);

  const fetchAll = useCallback(async () => {
    try {
      setError(null);
      if (demo.enabled) {
        setOpenNow(demoSellers.filter((s) => s.is_open));
        setTopRated(demoSellers.slice(0, 5));
        setDrops(
          demo.windows.map((w) => ({
            ...w,
            sellers: demoSellers.find((s) => s.id === w.seller_id)!,
          })),
        );
        return;
      }
      const [open, top, upcoming] = await Promise.all([
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
      if (open.error) throw open.error;
      if (top.error) throw top.error;
      if (upcoming.error) throw upcoming.error;
      setOpenNow((open.data ?? []) as Seller[]);
      setTopRated((top.data ?? []) as Seller[]);
      setDrops((upcoming.data ?? []) as unknown as Drop[]);
    } catch (e: any) {
      logger.error('Home', 'fetch failed', { error: e?.message });
      setError('We could not load the marketplace. Please try again.');
    }
  }, [demo.enabled, demo.windows]);
  useEffect(() => {
    void fetchAll().finally(() => setLoading(false));
  }, [fetchAll]);
  const refresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };
  const firstName = user?.first_name?.trim();
  const name = firstName ? `${firstName[0].toUpperCase()}${firstName.slice(1)}` : '';
  const featured = topRated.length ? topRated : openNow;

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: itemCount ? 100 : 28 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.primary} />
        }
      >
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Change delivery address"
          onPress={() => (demo.enabled ? setAddressOpen(true) : navigation.navigate('EditProfile'))}
          style={s.address}
        >
          <Ionicons name="location-outline" size={25} color={c.textDark} />
          <View style={{ flex: 1 }}>
            <Text style={s.overline}>Deliver to</Text>
            <View style={s.addressLine}>
              <Text style={s.addressText} numberOfLines={1}>
                {demo.enabled ? demo.address : user?.default_address || 'Set delivery address'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={c.textDark} />
            </View>
          </View>
        </TouchableOpacity>
        <Text style={s.heading}>
          What sounds{'\n'}good{name ? `, ${name}` : ''}?
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Search food and sellers"
          style={s.search}
          onPress={() => navigation.navigate('Search', { initialQuery: undefined })}
        >
          <Ionicons name="search-outline" size={21} color={c.textDark} />
          <Text style={s.searchText}>Search restaurants, dishes…</Text>
        </TouchableOpacity>
        <CategoryTiles
          onPress={(sellerType) => navigation.navigate('CategoryBrowse', { sellerType })}
        />
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Explore local halal food"
          activeOpacity={0.9}
          onPress={() => navigation.navigate('Search', { initialQuery: undefined })}
          style={s.hero}
        >
          <Image
            source={discoveryImages.restaurant}
            style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['transparent', 'rgba(12,29,19,0.2)', 'rgba(12,29,19,0.88)']}
            locations={[0, 0.3, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={s.heroBody}>
            <Text style={s.heroTitle}>Your next{'\n'}favourite is nearby</Text>
            <Text style={s.heroSubtitle}>Great food from your neighbourhood.</Text>
            <View style={s.heroAction}>
              <Text style={s.heroActionText}>Explore now</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </View>
          </View>
        </TouchableOpacity>
        {loading ? (
          <View style={s.loading}>
            <ActivityIndicator color={c.primary} />
            <Text style={s.body}>Finding your local favourites…</Text>
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
          <>
            {featured.length > 0 ? (
              <View>
                <View style={s.sectionHeader}>
                  <Text style={s.sectionTitle}>
                    {topRated.length ? 'Popular on HalalBasket' : 'Open now'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => navigation.navigate('Search', { initialQuery: undefined })}
                    style={s.seeAll}
                  >
                    <Text style={s.link}>See all</Text>
                  </TouchableOpacity>
                </View>
                {featured.slice(0, 3).map((seller) => (
                  <SellerCard
                    key={seller.id}
                    seller={seller}
                    compact
                    onPress={() => navigation.navigate('SellerDetail', { sellerId: seller.id })}
                  />
                ))}
              </View>
            ) : (
              <DiscoveryEmpty
                title="Good things are on the way"
                message="Your local marketplace is growing. Explore restaurants, fresh cuts and home-cooked meal drops while sellers get ready."
                onPress={() => navigation.navigate('CategoryBrowse', { sellerType: 'restaurant' })}
              />
            )}
            {!!topRated.length && !!openNow.length && (
              <View>
                <Text style={s.sectionTitle}>Open now</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.rail}
                >
                  {openNow.map((seller) => (
                    <View key={seller.id} style={{ width: 280 }}>
                      <SellerCard
                        seller={seller}
                        onPress={() => navigation.navigate('SellerDetail', { sellerId: seller.id })}
                      />
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
            <View>
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>From home, with love</Text>
                <Ionicons name="heart-outline" size={21} color={c.primary} />
              </View>
              <Text style={s.body}>
                Reserve a meal from a local cook. Made for you, on their next cooking day.
              </Text>
              {drops.length ? (
                drops.map((drop) => (
                  <TouchableOpacity
                    key={drop.id}
                    accessibilityRole="button"
                    style={s.drop}
                    onPress={() =>
                      navigation.navigate('PreOrderWindowDetail', {
                        windowId: drop.id,
                        sellerId: drop.seller_id,
                      })
                    }
                  >
                    {demo.enabled ? (
                      <Image
                        source={marketplaceImage(
                          demoSellers.find((s) => s.id === drop.seller_id)?.banner_url ??
                            'demo:baklava',
                        )}
                        style={{ width: 76, height: 90, borderRadius: 12 }}
                      />
                    ) : (
                      <View style={s.calendar}>
                        <Ionicons name="calendar-outline" size={24} color={c.primary} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={s.dropTitle}>{drop.title || 'Home-cooked meal drop'}</Text>
                      <Text style={s.body}>{drop.sellers?.business_name || 'Home cook'}</Text>
                      <Text style={s.dropDate}>Cooks {cookDate(drop.cook_date)}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={c.primary} />
                  </TouchableOpacity>
                ))
              ) : (
                <TouchableOpacity
                  style={s.cookTeaser}
                  onPress={() => navigation.navigate('CategoryBrowse', { sellerType: 'home_cook' })}
                  accessibilityRole="button"
                >
                  <Image source={discoveryImages.home_cook} style={s.cookPhoto} />
                  <View style={s.cookBody}>
                    <Text style={s.dropTitle}>Meet your neighbourhood cooks</Text>
                    <Text style={s.body}>Upcoming meal drops will appear here.</Text>
                    <Text style={s.link}>Explore home cooks →</Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </ScrollView>
      <DemoAddress visible={addressOpen} onClose={() => setAddressOpen(false)} />
      {itemCount > 0 && (
        <TouchableOpacity
          style={s.cart}
          accessibilityLabel="View basket"
          accessibilityRole="button"
          onPress={() => navigation.navigate('Cart')}
        >
          <View style={s.cartCount}>
            <Text style={s.cartText}>{itemCount}</Text>
          </View>
          <Text style={[s.cartText, { flex: 1 }]}>View basket</Text>
          <Text style={s.cartText}>{formatMoney(subtotal)}</Text>
          <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 20,
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
  },
  address: { flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 44 },
  overline: { color: c.textMuted, fontFamily: fonts.regular, fontSize: 12 },
  addressLine: { flexDirection: 'row', gap: 7, alignItems: 'center' },
  addressText: { color: c.textDark, fontFamily: fonts.bold, fontSize: 14, flexShrink: 1 },
  heading: {
    fontSize: 34,
    lineHeight: 41,
    fontFamily: fonts.extraBold,
    color: c.textDark,
    letterSpacing: -1.2,
  },
  search: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#D8DCD1',
    borderRadius: 17,
    paddingHorizontal: 16,
  },
  searchText: { fontSize: 14, fontFamily: fonts.regular, color: c.textMuted, flex: 1 },
  hero: { height: 270, borderRadius: 22, overflow: 'hidden', justifyContent: 'flex-end' },
  heroBody: { padding: 20, gap: 8 },
  heroTitle: {
    color: '#FFFFFF',
    fontFamily: fonts.extraBold,
    fontSize: 28,
    lineHeight: 33,
    letterSpacing: -0.8,
  },
  heroSubtitle: { fontSize: 13, fontFamily: fonts.medium, color: '#FFFFFF' },
  heroAction: {
    backgroundColor: '#C65312',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderRadius: 24,
    alignSelf: 'flex-start',
    paddingHorizontal: 18,
    minHeight: 46,
    marginTop: 4,
  },
  heroActionText: { fontFamily: fonts.bold, fontSize: 14, color: '#FFFFFF' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 6,
  },
  sectionTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 21,
    color: c.textDark,
    letterSpacing: -0.5,
    flexShrink: 1,
  },
  seeAll: { minHeight: 44, justifyContent: 'center' },
  link: { fontFamily: fonts.bold, fontSize: 13, color: c.primary },
  body: { color: c.textMuted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 21 },
  loading: { flexDirection: 'row', gap: 12, paddingVertical: 20, alignItems: 'center' },
  rail: { gap: 14, paddingTop: 14 },
  drop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: c.divider,
  },
  calendar: {
    backgroundColor: c.chipBg,
    borderRadius: 14,
    width: 52,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropTitle: { fontFamily: fonts.bold, fontSize: 17, color: c.textDark },
  dropDate: { fontFamily: fonts.semibold, fontSize: 12, color: c.primary, marginTop: 4 },
  cookTeaser: { flexDirection: 'row', gap: 14, marginTop: 16 },
  cookPhoto: { width: 104, height: 130, borderRadius: 16 },
  cookBody: { flex: 1, gap: 7, justifyContent: 'center' },
  cart: {
    position: 'absolute',
    bottom: 12,
    left: 20,
    right: 20,
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: c.primary,
  },
  cartCount: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  cartText: { fontFamily: fonts.bold, fontSize: 15, color: '#FFFFFF' },
});
