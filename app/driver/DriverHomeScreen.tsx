// Deliver tab — map-forward driver home (URide pattern). Full-height map centred
// on the driver, big online/offline toggle, and an "Available deliveries" bottom
// panel fed by a realtime orders subscription. Claims are atomic: the update is
// guarded with .is('driver_id', null) so only one driver wins the order.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';

import { lightColors, spacing } from '../../constants/theme';
import { supabase } from '../config/supabase';
import { useSession } from '../context/SessionContext';
import { useCurrentLocation } from '../hooks/useCurrentLocation';
import { ORDER_STATUS_LABELS } from '../services/orders';
import { formatMoney } from '../utils/pricing';
import { notify } from '../lib/notify';
import { logger } from '../utils/logger';
import DeliveryMapView, { DeliveryMapViewRef, RouteMarker } from '../components/DeliveryMapView';
import BackgroundPattern from '../components/BackgroundPattern';
import type { OrderRow, OrderStatus } from '../types/database';
import type { MainStackParamList } from '../navigation/types';

const AVAILABLE_STATUSES: OrderStatus[] = ['paid', 'accepted', 'preparing', 'ready'];
const ACTIVE_STATUSES: OrderStatus[] = ['driver_assigned', 'picked_up', 'en_route'];

interface FeedOrder extends OrderRow {
  seller: { business_name: string; address: string | null } | null;
}

const shortenAddress = (addr: string | null | undefined): string => {
  if (!addr) return 'Address on acceptance';
  return addr.split(',')[0].trim();
};

export default function DriverHomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { driver, refresh } = useSession();
  const { location, loading: locationLoading } = useCurrentLocation();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const [isOnline, setIsOnline] = useState<boolean>(driver?.is_online ?? false);
  const [toggling, setToggling] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [available, setAvailable] = useState<FeedOrder[]>([]);
  const [activeOrder, setActiveOrder] = useState<FeedOrder | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const mapRef = useRef<DeliveryMapViewRef>(null);
  const hasCenteredRef = useRef(false);

  const isApproved = driver?.verification_status === 'approved';

  // Keep the local online flag in sync with the session's driver row.
  useEffect(() => {
    if (driver) setIsOnline(driver.is_online);
  }, [driver]);

  // Centre the map on the driver the first time we get a fix.
  useEffect(() => {
    if (location && !hasCenteredRef.current) {
      hasCenteredRef.current = true;
      mapRef.current?.setCamera({ center: [location.longitude, location.latitude], zoom: 14 });
    }
  }, [location]);

  const loadOrders = useCallback(async () => {
    if (!driver) return;
    try {
      const [availableRes, activeRes] = await Promise.all([
        supabase
          .from('orders')
          .select('*, seller:sellers(business_name, address)')
          .is('driver_id', null)
          .in('status', AVAILABLE_STATUSES)
          .order('placed_at', { ascending: true }),
        supabase
          .from('orders')
          .select('*, seller:sellers(business_name, address)')
          .eq('driver_id', driver.id)
          .in('status', ACTIVE_STATUSES)
          .order('placed_at', { ascending: true })
          .limit(1),
      ]);
      if (availableRes.error) throw availableRes.error;
      if (activeRes.error) throw activeRes.error;
      setAvailable((availableRes.data ?? []) as unknown as FeedOrder[]);
      const active = (activeRes.data ?? []) as unknown as FeedOrder[];
      setActiveOrder(active[0] ?? null);
      setLoadError(null);
    } catch (err: any) {
      logger.error('Supabase', 'driver home orders load failed', { error: err?.message });
      setLoadError('Could not load deliveries');
    } finally {
      setOrdersLoading(false);
    }
  }, [driver]);

  // Reload whenever the tab regains focus (e.g. returning from a delivery).
  useFocusEffect(
    useCallback(() => {
      if (isApproved) void loadOrders();
    }, [isApproved, loadOrders])
  );

  // Realtime feed: any order INSERT/UPDATE can change the available list (we
  // can't row-filter on "driver_id is null", so filter client-side + debounce).
  useEffect(() => {
    if (!driver || !isApproved || !isOnline) return;
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleReload = () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => void loadOrders(), 400);
    };
    const handleChange = (payload: any) => {
      const row = payload.new as OrderRow | undefined;
      if (!row) return;
      if (row.driver_id === null || row.driver_id === driver.id) scheduleReload();
    };

    const channel = supabase
      .channel(`driver-available-orders:${driver.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, handleChange)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, handleChange)
      .subscribe();

    return () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      supabase.removeChannel(channel);
    };
  }, [driver, isApproved, isOnline, loadOrders]);

  const toggleOnline = async () => {
    if (!driver || toggling) return;
    setToggling(true);
    try {
      const next = !isOnline;
      let locationPatch: Partial<{ current_lat: number; current_lng: number; location_updated_at: string }> = {};
      if (next) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          notify.error('Location permission is required to go online');
          return;
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        locationPatch = {
          current_lat: pos.coords.latitude,
          current_lng: pos.coords.longitude,
          location_updated_at: new Date().toISOString(),
        };
      }
      const { error } = await supabase
        .from('drivers')
        .update({ is_online: next, ...locationPatch })
        .eq('id', driver.id);
      if (error) throw error;
      setIsOnline(next);
      if (next) {
        setOrdersLoading(true);
        void loadOrders();
      }
    } catch (err: any) {
      logger.error('Supabase', 'driver online toggle failed', { error: err?.message });
      notify.error('Could not update your status');
    } finally {
      setToggling(false);
    }
  };

  const acceptOrder = async (orderId: string) => {
    if (!driver || claimingId) return;
    setClaimingId(orderId);
    try {
      const { data, error } = await supabase
        .from('orders')
        .update({ driver_id: driver.id, status: 'driver_assigned' })
        .eq('id', orderId)
        .is('driver_id', null)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) {
        notify.error('Already taken by another driver');
        void loadOrders();
        return;
      }
      navigation.navigate('ActiveDelivery', { orderId });
    } catch (err: any) {
      logger.error('Supabase', 'order claim failed', { orderId, error: err?.message });
      notify.error('Could not accept this delivery');
    } finally {
      setClaimingId(null);
    }
  };

  // ── Gated states (no driver record / not yet approved) ─────────────────────

  if (!driver) {
    return (
      <View style={styles.gateContainer}>
        <BackgroundPattern />
        <View style={[styles.gateContent, { paddingTop: insets.top + spacing.xl }]}>
          <View style={styles.gateIcon}>
            <Ionicons name="bicycle" size={40} color={lightColors.primary} />
          </View>
          <Text style={styles.gateTitle}>Deliver with HalalBasket</Text>
          <Text style={styles.gateSubtitle}>
            Earn on your schedule delivering halal food in your city.
          </Text>
          <TouchableOpacity
            style={styles.gateBtn}
            onPress={() => navigation.navigate('DriverOnboarding')}
            activeOpacity={0.85}
          >
            <Text style={styles.gateBtnText}>Apply to drive</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!isApproved) {
    const rejected = driver.verification_status === 'rejected';
    return (
      <View style={styles.gateContainer}>
        <BackgroundPattern />
        <View style={[styles.gateContent, { paddingTop: insets.top + spacing.xl }]}>
          <View style={[styles.gateIcon, rejected && styles.gateIconError]}>
            <Ionicons
              name={rejected ? 'alert-circle-outline' : 'hourglass-outline'}
              size={40}
              color={rejected ? lightColors.error : lightColors.primary}
            />
          </View>
          <Text style={styles.gateTitle}>
            {rejected ? 'Application not approved' : 'Verification pending'}
          </Text>
          <Text style={styles.gateSubtitle}>
            {rejected
              ? driver.rejection_reason?.trim() || 'Please resubmit with clear, readable documents.'
              : 'We’re reviewing your documents. You’ll be able to deliver as soon as you’re approved.'}
          </Text>
          {rejected ? (
            <TouchableOpacity
              style={styles.gateBtn}
              onPress={() => navigation.navigate('DriverOnboarding')}
              activeOpacity={0.85}
            >
              <Text style={styles.gateBtnText}>Resubmit application</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.gateBtn}
              onPress={() => navigation.navigate('DriverVerificationPending')}
              activeOpacity={0.85}
            >
              <Text style={styles.gateBtnText}>View application status</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // ── Approved driver: map + toggle + deliveries panel ───────────────────────

  const markers: RouteMarker[] = location
    ? [{ id: 'me', type: 'driver', coordinates: location, heading: driver.heading ?? 0 }]
    : [];

  const panelMaxHeight = Math.round(windowHeight * 0.46);

  const renderOrderItem = ({ item }: { item: FeedOrder }) => (
    <View style={styles.orderCard}>
      <View style={styles.orderTopRow}>
        <View style={styles.orderSellerRow}>
          <View style={styles.orderSellerIcon}>
            <Ionicons name="storefront-outline" size={16} color={lightColors.primary} />
          </View>
          <Text style={styles.orderSellerName} numberOfLines={1}>
            {item.seller?.business_name ?? 'Halal seller'}
          </Text>
        </View>
        <View style={styles.payoutChip}>
          <Text style={styles.payoutChipText}>{formatMoney(item.delivery_fee)}</Text>
        </View>
      </View>

      <View style={styles.routeRow}>
        <Ionicons name="location-outline" size={14} color={lightColors.textMuted} />
        <Text style={styles.routeText} numberOfLines={1}>
          {shortenAddress(item.seller?.address)}
        </Text>
      </View>
      <View style={styles.routeRow}>
        <Ionicons name="flag-outline" size={14} color={lightColors.textMuted} />
        <Text style={styles.routeText} numberOfLines={1}>
          {shortenAddress(item.delivery_address)}
        </Text>
      </View>

      <View style={styles.orderBottomRow}>
        <View style={styles.statusChip}>
          <Text style={styles.statusChipText}>{ORDER_STATUS_LABELS[item.status]}</Text>
        </View>
        <TouchableOpacity
          style={[styles.acceptBtn, claimingId === item.id && styles.acceptBtnDisabled]}
          onPress={() => void acceptOrder(item.id)}
          disabled={claimingId !== null}
          activeOpacity={0.85}
        >
          {claimingId === item.id ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.acceptBtnText}>Accept</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderPanelBody = () => {
    if (activeOrder) {
      return (
        <TouchableOpacity
          style={styles.resumeBanner}
          onPress={() => navigation.navigate('ActiveDelivery', { orderId: activeOrder.id })}
          activeOpacity={0.9}
        >
          <View style={styles.resumeIcon}>
            <Ionicons name="navigate" size={20} color="#fff" />
          </View>
          <View style={styles.resumeTextWrap}>
            <Text style={styles.resumeTitle}>Resume delivery</Text>
            <Text style={styles.resumeSubtitle} numberOfLines={1}>
              {activeOrder.seller?.business_name ?? 'Pickup'} → {shortenAddress(activeOrder.delivery_address)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#fff" />
        </TouchableOpacity>
      );
    }

    if (!isOnline) {
      return (
        <View style={styles.panelEmpty}>
          <Ionicons name="moon-outline" size={28} color={lightColors.textMuted} />
          <Text style={styles.panelEmptyTitle}>You're offline</Text>
          <Text style={styles.panelEmptyText}>Go online to see available deliveries nearby.</Text>
        </View>
      );
    }

    if (ordersLoading) {
      return (
        <View style={styles.panelEmpty}>
          <ActivityIndicator color={lightColors.primary} />
        </View>
      );
    }

    if (loadError) {
      return (
        <View style={styles.panelEmpty}>
          <Text style={styles.panelEmptyTitle}>{loadError}</Text>
          <TouchableOpacity onPress={() => void loadOrders()} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (available.length === 0) {
      return (
        <View style={styles.panelEmpty}>
          <Ionicons name="cube-outline" size={28} color={lightColors.textMuted} />
          <Text style={styles.panelEmptyTitle}>No deliveries right now</Text>
          <Text style={styles.panelEmptyText}>Hang tight — new orders appear here in real time.</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={available}
        keyExtractor={(item) => item.id}
        renderItem={renderOrderItem}
        contentContainerStyle={styles.orderList}
        showsVerticalScrollIndicator={false}
      />
    );
  };

  return (
    <View style={styles.container}>
      <DeliveryMapView
        ref={mapRef}
        markers={markers}
        initialCenter={location ?? undefined}
        initialZoom={14}
        fitToRoute={false}
        height="100%"
      />

      {locationLoading && !location ? (
        <View style={[styles.locatingPill, { top: insets.top + 72 }]}>
          <ActivityIndicator size="small" color={lightColors.primary} />
          <Text style={styles.locatingText}>Finding you…</Text>
        </View>
      ) : null}

      {/* Online / offline toggle */}
      <View style={[styles.toggleWrap, { top: insets.top + spacing.sm }]}>
        <TouchableOpacity
          style={[styles.toggleBtn, isOnline ? styles.toggleBtnOnline : styles.toggleBtnOffline]}
          onPress={() => void toggleOnline()}
          disabled={toggling}
          activeOpacity={0.85}
        >
          {toggling ? (
            <ActivityIndicator size="small" color={isOnline ? lightColors.primary : '#fff'} />
          ) : (
            <>
              <View style={[styles.toggleDot, isOnline ? styles.toggleDotOn : styles.toggleDotOff]} />
              <Text style={[styles.toggleText, isOnline && styles.toggleTextOnline]}>
                {isOnline ? "You're online — tap to go offline" : 'Go online'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Bottom panel */}
      <View
        style={[
          styles.panel,
          { maxHeight: panelMaxHeight, paddingBottom: Math.max(insets.bottom, spacing.sm) },
        ]}
      >
        <View style={styles.panelHandle} />
        <View style={styles.panelHeaderRow}>
          <Text style={styles.panelTitle}>
            {activeOrder ? 'Current delivery' : 'Available deliveries'}
          </Text>
          {!activeOrder && isOnline && !ordersLoading ? (
            <View style={styles.countChip}>
              <Text style={styles.countChipText}>{available.length}</Text>
            </View>
          ) : null}
        </View>
        {renderPanelBody()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.background,
  },

  // gates
  gateContainer: {
    flex: 1,
    backgroundColor: lightColors.background,
    overflow: 'hidden',
  },
  gateContent: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  gateIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  gateIconError: {
    backgroundColor: 'rgba(231,76,60,0.10)',
  },
  gateTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: lightColors.textDark,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  gateSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: lightColors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  gateBtn: {
    alignSelf: 'stretch',
    backgroundColor: lightColors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  gateBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // toggle
  toggleWrap: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 12,
    paddingVertical: 16,
    shadowColor: lightColors.cardShadow,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  toggleBtnOffline: {
    backgroundColor: lightColors.primary,
  },
  toggleBtnOnline: {
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.divider,
  },
  toggleDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  toggleDotOn: {
    backgroundColor: '#27AE60',
  },
  toggleDotOff: {
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  toggleText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  toggleTextOnline: {
    color: lightColors.textDark,
  },
  locatingPill: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: lightColors.surface,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: lightColors.divider,
  },
  locatingText: {
    fontSize: 13,
    color: lightColors.textMuted,
    fontWeight: '600',
  },

  // panel
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: lightColors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    shadowColor: lightColors.cardShadow,
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  panelHandle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: lightColors.divider,
    marginBottom: spacing.sm,
  },
  panelHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  panelTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: lightColors.textDark,
  },
  countChip: {
    backgroundColor: lightColors.chipBg,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: lightColors.primary,
  },
  panelEmpty: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: 6,
  },
  panelEmptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: lightColors.textDark,
  },
  panelEmptyText: {
    fontSize: 13,
    color: lightColors.textMuted,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: lightColors.chipBg,
  },
  retryBtnText: {
    color: lightColors.primary,
    fontWeight: '700',
    fontSize: 14,
  },

  // order cards
  orderList: {
    paddingBottom: spacing.sm,
  },
  orderCard: {
    backgroundColor: lightColors.background,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    marginBottom: spacing.sm,
  },
  orderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  orderSellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: spacing.sm,
  },
  orderSellerIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderSellerName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: lightColors.textDark,
  },
  payoutChip: {
    backgroundColor: lightColors.chipBg,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  payoutChipText: {
    fontSize: 14,
    fontWeight: '800',
    color: lightColors.primary,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  routeText: {
    flex: 1,
    fontSize: 13,
    color: lightColors.textMuted,
  },
  orderBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  statusChip: {
    backgroundColor: lightColors.inputBg,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: lightColors.textMuted,
  },
  acceptBtn: {
    backgroundColor: lightColors.primary,
    borderRadius: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    minWidth: 96,
    alignItems: 'center',
  },
  acceptBtnDisabled: {
    opacity: 0.7,
  },
  acceptBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },

  // resume banner
  resumeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightColors.primary,
    borderRadius: 16,
    padding: 16,
    marginBottom: spacing.sm,
  },
  resumeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  resumeTextWrap: { flex: 1 },
  resumeTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 2,
  },
  resumeSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
  },
});
