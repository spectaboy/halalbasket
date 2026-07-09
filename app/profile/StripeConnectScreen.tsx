// app/profile/StripeConnectScreen.tsx — Stripe Connect payout onboarding for
// sellers and drivers. Talks to the check-connect-status / create-connect-
// account / connect-account-link edge functions and opens the hosted Stripe
// onboarding flow in an in-app browser.

import React, { useCallback, useEffect, useState } from 'react';
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
import * as WebBrowser from 'expo-web-browser';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import { lightColors } from '../../constants/theme';
import BackgroundPattern from '../components/BackgroundPattern';
import { supabase } from '../config/supabase';
import { useSession } from '../context/SessionContext';
import { notify } from '../lib/notify';
import { logger } from '../utils/logger';

type Props = NativeStackScreenProps<MainStackParamList, 'StripeConnect'>;

type ConnectStatus = {
  hasAccount: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
};

const StripeConnectScreen = ({ navigation }: Props) => {
  const insets = useSafeAreaInsets();
  const { user, seller, driver } = useSession();

  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [status, setStatus] = useState<ConnectStatus | null>(null);

  const roleNoun = seller && driver ? 'sales and deliveries' : seller ? 'sales' : 'deliveries';

  const checkStatus = useCallback(async () => {
    if (!user) return;
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-connect-status', {
        body: { clerkId: user.clerk_id },
      });
      if (error) throw error;
      setStatus(data as ConnectStatus);
    } catch (e: any) {
      logger.error('Stripe', 'check status failed', { error: e?.message });
    } finally {
      setChecking(false);
    }
  }, [user]);

  useEffect(() => {
    void checkStatus();
  }, [checkStatus]);

  const openOnboarding = async (url: string) => {
    // In-app browser; when it closes we re-poll so status reflects any progress.
    await WebBrowser.openBrowserAsync(url);
    await checkStatus();
  };

  const handleSetup = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-connect-account', {
        body: {
          clerkId: user.clerk_id,
          email: user.email ?? '',
          firstName: user.first_name ?? '',
          lastName: user.last_name ?? '',
        },
      });
      if (error) throw error;
      if (data?.onboardingUrl) {
        await openOnboarding(data.onboardingUrl as string);
      }
    } catch (e: any) {
      notify.error(e?.message || 'Failed to start payout setup');
    } finally {
      setLoading(false);
    }
  };

  const handleContinueSetup = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('connect-account-link', {
        body: { clerkId: user.clerk_id },
      });
      if (error) throw error;
      if (data?.url) {
        await openOnboarding(data.url as string);
      }
    } catch (e: any) {
      notify.error(e?.message || 'Failed to open payout setup');
    } finally {
      setLoading(false);
    }
  };

  const isComplete = !!status?.chargesEnabled && !!status?.payoutsEnabled;

  const StatusStep = ({ done, label }: { done: boolean; label: string }) => (
    <View style={styles.stepRow}>
      <View style={[styles.stepDot, done && styles.stepDotDone]}>
        {done ? (
          <Ionicons name="checkmark" size={14} color="#FFFFFF" />
        ) : (
          <View style={styles.stepDotInner} />
        )}
      </View>
      <Text style={[styles.stepLabel, done && styles.stepLabelDone]}>{label}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <BackgroundPattern />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={lightColors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payouts</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Icon */}
        <View style={styles.iconCircle}>
          <Ionicons name="wallet-outline" size={48} color={lightColors.primary} />
        </View>

        <Text style={styles.title}>{isComplete ? 'Payouts ready!' : 'Connect your bank'}</Text>
        <Text style={styles.subtitle}>
          {isComplete
            ? `Your bank account is connected. Earnings from your ${roleNoun} are paid out automatically.`
            : `Link your bank account so earnings from your ${roleNoun} on HalalBasket go straight to your bank.`}
        </Text>

        {/* Status steps */}
        <View style={styles.stepsCard}>
          <StatusStep done={!!status?.hasAccount} label="Account created" />
          <View style={styles.stepLine} />
          <StatusStep done={!!status?.detailsSubmitted} label="Details submitted" />
          <View style={styles.stepLine} />
          <StatusStep done={!!status?.payoutsEnabled} label="Payouts enabled" />
        </View>

        {/* Info cards */}
        <View style={styles.infoCard}>
          <Ionicons name="shield-checkmark" size={18} color={lightColors.primary} />
          <Text style={styles.infoText}>
            HalalBasket uses Stripe for secure payments. We never see or store your banking
            details.
          </Text>
        </View>

        <View style={styles.infoCard}>
          <Ionicons name="cash-outline" size={18} color={lightColors.primary} />
          <Text style={styles.infoText}>
            Whether you sell or deliver, payouts are transferred automatically after each
            completed order — no invoices, no waiting.
          </Text>
        </View>

        {/* Actions */}
        {checking ? (
          <ActivityIndicator size="large" color={lightColors.primary} style={{ marginTop: 24 }} />
        ) : isComplete ? (
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>Done</Text>
          </TouchableOpacity>
        ) : status?.hasAccount && !status?.detailsSubmitted ? (
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleContinueSetup}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons name="open-outline" size={18} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>Continue setup</Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleSetup}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons name="card-outline" size={18} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>Set up payouts</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {!isComplete && !checking && (
          <TouchableOpacity style={styles.refreshBtn} onPress={checkStatus}>
            <Ionicons name="refresh" size={16} color={lightColors.primary} />
            <Text style={styles.refreshText}>Refresh status</Text>
          </TouchableOpacity>
        )}

        {!isComplete && (
          <TouchableOpacity style={styles.skipBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.skipText}>I'll do this later</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.background,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
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
    color: lightColors.textDark,
    fontSize: 20,
    fontWeight: '800',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
    paddingTop: 16,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: lightColors.textDark,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: lightColors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 12,
    marginBottom: 24,
  },

  stepsCard: {
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    padding: 20,
    width: '100%',
    marginBottom: 16,
    shadowColor: lightColors.cardShadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: lightColors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: lightColors.divider,
  },
  stepDotDone: {
    backgroundColor: lightColors.primary,
    borderColor: lightColors.primary,
  },
  stepDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: lightColors.textMuted,
  },
  stepLabel: {
    fontSize: 15,
    color: lightColors.textMuted,
    fontWeight: '500',
  },
  stepLabelDone: {
    color: lightColors.textDark,
    fontWeight: '600',
  },
  stepLine: {
    width: 2,
    height: 16,
    backgroundColor: lightColors.divider,
    marginLeft: 13,
    marginVertical: 2,
  },

  infoCard: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: lightColors.chipBg,
    borderRadius: 14,
    padding: 14,
    width: '100%',
    marginBottom: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: lightColors.textDark,
    lineHeight: 19,
  },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: lightColors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    width: '100%',
    marginTop: 20,
    shadowColor: lightColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },

  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    padding: 8,
  },
  refreshText: {
    color: lightColors.primary,
    fontSize: 14,
    fontWeight: '600',
  },

  skipBtn: {
    marginTop: 12,
    padding: 8,
  },
  skipText: {
    color: lightColors.textMuted,
    fontSize: 14,
  },
});

export default StripeConnectScreen;
