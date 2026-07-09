// Admin sellers tab: verification queue segmented Pending / Approved /
// Rejected. Rows show seller_type + (for home cooks) compliance chips.
// Realtime-refreshes on any sellers table change.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { MainStackParamList } from '../navigation/types';
import { supabase } from '../config/supabase';
import { lightColors } from '../../constants/theme';
import { notify } from '../lib/notify';
import type {
  SellerRow,
  SellerType,
  VerificationStatus,
  PermitStatus,
  FoodCategoryTier,
} from '../types/database';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export const SELLER_TYPE_META: Record<SellerType, { label: string; color: string }> = {
  restaurant: { label: 'Restaurant', color: '#E67E22' },
  butcher: { label: 'Butcher', color: '#C0392B' },
  home_cook: { label: 'Home cook', color: '#8E44AD' },
};

const TIER_LABELS: Record<FoodCategoryTier, string> = {
  low_risk: 'Low risk',
  high_risk: 'High risk',
};

export const PERMIT_LABELS: Record<PermitStatus, string> = {
  none: 'No permit',
  course_done: 'Course done',
  permit_applied: 'Permit applied',
  inspection_scheduled: 'Inspection scheduled',
  approved: 'Permit approved',
};

const SEGMENTS: { key: VerificationStatus; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export default function AdminSellersScreen() {
  const navigation = useNavigation<Nav>();
  const [segment, setSegment] = useState<VerificationStatus>('pending');
  const [sellers, setSellers] = useState<SellerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (status: VerificationStatus) => {
    try {
      const { data, error } = await supabase
        .from('sellers')
        .select('*')
        .eq('verification_status', status)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setSellers((data ?? []) as SellerRow[]);
    } catch (e: any) {
      notify.error(e?.message ?? 'Failed to load sellers');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load(segment);
  }, [segment, load]);

  // One long-lived channel; the callback always reloads the *current* segment.
  const reloadRef = useRef<() => void>(() => {});
  reloadRef.current = () => load(segment);
  useEffect(() => {
    const ch = supabase
      .channel('admin-sellers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sellers' }, () => {
        reloadRef.current();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    load(segment);
  };

  const renderItem = ({ item }: { item: SellerRow }) => {
    const typeMeta = SELLER_TYPE_META[item.seller_type];
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('AdminSellerReview', { sellerId: item.id })}
      >
        <View style={styles.cardTop}>
          <Text style={styles.name} numberOfLines={1}>
            {item.business_name}
          </Text>
          <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
        </View>
        <View style={styles.chipsRow}>
          <View style={[styles.chip, { backgroundColor: typeMeta.color + '1A' }]}>
            <Text style={[styles.chipText, { color: typeMeta.color }]}>{typeMeta.label}</Text>
          </View>
          {item.seller_type === 'home_cook' && item.food_category_tier && (
            <View
              style={[
                styles.chip,
                {
                  backgroundColor:
                    item.food_category_tier === 'high_risk' ? 'rgba(231,76,60,0.10)' : lightColors.chipBg,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  {
                    color:
                      item.food_category_tier === 'high_risk' ? lightColors.error : lightColors.primary,
                  },
                ]}
              >
                {TIER_LABELS[item.food_category_tier]}
              </Text>
            </View>
          )}
          {item.seller_type === 'home_cook' && (
            <View
              style={[
                styles.chip,
                {
                  backgroundColor:
                    item.permit_status === 'approved' ? lightColors.chipBg : '#F3F4F6',
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: item.permit_status === 'approved' ? lightColors.primary : '#6B7280' },
                ]}
              >
                {PERMIT_LABELS[item.permit_status]}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.sub}>Submitted {fmtDate(item.created_at)}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Sellers</Text>
      </View>

      <View style={styles.segmentWrap}>
        {SEGMENTS.map((s) => (
          <TouchableOpacity
            key={s.key}
            style={[styles.segment, segment === s.key && styles.segmentActive]}
            onPress={() => setSegment(s.key)}
          >
            <Text style={[styles.segmentText, segment === s.key && styles.segmentTextActive]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={lightColors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={sellers}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={lightColors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="storefront-outline" size={40} color="#9CA3AF" />
              <Text style={styles.emptyText}>No {segment} sellers.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9F8' },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ECEFED',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: lightColors.textDark },
  segmentWrap: {
    flexDirection: 'row',
    margin: 16,
    marginBottom: 0,
    backgroundColor: '#ECEFED',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  segment: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  segmentActive: { backgroundColor: '#fff' },
  segmentText: { fontSize: 13, fontWeight: '600', color: lightColors.textMuted },
  segmentTextActive: { color: lightColors.primary, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: lightColors.divider,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { flex: 1, fontSize: 16, fontWeight: '700', color: lightColors.textDark, marginRight: 8 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  chipText: { fontSize: 12, fontWeight: '700' },
  sub: { fontSize: 12, color: lightColors.textMuted, marginTop: 8 },
  emptyWrap: { alignItems: 'center', gap: 10, marginTop: 60 },
  emptyText: { fontSize: 15, color: lightColors.textMuted },
});
