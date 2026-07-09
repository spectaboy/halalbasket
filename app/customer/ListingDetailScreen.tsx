// HalalBasket — listing detail modal: image, description, quantity stepper,
// add-to-basket CTA (single-seller cart rules apply).

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { lightColors, spacing } from '../../constants/theme';
import type { MainStackParamList } from '../navigation/types';
import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import { notify } from '../lib/notify';
import { useCart, type CartSellerInfo } from '../context/CartContext';
import { formatMoney } from '../utils/pricing';
import type { VisibleListingRow } from '../types/database';

type Props = NativeStackScreenProps<MainStackParamList, 'ListingDetail'>;

export default function ListingDetailScreen({ navigation, route }: Props) {
  const { listingId } = route.params;
  const insets = useSafeAreaInsets();
  const { items, addItem, replaceCart, setQuantity, seller: cartSeller } = useCart();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listing, setListing] = useState<VisibleListingRow | null>(null);
  const [quantity, setLocalQuantity] = useState(1);

  const fetchListing = useCallback(async () => {
    try {
      setError(null);
      const { data, error: err } = await supabase
        .from('visible_listings')
        .select('*')
        .eq('id', listingId)
        .maybeSingle();
      if (err) throw err;
      if (!data) {
        setError('This item is no longer available.');
        return;
      }
      setListing(data as VisibleListingRow);
    } catch (e: any) {
      logger.error('ListingDetail', 'fetch failed', { listingId, error: e?.message });
      setError('We could not load this item. Please try again.');
    }
  }, [listingId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchListing();
      setLoading(false);
    })();
  }, [fetchListing]);

  const handleAddToBasket = () => {
    if (!listing) return;
    if (listing.sold_out) {
      notify.warning('This item is sold out right now.');
      return;
    }
    const info: CartSellerInfo = {
      sellerId: listing.seller_id,
      sellerType: listing.seller_type,
      businessName: listing.business_name,
    };
    const prevQty = items.find((i) => i.listing.id === listing.id)?.quantity ?? 0;
    const added = addItem(listing, info);
    if (added) {
      // addItem adds one; bump to the chosen quantity on top of what was there.
      setQuantity(listing.id, prevQty + quantity);
      notify.success(`${listing.name} added to your basket.`);
      navigation.goBack();
      return;
    }
    notify.confirm({
      title: 'Start a new basket?',
      message: `Your basket has items from ${cartSeller?.businessName ?? 'another seller'}. Clear it and start a new basket from ${listing.business_name}?`,
      confirmText: 'Start new basket',
      cancelText: 'Keep current',
      destructive: true,
      onConfirm: () => {
        replaceCart(listing, info);
        setQuantity(listing.id, quantity);
        notify.success(`New basket started with ${listing.name}.`);
        navigation.goBack();
      },
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {listing?.name ?? 'Item'}
        </Text>
        <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={22} color={lightColors.textDark} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={lightColors.primary} />
        </View>
      ) : error || !listing ? (
        <View style={styles.center}>
          <Ionicons name="fast-food-outline" size={48} color={lightColors.textMuted} />
          <Text style={styles.errorTitle}>{error ?? 'Item unavailable'}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void fetchListing()}>
            <Text style={styles.retryBtnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {listing.image_url ? (
              <Image source={{ uri: listing.image_url }} style={styles.image} />
            ) : (
              <View style={[styles.image, styles.imagePlaceholder]}>
                <Ionicons name="fast-food-outline" size={44} color={lightColors.primary} />
              </View>
            )}

            <View style={styles.body}>
              <View style={styles.titleRow}>
                <Text style={styles.name}>{listing.name}</Text>
                <Text style={styles.price}>{formatMoney(listing.price)}</Text>
              </View>
              <Text style={styles.sellerLine}>from {listing.business_name}</Text>
              {!!listing.description && <Text style={styles.description}>{listing.description}</Text>}
              {listing.sold_out && (
                <View style={styles.soldOutBanner}>
                  <Ionicons name="alert-circle-outline" size={16} color={lightColors.error} />
                  <Text style={styles.soldOutBannerText}>Sold out — check back later.</Text>
                </View>
              )}

              {/* Quantity stepper */}
              <View style={styles.stepperRow}>
                <Text style={styles.stepperLabel}>Quantity</Text>
                <View style={styles.stepper}>
                  <TouchableOpacity
                    style={[styles.stepBtn, quantity <= 1 && styles.stepBtnDisabled]}
                    onPress={() => setLocalQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                  >
                    <Ionicons name="remove" size={18} color={quantity <= 1 ? lightColors.textMuted : lightColors.primary} />
                  </TouchableOpacity>
                  <Text style={styles.stepValue}>{quantity}</Text>
                  <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() => setLocalQuantity((q) => Math.min(99, q + 1))}
                  >
                    <Ionicons name="add" size={18} color={lightColors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Bottom CTA */}
          <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <TouchableOpacity
              style={[styles.ctaBtn, listing.sold_out && styles.ctaBtnDisabled]}
              activeOpacity={0.9}
              onPress={handleAddToBasket}
              disabled={listing.sold_out}
            >
              <Ionicons name="basket" size={18} color="#fff" />
              <Text style={styles.ctaText}>
                Add {quantity} to basket · {formatMoney(listing.price * quantity)}
              </Text>
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
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    gap: 12,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    color: lightColors.textDark,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: lightColors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: spacing.xl,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
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
  scrollContent: {
    paddingBottom: 24,
  },
  image: {
    width: '100%',
    height: 220,
    backgroundColor: lightColors.inputBg,
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    padding: spacing.md,
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  name: {
    flex: 1,
    fontSize: 22,
    fontWeight: '800',
    color: lightColors.textDark,
  },
  price: {
    fontSize: 18,
    fontWeight: '800',
    color: lightColors.primary,
  },
  sellerLine: {
    fontSize: 13,
    color: lightColors.textMuted,
    fontWeight: '600',
  },
  description: {
    fontSize: 14,
    color: lightColors.textMuted,
    lineHeight: 20,
    marginTop: 4,
  },
  soldOutBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FDECEA',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  soldOutBannerText: {
    color: lightColors.error,
    fontSize: 13,
    fontWeight: '600',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    padding: 16,
  },
  stepperLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: lightColors.textDark,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: lightColors.inputBg,
    borderRadius: 9999,
    padding: 4,
  },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: lightColors.divider,
  },
  stepBtnDisabled: {
    opacity: 0.5,
  },
  stepValue: {
    fontSize: 16,
    fontWeight: '800',
    color: lightColors.textDark,
    minWidth: 22,
    textAlign: 'center',
  },
  bottomBar: {
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: lightColors.divider,
    backgroundColor: lightColors.background,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: lightColors.primary,
    borderRadius: 12,
    paddingVertical: 16,
  },
  ctaBtnDisabled: {
    backgroundColor: '#C9D5CD',
  },
  ctaText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
