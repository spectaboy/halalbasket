// SellerVerificationPendingScreen — friendly "we're reviewing" state.
// Subscribes to the seller's own row: approved -> celebrate + into SellerTabs;
// rejected -> show reason + one-tap resubmit.

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { lightColors, spacing } from '../../constants/theme';
import BackgroundPattern from '../components/BackgroundPattern';
import { notify } from '../lib/notify';
import { logger } from '../utils/logger';
import { useScreenLogger } from '../utils/loggerHooks';
import { supabase } from '../config/supabase';
import { useSession } from '../context/SessionContext';
import type { MainStackParamList } from '../navigation/types';
import type { SellerRow, VerificationStatus } from '../types/database';

type Props = NativeStackScreenProps<MainStackParamList, 'SellerVerificationPending'>;

const NEXT_STEPS: Array<{ icon: keyof typeof Ionicons.glyphMap; title: string; body: string }> = [
  {
    icon: 'document-text-outline',
    title: 'We review your documents',
    body: 'A real person checks your application — usually within 1–2 business days.',
  },
  {
    icon: 'notifications-outline',
    title: "You'll hear from us",
    body: "We'll notify you the moment you're approved. No need to keep checking.",
  },
  {
    icon: 'storefront-outline',
    title: 'Set up your shop',
    body: 'Meanwhile, you can think about your first listings — photos sell!',
  },
];

export default function SellerVerificationPendingScreen({ navigation }: Props) {
  useScreenLogger('SellerVerificationPendingScreen');
  const insets = useSafeAreaInsets();
  const { seller, refresh } = useSession();
  const [status, setStatus] = useState<VerificationStatus | null>(seller?.verification_status ?? null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(seller?.rejection_reason ?? null);
  const [resubmitting, setResubmitting] = useState(false);

  const sellerId = seller?.id;

  useEffect(() => {
    setStatus(seller?.verification_status ?? null);
    setRejectionReason(seller?.rejection_reason ?? null);
  }, [seller?.verification_status, seller?.rejection_reason]);

  // Realtime: watch our own sellers row for the admin's decision.
  useEffect(() => {
    if (!sellerId) return;
    const channel = supabase
      .channel(`seller-verification:${sellerId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sellers', filter: `id=eq.${sellerId}` },
        (payload: { new: SellerRow }) => {
          const next = payload.new;
          if (!next) return;
          logger.info('Onboarding', 'seller verification change', { status: next.verification_status });
          setStatus(next.verification_status);
          setRejectionReason(next.rejection_reason);
          if (next.verification_status === 'approved') {
            notify.success("You're approved — welcome to HalalBasket!");
            void refresh().then(() => {
              navigation.replace('SellerTabs', { screen: 'SellerDashboard' });
            });
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sellerId, navigation, refresh]);

  const resubmit = async () => {
    if (!sellerId || resubmitting) return;
    setResubmitting(true);
    try {
      const { error } = await supabase
        .from('sellers')
        .update({ verification_status: 'pending', rejection_reason: null })
        .eq('id', sellerId);
      if (error) throw error;
      await refresh();
      setStatus('pending');
      setRejectionReason(null);
      notify.success("Thanks — your application is back in the review queue.");
    } catch (e: unknown) {
      logger.error('Onboarding', 'resubmit failed', { error: e instanceof Error ? e.message : String(e) });
      notify.error("Couldn't resubmit right now. Please try again.");
    } finally {
      setResubmitting(false);
    }
  };

  if (!seller) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <BackgroundPattern />
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={lightColors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const rejected = status === 'rejected';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <BackgroundPattern />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.replace('CustomerTabs', { screen: 'Home' }))}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={24} color={lightColors.textDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Application status</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero illustration */}
        <View style={styles.heroWrap}>
          <View style={[styles.heroCircleOuter, rejected && styles.heroCircleOuterRejected]}>
            <View style={[styles.heroCircle, rejected && styles.heroCircleRejected]}>
              <Ionicons
                name={rejected ? 'refresh-outline' : 'time-outline'}
                size={54}
                color={rejected ? lightColors.error : lightColors.primary}
              />
            </View>
          </View>
          <Text style={styles.heroTitle}>
            {rejected ? 'A small bump in the road' : "We're reviewing your application"}
          </Text>
          <Text style={styles.heroSubtitle}>
            {rejected
              ? "Your application needs another look before we can approve it — here's why:"
              : `Thanks, ${seller.business_name}! Sit tight — most sellers are approved within 1–2 business days.`}
          </Text>
        </View>

        {rejected ? (
          <>
            <View style={styles.rejectCard}>
              <Ionicons name="information-circle" size={18} color={lightColors.error} />
              <Text style={styles.rejectText}>
                {rejectionReason || 'Our team flagged an issue with your submitted details or documents.'}
              </Text>
            </View>
            <Text style={styles.rejectHint}>
              Fix things up (you can re-upload documents from your profile) and resubmit — we'll take
              another look right away.
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, resubmitting && { opacity: 0.6 }]}
              onPress={resubmit}
              disabled={resubmitting}
              activeOpacity={0.85}
            >
              {resubmitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryBtnText}>Update & resubmit</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.stepsCard}>
            <Text style={styles.stepsTitle}>What happens next</Text>
            {NEXT_STEPS.map((s, i) => (
              <View key={s.title} style={[styles.stepRow, i > 0 && styles.stepRowBorder]}>
                <View style={styles.stepIconWrap}>
                  <Ionicons name={s.icon} size={18} color={lightColors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepRowTitle}>{s.title}</Text>
                  <Text style={styles.stepRowBody}>{s.body}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {!rejected && (
          <View style={styles.pendingPill}>
            <View style={styles.pendingDot} />
            <Text style={styles.pendingPillText}>Status: under review</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: lightColors.background },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '800',
    color: lightColors.textDark,
  },
  scrollContent: { padding: spacing.md },

  heroWrap: { alignItems: 'center', paddingVertical: spacing.lg },
  heroCircleOuter: {
    width: 148,
    height: 148,
    borderRadius: 74,
    backgroundColor: 'rgba(39,174,96,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  heroCircleOuterRejected: { backgroundColor: 'rgba(231,76,60,0.08)' },
  heroCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCircleRejected: { backgroundColor: 'rgba(231,76,60,0.12)' },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: lightColors.textDark,
    textAlign: 'center',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 14.5,
    color: lightColors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: 12,
  },

  stepsCard: {
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    marginTop: spacing.sm,
  },
  stepsTitle: { fontSize: 15, fontWeight: '800', color: lightColors.textDark, marginBottom: 4 },
  stepRow: { flexDirection: 'row', gap: 12, paddingVertical: 12, alignItems: 'flex-start' },
  stepRowBorder: { borderTopWidth: 1, borderTopColor: lightColors.divider },
  stepIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepRowTitle: { fontSize: 14, fontWeight: '700', color: lightColors.textDark },
  stepRowBody: { fontSize: 12.5, color: lightColors.textMuted, marginTop: 2, lineHeight: 18 },

  rejectCard: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: 'rgba(231,76,60,0.07)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(231,76,60,0.25)',
    marginTop: spacing.sm,
  },
  rejectText: { flex: 1, fontSize: 14, color: lightColors.textDark, lineHeight: 20, fontWeight: '600' },
  rejectHint: {
    fontSize: 13,
    color: lightColors.textMuted,
    lineHeight: 19,
    marginTop: spacing.md,
    marginBottom: spacing.md,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  primaryBtn: {
    backgroundColor: lightColors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

  pendingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    backgroundColor: lightColors.chipBg,
    borderRadius: 9999,
    paddingHorizontal: 16,
    paddingVertical: 9,
    marginTop: spacing.lg,
  },
  pendingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E9A23B' },
  pendingPillText: { fontSize: 13, fontWeight: '700', color: lightColors.textDark },
});
