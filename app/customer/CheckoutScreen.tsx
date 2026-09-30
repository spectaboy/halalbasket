import { fonts } from '../../constants/typography';
// HalalBasket — checkout. Quotes fees via quoteOrder(), creates the order +
// items (status pending_payment), then runs the Stripe PaymentSheet flow:
// create-order-payment -> initPaymentSheet -> presentPaymentSheet ->
// confirm-order-payment. Sheet cancel leaves the order pending for retry.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useStripe } from '@stripe/stripe-react-native';
import { lightColors, spacing } from '../../constants/theme';
import type { MainStackParamList } from '../navigation/types';
import { supabase } from '../config/supabase';
import { useDemo } from '../demo/DemoContext';
import { isDemoId } from '../demo/catalog';
import { demoQuote } from '../demo/model';
import { marketplaceImage } from '../demo/images';
import { logger } from '../utils/logger';
import { notify } from '../lib/notify';
import { useCart } from '../context/CartContext';
import { useSession } from '../context/SessionContext';
import { getPlatformFees, quoteOrder, formatMoney, type OrderQuote } from '../utils/pricing';
import type { SellerType } from '../types/database';

type Props = NativeStackScreenProps<MainStackParamList, 'Checkout'>;

interface SellerBilling {
  seller_type: SellerType;
  commission_rate: number;
}

export default function CheckoutScreen({ navigation }: Props) {
  const demo = useDemo();
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const { seller: cartSeller, items, subtotal, itemCount, clearCart } = useCart();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const [address, setAddress] = useState(
    demo.enabled ? demo.address : (user?.default_address ?? ''),
  );
  const [instructions, setInstructions] = useState('');
  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(true);
  const [paying, setPaying] = useState(false);
  /** Order created but not yet paid (PaymentSheet cancelled) — reused on retry. */
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [sellerBilling, setSellerBilling] = useState<SellerBilling | null>(null);

  const canPay = useMemo(
    () => !!cartSeller && items.length > 0 && !!quote && address.trim().length > 0 && !paying,
    [cartSeller, items.length, quote, address, paying],
  );

  const loadQuote = useCallback(async () => {
    if (!cartSeller || items.length === 0) {
      setLoadingQuote(false);
      return;
    }
    setLoadingQuote(true);
    setQuoteError(null);
    try {
      if (demo.enabled) {
        setQuote(demoQuote(subtotal));
        return;
      }
      if (isDemoId(cartSeller.sellerId)) throw new Error('Return to the preview marketplace to use this basket.');
      const [{ data: sellerRow, error: sErr }, fees] = await Promise.all([
        supabase
          .from('sellers')
          .select('seller_type, commission_rate')
          .eq('id', cartSeller.sellerId)
          .maybeSingle(),
        getPlatformFees(),
      ]);
      if (sErr) throw sErr;
      if (!sellerRow) throw new Error('Seller not found');
      const billing: SellerBilling = {
        seller_type: sellerRow.seller_type as SellerType,
        commission_rate: Number(sellerRow.commission_rate),
      };
      setSellerBilling(billing);
      setQuote(quoteOrder(subtotal, billing.seller_type, fees, billing.commission_rate));
    } catch (e: any) {
      logger.error('Checkout', 'quote failed', { error: e?.message });
      setQuoteError('We could not calculate your fees. Please try again.');
    } finally {
      setLoadingQuote(false);
    }
  }, [cartSeller, items.length, subtotal, demo.enabled]);

  useEffect(() => {
    void loadQuote();
  }, [loadQuote]);

  /** Create the pending_payment order + snapshot items; returns the order id. */
  const createOrder = useCallback(async (): Promise<string> => {
    if (!user || !cartSeller || !quote || !sellerBilling) throw new Error('Checkout not ready');
    if (isDemoId(cartSeller.sellerId) || items.some((i) => isDemoId(i.listing.id)))
      throw new Error('This basket cannot be paid for.');
    const trimmedAddress = address.trim();
    const orderInsert: Record<string, unknown> = {
      customer_id: user.id,
      seller_id: cartSeller.sellerId,
      pre_order_window_id: cartSeller.preOrderWindowId ?? null,
      status: 'pending_payment',
      delivery_address: trimmedAddress,
      delivery_instructions: instructions.trim() || null,
      subtotal: quote.subtotal,
      delivery_fee: quote.deliveryFee,
      service_fee: quote.serviceFee,
      tax: quote.tax,
      total: quote.total,
      commission_rate: quote.commissionRate,
      commission_amount: quote.commissionAmount,
    };
    // Reuse the saved coordinates when delivering to the default address.
    if (
      user.default_address &&
      trimmedAddress === user.default_address &&
      typeof user.default_location === 'string'
    ) {
      orderInsert.delivery_location = user.default_location;
    }

    const { data: orderRow, error: oErr } = await supabase
      .from('orders')
      .insert(orderInsert)
      .select('id')
      .single();
    if (oErr) throw oErr;
    const orderId = (orderRow as { id: string }).id;

    const { error: iErr } = await supabase.from('order_items').insert(
      items.map((i) => ({
        order_id: orderId,
        listing_id: i.listing.id,
        name: i.listing.name,
        unit_price: i.listing.price,
        quantity: i.quantity,
      })),
    );
    if (iErr) throw iErr;
    return orderId;
  }, [user, cartSeller, quote, sellerBilling, address, instructions, items]);

  const handlePay = useCallback(async () => {
    if (!canPay || !quote) return;
    if (!user) {
      notify.error('You need to be signed in to place an order.');
      return;
    }
    setPaying(true);
    try {
      if (demo.enabled) {
        if (!cartSeller) return;
        const orderId = demo.placeOrder(items, cartSeller, address, instructions);
        clearCart();
        navigation.replace('OrderConfirmation', { orderId });
        return;
      }
      // 1–2. Create (or reuse) the pending order + items.
      let orderId = pendingOrderId;
      if (!orderId) {
        orderId = await createOrder();
        setPendingOrderId(orderId);
      }

      // 3. Ask the edge function for a PaymentIntent.
      const { data, error: fnErr } = await supabase.functions.invoke('create-order-payment', {
        body: { orderId },
      });
      if (fnErr) throw fnErr;
      const { clientSecret, ephemeralKey, customerId } = (data ?? {}) as {
        clientSecret?: string;
        ephemeralKey?: string;
        customerId?: string;
      };
      if (!clientSecret) throw new Error('Payment could not be initialised');

      // 4. Present the PaymentSheet.
      const { error: initErr } = await initPaymentSheet({
        paymentIntentClientSecret: clientSecret,
        customerEphemeralKeySecret: ephemeralKey,
        customerId,
        merchantDisplayName: 'HalalBasket',
      });
      if (initErr) throw new Error(initErr.message);

      const { error: sheetErr } = await presentPaymentSheet();
      if (sheetErr) {
        if (String(sheetErr.code) === 'Canceled') {
          // Leave the order pending_payment; the customer can retry.
          notify.info('Payment cancelled — your order is saved so you can try again.');
          return;
        }
        throw new Error(sheetErr.message);
      }

      // 5. Confirm server-side, then hand off to confirmation.
      const { error: confirmErr } = await supabase.functions.invoke('confirm-order-payment', {
        body: { orderId },
      });
      if (confirmErr) {
        // Money was taken; surface but continue to confirmation for tracking.
        logger.error('Checkout', 'confirm-order-payment failed', {
          orderId,
          error: confirmErr.message,
        });
      }
      clearCart();
      notify.success('Order placed — the seller has been notified!');
      navigation.replace('OrderConfirmation', { orderId });
    } catch (e: any) {
      logger.error('Checkout', 'payment failed', { error: e?.message });
      notify.error(e?.message ?? 'Something went wrong taking your payment. Please try again.');
    } finally {
      setPaying(false);
    }
  }, [
    canPay,
    quote,
    user,
    pendingOrderId,
    createOrder,
    initPaymentSheet,
    presentPaymentSheet,
    clearCart,
    navigation,
    demo,
    cartSeller,
    items,
    address,
    instructions,
  ]);

  // Guard: nothing to check out.
  if (!cartSeller || items.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityLabel="Go back"
            accessibilityRole="button"
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={22} color={lightColors.textDark} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Checkout</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.center}>
          <Ionicons name="basket-outline" size={48} color={lightColors.textMuted} />
          <Text style={styles.emptyTitle}>Nothing to check out</Text>
          <Text style={styles.emptyHint}>Your basket is empty. Add some items first.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityLabel="Go back"
          accessibilityRole="button"
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={22} color={lightColors.textDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Checkout</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Seller summary */}
          <View style={styles.sellerCard}>
            <Ionicons name="storefront" size={18} color={lightColors.primary} />
            <Text style={styles.sellerText} numberOfLines={1}>
              {itemCount} {itemCount === 1 ? 'item' : 'items'} from {cartSeller.businessName}
            </Text>
          </View>

          <View style={{ gap: 12, marginBottom: 16 }}>
            {items.map(({ listing, quantity }) => (
              <View
                key={listing.id}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
              >
                {listing.image_url && (
                  <Image
                    source={marketplaceImage(listing.image_url)}
                    style={{ width: 64, height: 64, borderRadius: 12 }}
                  />
                )}
                <Text style={[styles.sellerText, { flex: 1 }]}>
                  {quantity} × {listing.name}
                </Text>
                <Text style={[styles.sellerText, { flex: 0 }]}>
                  {formatMoney(listing.price * quantity)}
                </Text>
              </View>
            ))}
          </View>

          {cartSeller.preOrderWindowId && (
            <View style={styles.preOrderNote}>
              <Ionicons name="calendar" size={16} color={lightColors.primary} />
              <Text style={styles.preOrderNoteText}>
                Pre-order meal drop — you'll be refunded automatically if the drop doesn't reach its
                minimum orders.
              </Text>
            </View>
          )}

          {/* Delivery address */}
          <Text style={styles.fieldLabel}>Delivery address</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="location-outline" size={18} color={lightColors.textMuted} />
            <TextInput
              style={styles.input}
              value={address}
              onChangeText={setAddress}
              placeholder="Street, city, postal code"
              placeholderTextColor={lightColors.textMuted}
              multiline
            />
          </View>
          {address.trim().length === 0 && (
            <Text style={styles.fieldError}>A delivery address is required.</Text>
          )}

          {/* Instructions */}
          <Text style={styles.fieldLabel}>Delivery instructions (optional)</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="chatbox-ellipses-outline" size={18} color={lightColors.textMuted} />
            <TextInput
              style={styles.input}
              value={instructions}
              onChangeText={setInstructions}
              placeholder="Buzzer code, leave at door…"
              placeholderTextColor={lightColors.textMuted}
              multiline
            />
          </View>

          {/* Fee breakdown */}
          <Text style={styles.fieldLabel}>Order summary</Text>
          <View style={styles.summaryCard}>
            {loadingQuote ? (
              <View style={styles.quoteLoading}>
                <ActivityIndicator size="small" color={lightColors.primary} />
                <Text style={styles.quoteLoadingText}>Calculating fees…</Text>
              </View>
            ) : quoteError || !quote ? (
              <View style={styles.quoteErrorWrap}>
                <Text style={styles.quoteErrorText}>{quoteError ?? 'Fee calculation failed.'}</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={() => void loadQuote()}>
                  <Text style={styles.retryBtnText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Subtotal</Text>
                  <Text style={styles.summaryValue}>{formatMoney(quote.subtotal)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Delivery fee</Text>
                  <Text style={styles.summaryValue}>{formatMoney(quote.deliveryFee)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Service fee</Text>
                  <Text style={styles.summaryValue}>{formatMoney(quote.serviceFee)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Tax</Text>
                  <Text style={styles.summaryValue}>{formatMoney(quote.tax)}</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryRow}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalValue}>{formatMoney(quote.total)}</Text>
                </View>
              </>
            )}
          </View>

          {pendingOrderId && (
            <View style={styles.retryNote}>
              <Ionicons name="information-circle-outline" size={16} color={lightColors.primary} />
              <Text style={styles.retryNoteText}>
                Your order is saved — tap Pay to finish your payment.
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Pay bar */}
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TouchableOpacity
            accessibilityLabel={demo.enabled ? 'Place order' : 'Pay for order'}
            style={[styles.payBtn, !canPay && styles.payBtnDisabled]}
            activeOpacity={0.9}
            onPress={() => void handlePay()}
            disabled={!canPay}
          >
            {paying ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="lock-closed" size={16} color="#fff" />
                <Text style={styles.payBtnText}>
                  {demo.enabled
                    ? 'Place order'
                    : `Pay ${quote ? formatMoney(quote.total) : ''}`}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 20,
    backgroundColor: lightColors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: fonts.extraBold,
    color: lightColors.textDark,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: spacing.xl,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: fonts.extraBold,
    color: lightColors.textDark,
  },
  emptyHint: {
    fontSize: 13.5,
    color: lightColors.textMuted,
    textAlign: 'center',
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: 40,
  },

  sellerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: lightColors.chipBg,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  sellerText: {
    flex: 1,
    fontSize: 14.5,
    fontFamily: fonts.bold,
    color: lightColors.textDark,
  },
  preOrderNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: lightColors.inputBg,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  preOrderNoteText: {
    flex: 1,
    fontSize: 12.5,
    color: lightColors.textDark,
    lineHeight: 18,
    fontFamily: fonts.medium,
  },

  fieldLabel: {
    fontSize: 14,
    fontFamily: fonts.extraBold,
    color: lightColors.textDark,
    marginTop: spacing.md,
    marginBottom: 8,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: lightColors.inputBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: lightColors.divider,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  input: {
    flex: 1,
    fontSize: 14.5,
    color: lightColors.textDark,
    fontFamily: fonts.medium,
    padding: 0,
    minHeight: 20,
  },
  fieldError: {
    color: lightColors.error,
    fontSize: 12.5,
    fontFamily: fonts.semibold,
    marginTop: 6,
  },

  summaryCard: {
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    padding: 16,
    gap: 10,
  },
  quoteLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  quoteLoadingText: {
    color: lightColors.textMuted,
    fontSize: 13.5,
    fontFamily: fonts.semibold,
  },
  quoteErrorWrap: {
    gap: 10,
  },
  quoteErrorText: {
    color: lightColors.error,
    fontSize: 13.5,
    fontFamily: fonts.semibold,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    backgroundColor: lightColors.primary,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  retryBtnText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: fonts.bold,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    fontSize: 14,
    color: lightColors.textMuted,
    fontFamily: fonts.medium,
  },
  summaryValue: {
    fontSize: 14,
    color: lightColors.textDark,
    fontFamily: fonts.semibold,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: lightColors.divider,
  },
  totalLabel: {
    fontSize: 16,
    fontFamily: fonts.extraBold,
    color: lightColors.textDark,
  },
  totalValue: {
    fontSize: 16,
    fontFamily: fonts.extraBold,
    color: lightColors.primary,
  },
  retryNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: lightColors.chipBg,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  retryNoteText: {
    flex: 1,
    fontSize: 12.5,
    color: lightColors.primary,
    fontFamily: fonts.semibold,
  },

  bottomBar: {
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: lightColors.divider,
    backgroundColor: lightColors.background,
  },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: lightColors.primary,
    borderRadius: 12,
    paddingVertical: 16,
  },
  payBtnDisabled: {
    backgroundColor: '#C9D5CD',
  },
  payBtnText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: fonts.bold,
  },
});
