// HalalBasket — live order tracking. Map with seller / delivery / live driver
// markers, realtime status stepper, and an order summary panel. Mirrors the
// URide live-tracking pattern: channels are owned here and removed on unmount.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { lightColors, spacing } from '../../constants/theme';
import type { MainStackParamList } from '../navigation/types';
import { supabase } from '../config/supabase';
import { isDemoId } from '../demo/catalog';
import DemoOrderTracking from '../demo/DemoOrderTracking';
import { logger } from '../utils/logger';
import { notify } from '../lib/notify';
import { OrderService, ORDER_STATUS_LABELS } from '../services/orders';
import { formatMoney } from '../utils/pricing';
import { parseGeographyPoint, type GeoCoordinates } from '../utils/geo';
import DeliveryMapView, { type RouteMarker } from '../components/DeliveryMapView';
import type { OrderItemRow, OrderRow, OrderStatus } from '../types/database';

type Props = NativeStackScreenProps<MainStackParamList, 'OrderTracking'>;

interface OrderWithDetails extends OrderRow {
  order_items: OrderItemRow[];
  sellers: {
    business_name: string;
    address: string | null;
    location: unknown | null;
  } | null;
}

const PROGRESSION: OrderStatus[] = [
  'paid',
  'accepted',
  'preparing',
  'ready',
  'driver_assigned',
  'picked_up',
  'en_route',
  'delivered',
];

const STATUS_COPY: Record<OrderStatus, string> = {
  pending_payment: 'Waiting for your payment to complete.',
  paid: 'The seller has been notified of your order.',
  accepted: 'Your order is confirmed and will be prepared soon.',
  preparing: 'Your food is being prepared right now.',
  ready: 'Your order is packed and waiting for a driver.',
  driver_assigned: 'A driver is heading to pick up your order.',
  picked_up: 'Your order is with the driver.',
  en_route: 'Your driver is on the way to you — hang tight!',
  delivered: 'Delivered — enjoy your meal!',
  cancelled: 'This order was cancelled.',
  refunded: 'This order was refunded.',
};

export default function OrderTrackingScreen(props: Props) {
  return isDemoId(props.route.params.orderId) ? (
    <DemoOrderTracking {...props} />
  ) : (
    <LiveOrderTracking {...props} />
  );
}

function LiveOrderTracking({ navigation, route }: Props) {
  const { orderId } = route.params;
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderWithDetails | null>(null);
  const [driverLoc, setDriverLoc] = useState<(GeoCoordinates & { heading: number | null }) | null>(
    null,
  );
  const reviewPromptShown = useRef(false);

  const promptReview = useCallback(
    (current: OrderWithDetails) => {
      if (reviewPromptShown.current) return;
      reviewPromptShown.current = true;
      notify.confirm({
        title: 'Order delivered!',
        message: `How was your order from ${current.sellers?.business_name ?? 'the seller'}?`,
        confirmText: 'Leave a review',
        cancelText: 'Not now',
        onConfirm: () =>
          navigation.navigate('LeaveReview', {
            orderId: current.id,
            sellerId: current.seller_id,
            sellerName: current.sellers?.business_name ?? 'Seller',
          }),
      });
    },
    [navigation],
  );

  const fetchOrder = useCallback(async (): Promise<OrderWithDetails | null> => {
    try {
      setError(null);
      const { data, error: err } = await supabase
        .from('orders')
        .select('*, order_items(*), sellers(business_name, address, location)')
        .eq('id', orderId)
        .maybeSingle();
      if (err) throw err;
      if (!data) {
        setError('We could not find this order.');
        return null;
      }
      const typed = data as unknown as OrderWithDetails;
      setOrder(typed);
      return typed;
    } catch (e: any) {
      logger.error('OrderTracking', 'fetch failed', { orderId, error: e?.message });
      setError('We could not load your order. Please try again.');
      return null;
    }
  }, [orderId]);

  // Initial load + realtime subscriptions (cleaned up on unmount).
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const initial = await fetchOrder();
      if (mounted && initial?.status === 'delivered') promptReview(initial);
      if (mounted) setLoading(false);
    })();

    const orderChannel = OrderService.subscribeToOrder(orderId, (updated) => {
      setOrder((prev) => {
        const next = prev ? { ...prev, ...updated } : null;
        if (next && updated.status === 'delivered') promptReview(next);
        return next;
      });
    });

    const locationChannel = OrderService.subscribeToDeliveryLocation(orderId, (loc) => {
      setDriverLoc(loc);
    });

    return () => {
      mounted = false;
      supabase.removeChannel(orderChannel);
      supabase.removeChannel(locationChannel);
    };
  }, [orderId, fetchOrder, promptReview]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={lightColors.primary} />
          <Text style={styles.loadingText}>Finding your order…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !order) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.headerBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={lightColors.textDark} />
          </TouchableOpacity>
        </View>
        <View style={styles.center}>
          <Ionicons name="receipt-outline" size={48} color={lightColors.textMuted} />
          <Text style={styles.errorTitle}>{error ?? 'Order not found'}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={async () => {
              setLoading(true);
              await fetchOrder();
              setLoading(false);
            }}
          >
            <Text style={styles.retryBtnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const status = order.status;
  const terminated = status === 'cancelled' || status === 'refunded';
  const currentIndex = PROGRESSION.indexOf(status);

  const sellerCoord = parseGeographyPoint(order.sellers?.location ?? null);
  const deliveryCoord = parseGeographyPoint(order.delivery_location ?? null);

  const markers: RouteMarker[] = [];
  if (sellerCoord) {
    markers.push({
      id: 'seller',
      coordinates: sellerCoord,
      type: 'pickup',
      isCompleted: currentIndex >= PROGRESSION.indexOf('picked_up'),
      isActive: currentIndex < PROGRESSION.indexOf('picked_up'),
    });
  }
  if (deliveryCoord) {
    markers.push({
      id: 'delivery',
      coordinates: deliveryCoord,
      type: 'destination',
      isActive: true,
    });
  }
  if (driverLoc) {
    markers.push({
      id: 'driver',
      coordinates: { latitude: driverLoc.latitude, longitude: driverLoc.longitude },
      type: 'driver',
      heading: driverLoc.heading ?? 0,
    });
  }

  const routeCoordinates: Array<[number, number]> | undefined =
    sellerCoord && deliveryCoord
      ? [
          [sellerCoord.longitude, sellerCoord.latitude],
          [deliveryCoord.longitude, deliveryCoord.latitude],
        ]
      : undefined;

  const shortCode = order.id.replace(/-/g, '').slice(0, 8).toUpperCase();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ── Map ── */}
      <View style={styles.mapWrap}>
        <DeliveryMapView
          markers={markers}
          routeCoordinates={routeCoordinates}
          fitToRoute={!!routeCoordinates}
          initialCenter={sellerCoord ?? deliveryCoord ?? undefined}
          height="100%"
          routeStyle={terminated ? 'inactive' : 'active'}
        />
        <TouchableOpacity
          style={[styles.backBtn, styles.mapBack]}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={22} color={lightColors.textDark} />
        </TouchableOpacity>
      </View>

      {/* ── Bottom panel ── */}
      <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.panelHandle} />
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.panelContent}
        >
          {/* Status headline */}
          <View style={styles.statusHeader}>
            <View style={[styles.statusIconCircle, terminated && styles.statusIconCancelled]}>
              <Ionicons
                name={
                  terminated
                    ? 'close'
                    : status === 'delivered'
                      ? 'checkmark'
                      : status === 'en_route' || status === 'picked_up'
                        ? 'bicycle'
                        : 'time'
                }
                size={20}
                color="#fff"
              />
            </View>
            <View style={styles.statusHeaderText}>
              <Text style={styles.statusTitle}>{ORDER_STATUS_LABELS[status]}</Text>
              <Text style={styles.statusCopy}>{STATUS_COPY[status]}</Text>
            </View>
          </View>

          {/* Stepper */}
          {!terminated && (
            <View style={styles.stepper}>
              {PROGRESSION.map((step, idx) => {
                const done = currentIndex >= idx;
                const isCurrent = currentIndex === idx;
                return (
                  <View key={step} style={styles.stepRow}>
                    <View style={styles.stepIndicatorCol}>
                      <View
                        style={[
                          styles.stepDot,
                          done && styles.stepDotDone,
                          isCurrent && styles.stepDotCurrent,
                        ]}
                      >
                        {done && !isCurrent && <Ionicons name="checkmark" size={10} color="#fff" />}
                      </View>
                      {idx < PROGRESSION.length - 1 && (
                        <View
                          style={[styles.stepLine, currentIndex > idx && styles.stepLineDone]}
                        />
                      )}
                    </View>
                    <Text
                      style={[
                        styles.stepLabel,
                        done && styles.stepLabelDone,
                        isCurrent && styles.stepLabelCurrent,
                      ]}
                    >
                      {ORDER_STATUS_LABELS[step]}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Order summary */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryHeaderRow}>
              <Text style={styles.summarySeller} numberOfLines={1}>
                {order.sellers?.business_name ?? 'Seller'}
              </Text>
              <Text style={styles.summaryCode}>#{shortCode}</Text>
            </View>
            {order.order_items.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <Text style={styles.itemQty}>{item.quantity}×</Text>
                <Text style={styles.itemName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.itemPrice}>{formatMoney(item.unit_price * item.quantity)}</Text>
              </View>
            ))}
            <View style={styles.summaryDivider} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatMoney(order.total)}</Text>
            </View>
            <View style={styles.addressRow}>
              <Ionicons name="location-outline" size={15} color={lightColors.textMuted} />
              <Text style={styles.addressText} numberOfLines={2}>
                {order.delivery_address}
              </Text>
            </View>
          </View>

          {/* Delivered → review CTA */}
          {status === 'delivered' && (
            <TouchableOpacity
              style={styles.reviewBtn}
              activeOpacity={0.9}
              onPress={() =>
                navigation.navigate('LeaveReview', {
                  orderId: order.id,
                  sellerId: order.seller_id,
                  sellerName: order.sellers?.business_name ?? 'Seller',
                })
              }
            >
              <Ionicons name="star" size={16} color="#fff" />
              <Text style={styles.reviewBtnText}>Rate this order</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: spacing.xl,
  },
  loadingText: {
    color: lightColors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  headerBar: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: lightColors.textDark,
    textAlign: 'center',
  },
  retryBtn: {
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

  mapWrap: {
    flex: 1,
    position: 'relative',
  },
  mapBack: {
    position: 'absolute',
    top: 12,
    left: 16,
  },

  panel: {
    maxHeight: '58%',
    backgroundColor: lightColors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: -20,
    paddingTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 10,
  },
  panelHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: lightColors.divider,
    marginBottom: 8,
  },
  panelContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: 20,
  },

  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: spacing.md,
  },
  statusIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: lightColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIconCancelled: {
    backgroundColor: lightColors.error,
  },
  statusHeaderText: {
    flex: 1,
    gap: 2,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: lightColors.textDark,
  },
  statusCopy: {
    fontSize: 12.5,
    color: lightColors.textMuted,
    fontWeight: '500',
  },

  stepper: {
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    padding: 16,
    marginBottom: spacing.md,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stepIndicatorCol: {
    alignItems: 'center',
    width: 18,
  },
  stepDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: lightColors.chipBg,
    borderWidth: 2,
    borderColor: lightColors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotDone: {
    backgroundColor: lightColors.primary,
    borderColor: lightColors.primary,
  },
  stepDotCurrent: {
    backgroundColor: lightColors.primary,
    borderColor: lightColors.chipBg,
    transform: [{ scale: 1.2 }],
  },
  stepLine: {
    width: 2,
    height: 18,
    backgroundColor: lightColors.divider,
    marginVertical: 1,
  },
  stepLineDone: {
    backgroundColor: lightColors.primary,
  },
  stepLabel: {
    flex: 1,
    fontSize: 13,
    color: lightColors.textMuted,
    fontWeight: '500',
    paddingBottom: 12,
  },
  stepLabelDone: {
    color: lightColors.textDark,
    fontWeight: '600',
  },
  stepLabelCurrent: {
    color: lightColors.primary,
    fontWeight: '800',
  },

  summaryCard: {
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    padding: 16,
    gap: 8,
  },
  summaryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  summarySeller: {
    flex: 1,
    fontSize: 15.5,
    fontWeight: '800',
    color: lightColors.textDark,
  },
  summaryCode: {
    fontSize: 12.5,
    fontWeight: '700',
    color: lightColors.textMuted,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemQty: {
    fontSize: 13,
    fontWeight: '800',
    color: lightColors.primary,
    width: 26,
  },
  itemName: {
    flex: 1,
    fontSize: 13.5,
    color: lightColors.textDark,
    fontWeight: '500',
  },
  itemPrice: {
    fontSize: 13.5,
    color: lightColors.textDark,
    fontWeight: '600',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: lightColors.divider,
    marginVertical: 2,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: lightColors.textDark,
  },
  totalValue: {
    fontSize: 15,
    fontWeight: '800',
    color: lightColors.primary,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 2,
  },
  addressText: {
    flex: 1,
    fontSize: 12.5,
    color: lightColors.textMuted,
    fontWeight: '500',
    lineHeight: 17,
  },

  reviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: lightColors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: spacing.md,
  },
  reviewBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
