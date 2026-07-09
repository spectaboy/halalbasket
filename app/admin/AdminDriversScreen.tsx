// Admin drivers tab: verification queue segmented Pending / Approved /
// Rejected, with driver name (users join) + vehicle summary in each row.
// Realtime-refreshes on any drivers table change.

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
import type { DriverRow, VerificationStatus } from '../types/database';

type Nav = NativeStackNavigationProp<MainStackParamList>;

interface DriverWithUser extends DriverRow {
  users: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
}

const SEGMENTS: { key: VerificationStatus; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export const vehicleSummary = (v: DriverRow['vehicle_info']): string => {
  const main = [v?.year, v?.make, v?.model].filter(Boolean).join(' ');
  const extra = [v?.color, v?.plate].filter(Boolean).join(' · ');
  return [main, extra].filter(Boolean).join(' · ') || 'No vehicle info';
};

export default function AdminDriversScreen() {
  const navigation = useNavigation<Nav>();
  const [segment, setSegment] = useState<VerificationStatus>('pending');
  const [drivers, setDrivers] = useState<DriverWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (status: VerificationStatus) => {
    try {
      const { data, error } = await supabase
        .from('drivers')
        .select('*, users(first_name, last_name, email)')
        .eq('verification_status', status)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setDrivers((data ?? []) as unknown as DriverWithUser[]);
    } catch (e: any) {
      notify.error(e?.message ?? 'Failed to load drivers');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load(segment);
  }, [segment, load]);

  // One long-lived channel; callback reloads whatever segment is showing.
  const reloadRef = useRef<() => void>(() => {});
  reloadRef.current = () => load(segment);
  useEffect(() => {
    const ch = supabase
      .channel('admin-drivers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => {
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

  const renderItem = ({ item }: { item: DriverWithUser }) => {
    const name =
      [item.users?.first_name, item.users?.last_name].filter(Boolean).join(' ') || 'Unnamed driver';
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('AdminDriverReview', { driverId: item.id })}
      >
        <View style={styles.cardTop}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {item.is_online && (
            <View style={styles.onlineChip}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineText}>Online</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
        </View>
        <View style={styles.vehicleRow}>
          <Ionicons name="car-outline" size={14} color={lightColors.textMuted} />
          <Text style={styles.vehicleText} numberOfLines={1}>
            {vehicleSummary(item.vehicle_info)}
          </Text>
        </View>
        <Text style={styles.sub}>Submitted {fmtDate(item.created_at)}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Drivers</Text>
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
          data={drivers}
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
              <Ionicons name="car-outline" size={40} color="#9CA3AF" />
              <Text style={styles.emptyText}>No {segment} drivers.</Text>
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
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: 16, fontWeight: '700', color: lightColors.textDark },
  onlineChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: lightColors.chipBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: lightColors.primary },
  onlineText: { fontSize: 11, fontWeight: '700', color: lightColors.primary },
  vehicleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  vehicleText: { flex: 1, fontSize: 13, color: lightColors.textDark, fontWeight: '600' },
  sub: { fontSize: 12, color: lightColors.textMuted, marginTop: 6 },
  emptyWrap: { alignItems: 'center', gap: 10, marginTop: 60 },
  emptyText: { fontSize: 15, color: lightColors.textMuted },
});
