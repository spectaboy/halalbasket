// HalalBasket — the basket. Single-seller cart with quantity steppers and a
// checkout CTA.

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { lightColors, spacing } from '../../constants/theme';
import type { MainStackParamList } from '../navigation/types';
import { notify } from '../lib/notify';
import { useCart } from '../context/CartContext';
import { formatMoney } from '../utils/pricing';

type Props = NativeStackScreenProps<MainStackParamList, 'Cart'>;

export default function CartScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { seller, items, subtotal, itemCount, setQuantity, removeItem, clearCart } = useCart();

  const handleClear = () => {
    notify.confirm({
      title: 'Empty basket?',
      message: 'Remove all items from your basket?',
      confirmText: 'Empty basket',
      cancelText: 'Keep items',
      destructive: true,
      onConfirm: clearCart,
    });
  };

  const isEmpty = items.length === 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={lightColors.textDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Your basket</Text>
        {isEmpty ? (
          <View style={styles.backBtn} />
        ) : (
          <TouchableOpacity style={styles.backBtn} onPress={handleClear}>
            <Ionicons name="trash-outline" size={20} color={lightColors.error} />
          </TouchableOpacity>
        )}
      </View>

      {isEmpty ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="basket-outline" size={44} color={lightColors.primary} />
          </View>
          <Text style={styles.emptyTitle}>Your basket is empty</Text>
          <Text style={styles.emptyHint}>
            Browse halal restaurants, butchers, and home cooks to fill it up.
          </Text>
          <TouchableOpacity
            style={styles.browseBtn}
            activeOpacity={0.9}
            onPress={() => navigation.navigate('CustomerTabs', { screen: 'Home' })}
          >
            <Text style={styles.browseBtnText}>Start browsing</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Seller header */}
            {seller && (
              <TouchableOpacity
                style={styles.sellerHeader}
                activeOpacity={0.8}
                onPress={() => navigation.navigate('SellerDetail', { sellerId: seller.sellerId })}
              >
                <View style={styles.sellerIconCircle}>
                  <Ionicons
                    name={seller.sellerType === 'home_cook' ? 'home' : seller.sellerType === 'butcher' ? 'storefront' : 'restaurant'}
                    size={18}
                    color={lightColors.primary}
                  />
                </View>
                <View style={styles.sellerHeaderText}>
                  <Text style={styles.sellerName} numberOfLines={1}>
                    {seller.businessName}
                  </Text>
                  {seller.preOrderWindowId ? (
                    <View style={styles.preOrderRow}>
                      <Ionicons name="calendar-outline" size={12} color={lightColors.primary} />
                      <Text style={styles.preOrderText}>Pre-order meal drop</Text>
                    </View>
                  ) : (
                    <Text style={styles.sellerHint}>Add more items</Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={18} color={lightColors.textMuted} />
              </TouchableOpacity>
            )}

            {/* Items */}
            {items.map(({ listing, quantity }) => (
              <View key={listing.id} style={styles.itemRow}>
                {listing.image_url ? (
                  <Image source={{ uri: listing.image_url }} style={styles.itemImage} />
                ) : (
                  <View style={[styles.itemImage, styles.itemImagePlaceholder]}>
                    <Ionicons name="fast-food-outline" size={20} color={lightColors.primary} />
                  </View>
                )}
                <View style={styles.itemBody}>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {listing.name}
                  </Text>
                  <Text style={styles.itemPrice}>{formatMoney(listing.price * quantity)}</Text>
                </View>
                <View style={styles.stepper}>
                  <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() =>
                      quantity <= 1 ? removeItem(listing.id) : setQuantity(listing.id, quantity - 1)
                    }
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Ionicons
                      name={quantity <= 1 ? 'trash-outline' : 'remove'}
                      size={16}
                      color={quantity <= 1 ? lightColors.error : lightColors.primary}
                    />
                  </TouchableOpacity>
                  <Text style={styles.stepValue}>{quantity}</Text>
                  <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() => setQuantity(listing.id, Math.min(99, quantity + 1))}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Ionicons name="add" size={16} color={lightColors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {/* Subtotal */}
            <View style={styles.subtotalCard}>
              <View style={styles.subtotalRow}>
                <Text style={styles.subtotalLabel}>
                  Subtotal ({itemCount} {itemCount === 1 ? 'item' : 'items'})
                </Text>
                <Text style={styles.subtotalValue}>{formatMoney(subtotal)}</Text>
              </View>
              <Text style={styles.subtotalHint}>
                Delivery, service fee, and tax calculated at checkout.
              </Text>
            </View>
          </ScrollView>

          {/* Checkout bar */}
          <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <TouchableOpacity
              style={styles.checkoutBtn}
              activeOpacity={0.9}
              onPress={() => navigation.navigate('Checkout')}
            >
              <Text style={styles.checkoutBtnText}>Go to checkout</Text>
              <Text style={styles.checkoutBtnAmount}>{formatMoney(subtotal)}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: lightColors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: lightColors.textDark,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: 40,
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: spacing.xl,
  },
  emptyIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: lightColors.textDark,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 13.5,
    color: lightColors.textMuted,
    textAlign: 'center',
    lineHeight: 19,
  },
  browseBtn: {
    marginTop: 10,
    backgroundColor: lightColors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 40,
  },
  browseBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },

  // Seller header
  sellerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: lightColors.chipBg,
    borderRadius: 16,
    padding: 14,
    marginBottom: spacing.md,
  },
  sellerIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerHeaderText: {
    flex: 1,
    gap: 2,
  },
  sellerName: {
    fontSize: 15.5,
    fontWeight: '800',
    color: lightColors.textDark,
  },
  sellerHint: {
    fontSize: 12,
    color: lightColors.textMuted,
    fontWeight: '500',
  },
  preOrderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  preOrderText: {
    fontSize: 12,
    fontWeight: '700',
    color: lightColors.primary,
  },

  // Item rows
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    padding: 12,
    marginBottom: 10,
  },
  itemImage: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: lightColors.inputBg,
  },
  itemImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemBody: {
    flex: 1,
    gap: 3,
  },
  itemName: {
    fontSize: 14.5,
    fontWeight: '700',
    color: lightColors.textDark,
  },
  itemPrice: {
    fontSize: 13.5,
    fontWeight: '800',
    color: lightColors.primary,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: lightColors.inputBg,
    borderRadius: 9999,
    padding: 4,
  },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: lightColors.divider,
  },
  stepValue: {
    fontSize: 14.5,
    fontWeight: '800',
    color: lightColors.textDark,
    minWidth: 18,
    textAlign: 'center',
  },

  // Subtotal
  subtotalCard: {
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    padding: 16,
    marginTop: 6,
    gap: 6,
  },
  subtotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subtotalLabel: {
    fontSize: 14.5,
    fontWeight: '600',
    color: lightColors.textDark,
  },
  subtotalValue: {
    fontSize: 16,
    fontWeight: '800',
    color: lightColors.textDark,
  },
  subtotalHint: {
    fontSize: 12,
    color: lightColors.textMuted,
    fontWeight: '500',
  },

  // Checkout bar
  bottomBar: {
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: lightColors.divider,
    backgroundColor: lightColors.background,
  },
  checkoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: lightColors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  checkoutBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  checkoutBtnAmount: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
});
