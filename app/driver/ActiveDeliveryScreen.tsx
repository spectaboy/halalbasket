// Active delivery loop (adapted from URide's DriverDuringRide): map with pickup +
// dropoff markers and route, live location broadcast via DeliveryLocationService,
// and a single advancing CTA: driver_assigned -> picked_up -> en_route -> delivered.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { lightColors, spacing } from '../../constants/theme';
import { supabase } from '../config/supabase';
import { useSession } from '../context/SessionContext';
import { useCurrentLocation } from '../hooks/useCurrentLocation';
import { OrderService, ORDER_STATUS_LABELS } from '../services/orders';
import { DeliveryLocationService } from '../services/deliveryLocation';
import { getRouteWithDetails } from '../lib/directions';
import { parseGeographyPoint, GeoCoordinates } from '../utils/geo';
import { formatMoney } from '../utils/pricing';
import { notify } from '../lib/notify';
import { logger } from '../utils/logger';
import DeliveryMapView, { DeliveryMapViewRef, RouteMarker } from '../components/DeliveryMapView';
import type { OrderItemRow, OrderRow, OrderStatus } from '../types/database';
import type { MainStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'ActiveDelivery'>;

interface DeliveryOrder extends OrderRow {
  order_items: OrderItemRow[];
  seller: { business_name: string; address: string | null; location: unknown | null } | null;
  customer: { first_name: string | null; last_name: string | null; phone: string | null } | null;
}

const ACTIVE_STATUSES: OrderStatus[] = ['driver_assigned', 'picked_up', 'en_route'];

const CTA_BY_STATUS: Partial<
  Record<OrderStatus, { label: string; next: OrderStatus; icon: keyof typeof Ionicons.glyphMap }>
> = {
  driver_assigned: { label: 'Arrived at pickup — picked up', next: 'picked_up', icon: 'bag-check-outline' },
  picked_up: { label: 'Start delivery', next: 'en_route', icon: 'navigate-outline' },
  en_route: { label: 'Mark delivered', next: 'delivered', icon: 'checkmark-circle-outline' },
};

export default function ActiveDeliveryScreen({ route, navigation }: Props) {
  const { orderId } = route.params;
  const { driver } = useSession();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { location: driverLocation } = useCurrentLocation();

  const [order, setOrder] = useState<DeliveryOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [routeCoords, setRouteCoords] = useState<Array<[number, number]>>([]);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);

  const mapRef = useRef<DeliveryMapViewRef>(null);
  const trackingStartedRef = useRef(false);

  const loadOrder = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(
          '*, order_items(*), seller:sellers(business_name, address, location), customer:users(first_name, last_name, phone)'
        )
        .eq('id', orderId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Order not found');
      setOrder(data as unknown as DeliveryOrder);
      setLoadError(null);
    } catch (err: any) {
      logger.error('Supabase', 'active delivery load failed', { orderId, error: err?.message });
      setLoadError('Could not load this delivery');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  // Keep the order in sync with realtime status changes (e.g. cancellation).
  useEffect(() => {
    const channel = OrderService.subscribeToOrder(orderId, (updated) => {
      setOrder((prev) => (prev ? { ...prev, ...updated } : prev));
      if (updated.status === 'cancelled' || updated.status === 'refunded') {
        DeliveryLocationService.stopTracking();
        notify.warning('This order was cancelled');
      }
    });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId]);

  const pickupCoords = useMemo<GeoCoordinates | null>(
    () => (order?.seller ? parseGeographyPoint(order.seller.location) : null),
    [order?.seller]
  );
  const dropoffCoords = useMemo<GeoCoordinates | null>(
    () => (order ? parseGeographyPoint(order.delivery_location) : null),
    [order]
  );

  // Broadcast the driver's live position for the duration of the delivery.
  useEffect(() => {
    if (!driver || !order) return;
    if (trackingStartedRef.current) return;
    if (!ACTIVE_STATUSES.includes(order.status)) return;
    trackingStartedRef.current = true;
    void DeliveryLocationService.startTracking(order.id, driver.id).then((ok) => {
      if (!ok) {
        notify.warning('Enable location so the customer can track their delivery');
      }
    });
  }, [driver, order]);

  // Always stop broadcasting when the screen unmounts.
  useEffect(() => {
    return () => {
      DeliveryLocationService.stopTracking();
    };
  }, []);

  // Fetch the pickup -> dropoff route for the map polyline + ETA.
  useEffect(() => {
    if (!pickupCoords || !dropoffCoords) return;
    let disposed = false;
    void (async () => {
      try {
        const result = await getRouteWithDetails(
          pickupCoords.latitude,
          pickupCoords.longitude,
          dropoffCoords.latitude,
          dropoffCoords.longitude
        );
        if (!disposed && result) {
          setRouteCoords(result.coordinates);
          setEtaMinutes(result.etaMinutes);
          setDistanceKm(result.distanceKm);
        }
      } catch (err: any) {
        logger.warn('Maps', 'route fetch failed', { error: err?.message });
      }
    })();
    return () => {
      disposed = true;
    };
  }, [pickupCoords, dropoffCoords]);

  const advanceStatus = async () => {
    if (!order || updating) return;
    const step = CTA_BY_STATUS[order.status];
    if (!step) return;

    if (step.next === 'delivered') {
      const ok = await notify.confirm({
        title: 'Mark delivered?',
        message: 'Confirm the customer has received their order.',
        confirmText: 'Mark delivered',
      });
      if (!ok) return;
    }

    setUpdating(true);
    try {
      await OrderService.updateStatus(order.id, step.next);
      setOrder((prev) => (prev ? { ...prev, status: step.next } : prev));
      if (step.next === 'delivered') {
        DeliveryLocationService.stopTracking();
        notify.success('Delivery complete — nice work!');
      }
    } catch (err: any) {
      logger.error('Supabase', 'delivery status advance failed', { orderId, error: err?.message });
      notify.error('Could not update the delivery status');
    } finally {
      setUpdating(false);
    }
  };

  const openNavigation = () => {
    if (!order) return;
    const toPickup = order.status === 'driver_assigned';
    const target = toPickup ? pickupCoords : dropoffCoords;
    const fallbackAddress = toPickup ? order.seller?.address ?? '' : order.delivery_address;

    let url: string;
    let webFallback: string;
    if (target) {
      url =
        Platform.OS === 'android'
          ? `google.navigation:q=${target.latitude},${target.longitude}`
          : `maps://?daddr=${target.latitude},${target.longitude}`;
      webFallback = `https://www.google.com/maps/dir/?api=1&destination=${target.latitude},${target.longitude}`;
    } else {
      const q = encodeURIComponent(fallbackAddress);
      url = Platform.OS === 'android' ? `google.navigation:q=${q}` : `maps://?daddr=${q}`;
      webFallback = `https://www.google.com/maps/dir/?api=1&destination=${q}`;
    }

    Linking.openURL(url).catch(() => {
      Linking.openURL(webFallback).catch(() => notify.error('Could not open a maps app'));
    });
  };

  const contactCustomer = () => {
    const phone = order?.customer?.phone;
    if (phone) {
      Linking.openURL(`tel:${phone}`).catch(() => notify.error('Could not start a call'));
    } else {
      notify.info('In-app contact is coming soon');
    }
  };

  const contactSeller = () => {
    notify.info('In-app contact is coming soon');
  };

  const goHome = () => {
    navigation.navigate('DriverTabs', { screen: 'DriverHome' });
  };

  // ── Loading / error states ─────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={lightColors.primary} />
      </View>
    );
  }

  if (loadError || !order) {
    return (
      <View style={styles.centerState}>
        <Ionicons name="cloud-offline-outline" size={40} color={lightColors.textMuted} />
        <Text style={styles.centerStateTitle}>{loadError ?? 'Delivery not found'}</Text>
        <TouchableOpacity style={styles.centerStateBtn} onPress={() => void loadOrder()}>
          <Text style={styles.centerStateBtnText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={goHome}>
          <Text style={styles.centerStateLink}>Back to home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Terminal states ────────────────────────────────────────────────────────

  if (order.status === 'delivered') {
    return (
      <View style={styles.centerState}>
        <View style={styles.successIcon}>
          <Ionicons name="checkmark" size={48} color="#fff" />
        </View>
        <Text style={styles.successTitle}>Delivery complete!</Text>
        <Text style={styles.successSubtitle}>
          You earned {formatMoney(order.delivery_fee)} for this delivery.
        </Text>
        <TouchableOpacity style={styles.centerStateBtn} onPress={goHome} activeOpacity={0.85}>
          <Text style={styles.centerStateBtnText}>Back to home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (order.status === 'cancelled' || order.status === 'refunded') {
    return (
      <View style={styles.centerState}>
        <Ionicons name="close-circle-outline" size={48} color={lightColors.error} />
        <Text style={styles.centerStateTitle}>This order was cancelled</Text>
        <TouchableOpacity style={styles.centerStateBtn} onPress={goHome} activeOpacity={0.85}>
          <Text style={styles.centerStateBtnText}>Back to home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Active delivery ────────────────────────────────────────────────────────

  const cta = CTA_BY_STATUS[order.status];
  const pastPickup = order.status === 'picked_up' || order.status === 'en_route';

  const markers: RouteMarker[] = [];
  if (pickupCoords) {
    markers.push({
      id: 'pickup',
      type: 'pickup',
      coordinates: pickupCoords,
      isActive: !pastPickup,
      isCompleted: pastPickup,
    });
  }
  if (dropoffCoords) {
    markers.push({ id: 'dropoff', type: 'dropoff', coordinates: dropoffCoords, isActive: pastPickup });
  }
  if (driverLocation) {
    markers.push({ id: 'me', type: 'driver', coordinates: driverLocation, heading: driver?.heading ?? 0 });
  }

  const customerName =
    [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(' ') || 'Customer';
  const itemCount = order.order_items?.reduce((sum, it) => sum + it.quantity, 0) ?? 0;
  const panelMaxHeight = Math.round(windowHeight * 0.54);

  return (
    <View style={styles.container}>
      <DeliveryMapView
        ref={mapRef}
        markers={markers}
        routeCoordinates={routeCoords.length > 0 ? routeCoords : undefined}
        initialCenter={pickupCoords ?? dropoffCoords ?? driverLocation ?? undefined}
        fitToRoute
        boundsPadding={[100, 60, Math.round(windowHeight * 0.56), 60]}
        height="100%"
      />

      {/* Back button */}
      <TouchableOpacity
        style={[styles.floatingBack, { top: insets.top + spacing.sm }]}
        onPress={goHome}
        activeOpacity={0.85}
      >
        <Ionicons name="arrow-back" size={22} color={lightColors.primary} />
      </TouchableOpacity>

      {/* Bottom panel */}
      <View
        style={[styles.panel, { maxHeight: panelMaxHeight, paddingBottom: Math.max(insets.bottom, spacing.sm) }]}
      >
        <View style={styles.panelHandle} />

        <View style={styles.panelHeaderRow}>
          <View style={styles.statusChip}>
            <Text style={styles.statusChipText}>{ORDER_STATUS_LABELS[order.status]}</Text>
          </View>
          {etaMinutes !== null && distanceKm !== null ? (
            <Text style={styles.etaText}>
              {Math.round(etaMinutes)} min · {distanceKm.toFixed(1)} km
            </Text>
          ) : null}
          <TouchableOpacity style={styles.navigateBtn} onPress={openNavigation} activeOpacity={0.85}>
            <Ionicons name="navigate" size={16} color={lightColors.primary} />
            <Text style={styles.navigateBtnText}>Navigate</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Pickup card */}
          <View style={[styles.stopCard, !pastPickup && styles.stopCardActive]}>
            <View style={styles.stopIconWrap}>
              <Ionicons name="storefront-outline" size={18} color={lightColors.primary} />
            </View>
            <View style={styles.stopTextWrap}>
              <Text style={styles.stopOverline}>Pickup</Text>
              <Text style={styles.stopTitle} numberOfLines={1}>
                {order.seller?.business_name ?? 'Halal seller'}
              </Text>
              <Text style={styles.stopAddress} numberOfLines={2}>
                {order.seller?.address ?? 'Address unavailable'}
              </Text>
            </View>
            <TouchableOpacity style={styles.contactBtn} onPress={contactSeller}>
              <Ionicons name="call-outline" size={18} color={lightColors.primary} />
            </TouchableOpacity>
          </View>

          {/* Dropoff card */}
          <View style={[styles.stopCard, pastPickup && styles.stopCardActive]}>
            <View style={styles.stopIconWrap}>
              <Ionicons name="flag-outline" size={18} color={lightColors.primary} />
            </View>
            <View style={styles.stopTextWrap}>
              <Text style={styles.stopOverline}>Drop-off</Text>
              <Text style={styles.stopTitle} numberOfLines={1}>
                {customerName}
              </Text>
              <Text style={styles.stopAddress} numberOfLines={2}>
                {order.delivery_address}
              </Text>
              {order.delivery_instructions ? (
                <View style={styles.instructionsChip}>
                  <Ionicons name="information-circle-outline" size={14} color={lightColors.primary} />
                  <Text style={styles.instructionsText} numberOfLines={3}>
                    {order.delivery_instructions}
                  </Text>
                </View>
              ) : null}
            </View>
            <TouchableOpacity style={styles.contactBtn} onPress={contactCustomer}>
              <Ionicons name="call-outline" size={18} color={lightColors.primary} />
            </TouchableOpacity>
          </View>

          {/* Order summary */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryHeaderRow}>
              <Text style={styles.summaryTitle}>
                {itemCount} item{itemCount === 1 ? '' : 's'}
              </Text>
              <View style={styles.payoutChip}>
                <Text style={styles.payoutChipText}>Payout {formatMoney(order.delivery_fee)}</Text>
              </View>
            </View>
            {(order.order_items ?? []).map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <Text style={styles.itemQty}>{item.quantity}×</Text>
                <Text style={styles.itemName} numberOfLines={1}>
                  {item.name}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Primary CTA */}
        {cta ? (
          <TouchableOpacity
            style={[styles.ctaBtn, updating && styles.ctaBtnDisabled]}
            onPress={() => void advanceStatus()}
            disabled={updating}
            activeOpacity={0.85}
          >
            {updating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name={cta.icon} size={20} color="#fff" />
                <Text style={styles.ctaBtnText}>{cta.label}</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.background,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lightColors.background,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  centerStateTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: lightColors.textDark,
    textAlign: 'center',
  },
  centerStateBtn: {
    marginTop: spacing.sm,
    backgroundColor: lightColors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  centerStateBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  centerStateLink: {
    marginTop: spacing.sm,
    color: lightColors.primary,
    fontWeight: '700',
    fontSize: 15,
  },
  successIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: lightColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: lightColors.textDark,
  },
  successSubtitle: {
    fontSize: 15,
    color: lightColors.textMuted,
    textAlign: 'center',
  },

  floatingBack: {
    position: 'absolute',
    left: spacing.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: lightColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: lightColors.divider,
    shadowColor: lightColors.cardShadow,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },

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
  statusChip: {
    backgroundColor: lightColors.chipBg,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: lightColors.primary,
  },
  etaText: {
    flex: 1,
    fontSize: 13,
    color: lightColors.textMuted,
    fontWeight: '600',
  },
  navigateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: lightColors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginLeft: 'auto',
  },
  navigateBtnText: {
    color: lightColors.primary,
    fontSize: 13,
    fontWeight: '700',
  },

  stopCard: {
    flexDirection: 'row',
    backgroundColor: lightColors.background,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    marginBottom: spacing.sm,
  },
  stopCardActive: {
    borderColor: lightColors.primary,
  },
  stopIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  stopTextWrap: { flex: 1 },
  stopOverline: {
    fontSize: 11,
    fontWeight: '800',
    color: lightColors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  stopTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: lightColors.textDark,
    marginBottom: 2,
  },
  stopAddress: {
    fontSize: 13,
    lineHeight: 18,
    color: lightColors.textMuted,
  },
  instructionsChip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: lightColors.chipBg,
    borderRadius: 10,
    padding: 10,
    marginTop: spacing.sm,
  },
  instructionsText: {
    flex: 1,
    fontSize: 13,
    color: lightColors.textDark,
  },
  contactBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: lightColors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginLeft: spacing.sm,
  },

  summaryCard: {
    backgroundColor: lightColors.background,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    marginBottom: spacing.sm,
  },
  summaryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  summaryTitle: {
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
    fontSize: 13,
    fontWeight: '800',
    color: lightColors.primary,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
  },
  itemQty: {
    fontSize: 13,
    fontWeight: '700',
    color: lightColors.primary,
    width: 28,
  },
  itemName: {
    flex: 1,
    fontSize: 14,
    color: lightColors.textDark,
  },

  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: lightColors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: spacing.xs,
  },
  ctaBtnDisabled: { opacity: 0.6 },
  ctaBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
