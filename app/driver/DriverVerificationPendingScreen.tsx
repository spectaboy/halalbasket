// Driver verification waiting room. Subscribes to the driver's own drivers row:
// approved -> celebrate + refresh session + enter driver tabs; rejected -> show
// the reason and offer resubmission.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { lightColors, spacing } from '../../constants/theme';
import { supabase } from '../config/supabase';
import { useSession } from '../context/SessionContext';
import { notify } from '../lib/notify';
import { logger } from '../utils/logger';
import BackgroundPattern from '../components/BackgroundPattern';
import type { DriverRow } from '../types/database';
import type { MainStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'DriverVerificationPending'>;

export default function DriverVerificationPendingScreen({ navigation }: Props) {
  const { driver, setMode, refresh } = useSession();
  const [row, setRow] = useState<DriverRow | null>(driver);
  const approvedHandled = useRef(false);

  const handleRow = useCallback(
    (next: DriverRow) => {
      setRow(next);
      if (next.verification_status === 'approved' && !approvedHandled.current) {
        approvedHandled.current = true;
        notify.success("You're approved — welcome to the fleet!");
        void refresh().then(() => {
          navigation.navigate('DriverTabs', { screen: 'DriverHome' });
        });
      }
    },
    [navigation, refresh]
  );

  // Fetch the freshest row on mount, then subscribe to changes on it.
  useEffect(() => {
    if (!driver?.id) return;
    let disposed = false;

    void supabase
      .from('drivers')
      .select('*')
      .eq('id', driver.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) logger.error('Supabase', 'driver verification fetch failed', { error: error.message });
        if (!disposed && data) handleRow(data as DriverRow);
      });

    const channel = supabase
      .channel(`driver-verification:${driver.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'drivers', filter: `id=eq.${driver.id}` },
        (payload: any) => {
          if (payload.new) handleRow(payload.new as DriverRow);
        }
      )
      .subscribe();

    return () => {
      disposed = true;
      supabase.removeChannel(channel);
    };
  }, [driver?.id, handleRow]);

  const browseAsCustomer = () => {
    setMode('customer');
    navigation.navigate('CustomerTabs', { screen: 'Home' });
  };

  if (!driver) {
    // No driver record — shouldn't normally land here; send them to onboarding.
    return (
      <SafeAreaView style={styles.container}>
        <BackgroundPattern />
        <View style={styles.centerWrap}>
          <View style={styles.iconCircle}>
            <Ionicons name="bicycle" size={40} color={lightColors.primary} />
          </View>
          <Text style={styles.title}>No application yet</Text>
          <Text style={styles.subtitle}>Start your driver application to begin delivering.</Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => navigation.navigate('DriverOnboarding')}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>Apply to drive</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const status = row?.verification_status ?? driver.verification_status;
  const isRejected = status === 'rejected';

  return (
    <SafeAreaView style={styles.container}>
      <BackgroundPattern />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.centerWrap}>
          <View style={[styles.iconCircle, isRejected && styles.iconCircleError]}>
            <Ionicons
              name={isRejected ? 'alert-circle-outline' : 'hourglass-outline'}
              size={40}
              color={isRejected ? lightColors.error : lightColors.primary}
            />
          </View>

          <Text style={styles.title}>
            {isRejected ? 'Application not approved' : 'Application under review'}
          </Text>
          <Text style={styles.subtitle}>
            {isRejected
              ? 'Unfortunately we could not approve your application this time.'
              : 'Our team is reviewing your documents. This usually takes 1–2 business days — we’ll move you straight in the moment you’re approved.'}
          </Text>

          {isRejected ? (
            <View style={styles.reasonCard}>
              <Text style={styles.reasonLabel}>Reason</Text>
              <Text style={styles.reasonText}>
                {row?.rejection_reason?.trim() || 'No reason was provided. Please resubmit with clear, readable documents.'}
              </Text>
            </View>
          ) : (
            <View style={styles.stepsCard}>
              <View style={styles.stepRow}>
                <Ionicons name="checkmark-circle" size={20} color={lightColors.primary} />
                <Text style={styles.stepText}>Application received</Text>
              </View>
              <View style={styles.stepRow}>
                <ActivityIndicator size="small" color={lightColors.primary} />
                <Text style={styles.stepText}>Documents under review</Text>
              </View>
              <View style={styles.stepRow}>
                <Ionicons name="ellipse-outline" size={20} color={lightColors.textMuted} />
                <Text style={[styles.stepText, styles.stepTextMuted]}>Start delivering</Text>
              </View>
            </View>
          )}

          {isRejected ? (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => navigation.navigate('DriverOnboarding')}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>Resubmit application</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity style={styles.secondaryBtn} onPress={browseAsCustomer} activeOpacity={0.8}>
            <Ionicons name="storefront-outline" size={18} color={lightColors.primary} />
            <Text style={styles.secondaryBtnText}>Browse as customer meanwhile</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.background,
    overflow: 'hidden',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  iconCircleError: {
    backgroundColor: 'rgba(231,76,60,0.10)',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: lightColors.textDark,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: lightColors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  stepsCard: {
    alignSelf: 'stretch',
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stepText: {
    fontSize: 14,
    fontWeight: '600',
    color: lightColors.textDark,
  },
  stepTextMuted: {
    color: lightColors.textMuted,
    fontWeight: '500',
  },
  reasonCard: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(231,76,60,0.06)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(231,76,60,0.25)',
    marginBottom: spacing.lg,
  },
  reasonLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: lightColors.error,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  reasonText: {
    fontSize: 14,
    lineHeight: 20,
    color: lightColors.textDark,
  },
  primaryBtn: {
    alignSelf: 'stretch',
    backgroundColor: lightColors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  secondaryBtnText: {
    color: lightColors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
});
