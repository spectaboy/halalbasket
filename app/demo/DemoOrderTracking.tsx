import React from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import { useDemo } from './DemoContext';
import { DEMO_STEPS } from './model';
import { marketplaceImage } from './images';
import { demoListings } from './catalog';
import { BackButton } from '../components/ui/Discovery';
import { ORDER_STATUS_LABELS } from '../services/orders';
import { formatMoney } from '../utils/pricing';
import { fonts } from '../../constants/typography';

type Props = NativeStackScreenProps<MainStackParamList, 'OrderTracking'>;
const copy: Record<string, string> = {
  paid: 'Your order is in',
  accepted: 'You’re on the menu',
  preparing: 'Good food takes care',
  ready: 'Packed with goodness',
  driver_assigned: 'Your rider is on the way',
  picked_up: 'Next stop, your door',
  en_route: 'Almost time to tuck in',
  delivered: 'Enjoy every bite',
};

export default function DemoOrderTracking({ navigation, route }: Props) {
  const demo = useDemo();
  const order = demo.orders.find((o) => o.id === route.params.orderId);
  if (!demo.enabled || !order)
    return (
      <SafeAreaView style={s.screen}>
        <View style={s.content}>
          <BackButton onPress={() => navigation.goBack()} />
          <Text style={s.title}>Order unavailable</Text>
          <Text style={s.body}>
            This order is no longer available. You can find your other orders in the Orders tab.
          </Text>
        </View>
      </SafeAreaView>
    );
  const step = DEMO_STEPS.indexOf(order.status);
  const delivered = order.status === 'delivered';
  const next = DEMO_STEPS[step + 1];
  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20 }}
      >
        <View style={s.hero}>
          <Image source={marketplaceImage(order.sellers.banner_url!)} style={s.photo} />
          <View style={s.back}>
            <BackButton onPress={() => navigation.goBack()} />
          </View>
          <View style={s.photoLabel}>
            <Ionicons name={delivered ? 'checkmark-circle' : 'restaurant'} size={18} color="#fff" />
            <Text style={s.photoLabelText}>{order.sellers.business_name}</Text>
          </View>
        </View>
        <View style={s.content}>
          <Text style={s.eyebrow}>{ORDER_STATUS_LABELS[order.status]}</Text>
          <Text style={s.title}>{copy[order.status] ?? 'Your order'}</Text>
          <Text style={s.body}>
            {delivered
              ? 'Enjoy your food! Leave a review or find your next favourite.'
              : order.pre_order_window_id
                ? 'A scheduled bake, reserved for you. Follow its journey from the kitchen to your door.'
                : 'Follow each step from the kitchen to your door.'}
          </Text>

          <View style={s.card}>
            <Text style={s.section}>Your order’s journey</Text>
            {DEMO_STEPS.map((status, index) => (
              <View key={status} style={s.step}>
                <View style={[s.dot, index <= step && s.dotDone]}>
                  <Ionicons
                    name={
                      index < step ? 'checkmark' : index === step ? 'ellipse' : 'ellipse-outline'
                    }
                    size={14}
                    color={index <= step ? '#fff' : '#9BAA9D'}
                  />
                </View>
                <Text
                  style={[
                    s.stepText,
                    index === step && { color: '#205A3C', fontFamily: fonts.bold },
                  ]}
                >
                  {ORDER_STATUS_LABELS[status]}
                </Text>
                {index === step && <Text style={s.now}>NOW</Text>}
              </View>
            ))}
          </View>

          {step >= 4 && !delivered && (
            <View style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
              <View style={s.rider}>
                <Ionicons name="bicycle" size={28} color="#205A3C" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.section}>Sam · your rider</Text>
                <Text style={s.body}>On the way to your door</Text>
              </View>
            </View>
          )}
          <View style={s.card}>
            <Text style={s.section}>From kitchen to doorstep</Text>
            <View style={s.routeRow}>
              <Ionicons name="storefront-outline" size={22} color="#205A3C" />
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>{order.sellers.business_name}</Text>
                <Text style={s.body}>Pickup location</Text>
              </View>
            </View>
            <View style={s.routeRow}>
              <Ionicons name="location-outline" size={22} color="#205A3C" />
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>{order.delivery_address}</Text>
                <Text style={s.body}>{order.delivery_instructions || 'Hand it to me'}</Text>
              </View>
            </View>
          </View>
          <View style={s.card}>
            <Text style={s.section}>The delicious details</Text>
            {order.order_items.map((item) => {
              const listing = demoListings.find((l) => l.id === item.listing_id);
              return (
                <View key={item.id} style={s.routeRow}>
                  {listing?.image_url && (
                    <Image source={marketplaceImage(listing.image_url)} style={s.thumb} />
                  )}
                  <Text style={[s.rowTitle, { flex: 1 }]}>
                    {item.quantity} × {item.name}
                  </Text>
                  <Text style={s.rowTitle}>{formatMoney(item.unit_price * item.quantity)}</Text>
                </View>
              );
            })}
            <View style={s.price}>
              <Text style={s.body}>Subtotal</Text>
              <Text style={s.body}>{formatMoney(order.subtotal)}</Text>
            </View>
            <View style={s.price}>
              <Text style={s.body}>Delivery + service</Text>
              <Text style={s.body}>{formatMoney(order.delivery_fee + order.service_fee)}</Text>
            </View>
            <View style={s.price}>
              <Text style={s.body}>Tax</Text>
              <Text style={s.body}>{formatMoney(order.tax)}</Text>
            </View>
            <View style={s.price}>
              <Text style={s.section}>Total</Text>
              <Text style={s.section}>{formatMoney(order.total)}</Text>
            </View>
            <Text style={s.body}>No payment taken · {order.id.slice(-8).toUpperCase()}</Text>
          </View>
          {order.reviews.length > 0 && (
            <View style={s.card}>
              <Text style={s.section}>Your review · {order.reviews[0].rating}/5</Text>
              <Text style={s.body}>
                {order.reviews[0].comment || 'Thanks for sharing your thoughts.'}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
      <View style={s.footer}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={
            !delivered
              ? 'Advance delivery'
              : order.reviews.length
                ? 'Back to orders'
                : 'Rate your order'
          }
          style={s.button}
          onPress={() => {
            if (!delivered && next) demo.advanceOrder(order.id);
            else if (!order.reviews.length)
              navigation.navigate('LeaveReview', {
                orderId: order.id,
                sellerId: order.seller_id,
                sellerName: order.sellers.business_name,
              });
            else navigation.navigate('CustomerTabs', { screen: 'Orders' });
          }}
        >
          <Text style={s.buttonText}>
            {!delivered && next
              ? `Next: ${ORDER_STATUS_LABELS[next]}`
              : order.reviews.length
                ? 'Back to orders'
                : 'Rate your order'}
          </Text>
          <Ionicons name={!delivered ? 'arrow-forward' : 'star-outline'} size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FBF8F1' },
  hero: { height: 230 },
  photo: { width: '100%', height: '100%' },
  back: { position: 'absolute', top: 14, left: 20 },
  photoLabel: {
    position: 'absolute',
    bottom: 16,
    left: 20,
    backgroundColor: '#19382AEF',
    padding: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  photoLabelText: { fontFamily: fonts.bold, color: '#fff', fontSize: 14 },
  content: { padding: 20, gap: 14 },
  eyebrow: { fontFamily: fonts.bold, fontSize: 13, color: '#205A3C' },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 32,
    lineHeight: 38,
    color: '#19382A',
    letterSpacing: -1,
  },
  body: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, color: '#667166' },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E4E6DA',
    borderRadius: 20,
    padding: 18,
    gap: 12,
  },
  section: { fontFamily: fonts.bold, fontSize: 17, color: '#19382A' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 34 },
  dot: {
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: '#F0F1E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: '#205A3C' },
  stepText: { flex: 1, fontFamily: fonts.medium, fontSize: 14, color: '#667166' },
  now: { fontFamily: fonts.extraBold, fontSize: 10, color: '#205A3C', letterSpacing: 1 },
  rider: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EAF2E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 13, color: '#19382A' },
  thumb: { width: 56, height: 56, borderRadius: 12 },
  price: { flexDirection: 'row', justifyContent: 'space-between' },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E4E6DA',
    backgroundColor: '#FBF8F1',
  },
  button: {
    backgroundColor: '#205A3C',
    padding: 18,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  buttonText: { fontFamily: fonts.bold, fontSize: 15, color: '#fff' },
});
