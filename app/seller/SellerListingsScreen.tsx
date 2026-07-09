// SellerListingsScreen — the seller's catalogue tab.
// Inline available / sold-out toggles, edit per row, lock badges for
// not-yet-permitted high-risk items, and (home cooks) the meal-drops section.

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
import type { ListingRow, PreOrderWindowRow, WindowStatus } from '../types/database';

type Props = CompositeScreenProps<
  BottomTabScreenProps<SellerTabParamList, 'SellerListings'>,
  NativeStackScreenProps<MainStackParamList>
>;

const WINDOW_STATUS_META: Record<WindowStatus, { label: string; bg: string; fg: string }> = {
  open: { label: 'Open', bg: '#EAF5EE', fg: '#1A5C38' },
  confirmed: { label: 'Confirmed', bg: 'rgba(39,174,96,0.18)', fg: '#1A5C38' },
  cancelled: { label: 'Cancelled', bg: 'rgba(231,76,60,0.12)', fg: '#E74C3C' },
  completed: { label: 'Completed', bg: 'rgba(0,0,0,0.06)', fg: '#6B8070' },
};

export default function SellerListingsScreen({ navigation }: Props) {
  useScreenLogger('SellerListingsScreen');
  const insets = useSafeAreaInsets();
  const { seller } = useSession();

  const [listings, setListings] = useState<ListingRow[]>([]);
  const [windows, setWindows] = useState<PreOrderWindowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sellerId = seller?.id;
  const isHomeCook = seller?.seller_type === 'home_cook';
  const permitApproved = seller?.permit_status === 'approved';

  const load = useCallback(async () => {
    if (!sellerId) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const listingQuery = supabase
        .from('listings')
        .select('*')
        .eq('seller_id', sellerId)
        .order('created_at', { ascending: false });
      const windowQuery = isHomeCook
        ? supabase
            .from('pre_order_windows')
            .select('*')
            .eq('seller_id', sellerId)
            .order('cook_date', { ascending: false })
            .limit(10)
        : null;
      const [listingRes, windowRes] = await Promise.all([listingQuery, windowQuery]);
      if (listingRes.error) throw listingRes.error;
      setListings((listingRes.data as ListingRow[]) ?? []);
      if (windowRes) {
        if (windowRes.error) throw windowRes.error;
        setWindows((windowRes.data as PreOrderWindowRow[]) ?? []);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error('Supabase', 'listings load failed', { error: msg });
      setError("We couldn't load your listings.");
    } finally {
      setLoading(false);
    }
  }, [sellerId, isHomeCook]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const patchListing = async (id: string, patch: Partial<ListingRow>) => {
    // Optimistic update — flip back on failure.
    const before = listings;
    setListings((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    const { error: err } = await supabase.from('listings').update(patch).eq('id', id);
    if (err) {
      setListings(before);
      notify.error("Couldn't update the listing. Try again.");
    }
  };

  const renderListing = ({ item }: { item: ListingRow }) => {
    const locked = isHomeCook && !permitApproved && !item.is_low_risk;
    return (
      <View style={[styles.card, locked && styles.cardLocked]}>
        <View style={styles.cardTop}>
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.thumbPlaceholder]}>
              <Ionicons name="fast-food-outline" size={22} color={lightColors.textMuted} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.listingName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.listingPrice}>{formatMoney(Number(item.price))}</Text>
            <View style={styles.chipRow}>
              {item.category ? (
                <View style={styles.categoryChip}>
                  <Text style={styles.categoryChipText}>{item.category}</Text>
                </View>
              ) : null}
              {locked && (
                <View style={styles.lockChip}>
                  <Ionicons name="lock-closed" size={11} color="#8A6D1D" />
                  <Text style={styles.lockChipText}>Locked until permit approved</Text>
                </View>
              )}
              {item.sold_out && !locked && (
                <View style={styles.soldOutChip}>
                  <Text style={styles.soldOutChipText}>Sold out</Text>
                </View>
              )}
            </View>
          </View>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => navigation.navigate('EditListing', { listingId: item.id })}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="pencil" size={17} color={lightColors.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.cardControls}>
          <View style={styles.controlItem}>
            <Text style={styles.controlLabel}>Available</Text>
            <Switch
              value={item.is_available}
              onValueChange={(v) => void patchListing(item.id, { is_available: v })}
              trackColor={{ false: 'rgba(0,0,0,0.10)', true: 'rgba(46,204,113,0.45)' }}
              thumbColor={item.is_available ? lightColors.primary : '#FFFFFF'}
              ios_backgroundColor="rgba(0,0,0,0.10)"
            />
          </View>
          <View style={styles.controlDividerV} />
          <View style={styles.controlItem}>
            <Text style={styles.controlLabel}>Sold out</Text>
            <Switch
              value={item.sold_out}
              onValueChange={(v) => void patchListing(item.id, { sold_out: v })}
              trackColor={{ false: 'rgba(0,0,0,0.10)', true: 'rgba(231,76,60,0.35)' }}
              thumbColor={item.sold_out ? lightColors.error : '#FFFFFF'}
              ios_backgroundColor="rgba(0,0,0,0.10)"
            />
          </View>
        </View>
      </View>
    );
  };

  const formatCookDate = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const listHeader = (
    <View>
      {isHomeCook && (
        <View style={{ marginBottom: spacing.md }}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Meal drops</Text>
            <TouchableOpacity
              style={styles.newDropBtn}
              onPress={() => navigation.navigate('CreatePreOrderWindow', {})}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={15} color={lightColors.primary} />
              <Text style={styles.newDropBtnText}>New drop</Text>
            </TouchableOpacity>
          </View>
          {windows.length === 0 ? (
            <View style={styles.dropsEmpty}>
              <Ionicons name="calendar-outline" size={20} color={lightColors.textMuted} />
              <Text style={styles.dropsEmptyText}>
                No meal drops yet. Schedule your first cook date and let customers pre-order!
              </Text>
            </View>
          ) : (
            windows.map((w) => {
              const meta = WINDOW_STATUS_META[w.status];
              return (
                <TouchableOpacity
                  key={w.id}
                  style={styles.dropRow}
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate('CreatePreOrderWindow', { windowId: w.id })}
                >
                  <View style={styles.dropIconWrap}>
                    <Ionicons name="calendar-outline" size={18} color={lightColors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dropTitle} numberOfLines={1}>
                      {w.title || `Drop — ${formatCookDate(w.cook_date)}`}
                    </Text>
                    <Text style={styles.dropSubtitle}>
                      Cook {formatCookDate(w.cook_date)} · min {w.min_orders} order{w.min_orders === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <View style={[styles.statusChip, { backgroundColor: meta.bg }]}>
                    <Text style={[styles.statusChipText, { color: meta.fg }]}>{meta.label}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      )}
      <Text style={styles.sectionTitle}>Listings</Text>
    </View>
  );

  if (!seller) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <BackgroundPattern />
        <View style={styles.centerFill}>
          <Text style={styles.emptyTitle}>No seller profile yet</Text>
          <Text style={styles.emptySubtitle}>Finish onboarding to start adding listings.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <BackgroundPattern />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My shop</Text>
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={lightColors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centerFill}>
          <Ionicons name="cloud-offline-outline" size={40} color={lightColors.textMuted} />
          <Text style={styles.emptyTitle}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void load()}>
            <Text style={styles.retryBtnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => item.id}
          renderItem={renderListing}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={lightColors.primary} />}
          ListEmptyComponent={
            <View style={styles.listingsEmpty}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="fast-food-outline" size={34} color={lightColors.primary} />
              </View>
              <Text style={styles.emptyTitle}>Nothing on the menu yet</Text>
              <Text style={styles.emptySubtitle}>
                Add your first listing — a good photo and a friendly description go a long way.
              </Text>
            </View>
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 20 }]}
        onPress={() => navigation.navigate('EditListing', {})}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={26} color="#FFFFFF" />
        <Text style={styles.fabText}>New</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: lightColors.background },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  header: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  headerTitle: { fontSize: 20, fontWeight: '800', color: lightColors.textDark },
  listContent: { padding: spacing.md, paddingBottom: 120 },

  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: lightColors.textDark, marginBottom: 10 },
  newDropBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: lightColors.chipBg,
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 10,
  },
  newDropBtnText: { color: lightColors.primary, fontWeight: '700', fontSize: 13 },

  dropsEmpty: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
  },
  dropsEmptyText: { flex: 1, fontSize: 12.5, color: lightColors.textMuted, lineHeight: 18 },
  dropRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: lightColors.divider,
    marginBottom: 8,
  },
  dropIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropTitle: { fontSize: 14, fontWeight: '700', color: lightColors.textDark },
  dropSubtitle: { fontSize: 12, color: lightColors.textMuted, marginTop: 2 },
  statusChip: { borderRadius: 9999, paddingHorizontal: 10, paddingVertical: 5 },
  statusChipText: { fontSize: 11.5, fontWeight: '800' },

  card: {
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    marginBottom: spacing.sm + 4,
  },
  cardLocked: { opacity: 0.75 },
  cardTop: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  thumb: { width: 60, height: 60, borderRadius: 12, backgroundColor: lightColors.inputBg },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  listingName: { fontSize: 15, fontWeight: '800', color: lightColors.textDark },
  listingPrice: { fontSize: 13.5, fontWeight: '700', color: lightColors.primary, marginTop: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 5 },
  categoryChip: {
    backgroundColor: lightColors.chipBg,
    borderRadius: 9999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  categoryChipText: { fontSize: 11, fontWeight: '700', color: lightColors.primary },
  lockChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(233,162,59,0.15)',
    borderRadius: 9999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  lockChipText: { fontSize: 11, fontWeight: '700', color: '#8A6D1D' },
  soldOutChip: {
    backgroundColor: 'rgba(231,76,60,0.10)',
    borderRadius: 9999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  soldOutChipText: { fontSize: 11, fontWeight: '700', color: lightColors.error },
  editBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  cardControls: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: lightColors.divider,
  },
  controlItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  controlDividerV: { width: 1, height: 26, backgroundColor: lightColors.divider, marginHorizontal: 12 },
  controlLabel: { fontSize: 13, fontWeight: '600', color: lightColors.textDark },

  listingsEmpty: { alignItems: 'center', paddingVertical: spacing.xl },
  emptyIconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: lightColors.textDark,
    textAlign: 'center',
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 13.5,
    color: lightColors.textMuted,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 6,
    paddingHorizontal: 24,
  },
  retryBtn: {
    marginTop: spacing.md,
    backgroundColor: lightColors.chipBg,
    borderRadius: 9999,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryBtnText: { color: lightColors.primary, fontWeight: '700' },

  fab: {
    position: 'absolute',
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: lightColors.primary,
    borderRadius: 9999,
    paddingHorizontal: 20,
    paddingVertical: 14,
    shadowColor: lightColors.primary,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  fabText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
});
