// HalalBasket — home-cook compliance ladder (spec 5.3): a guided, encouraging
// progression from low-risk seller to fully-permitted cook.
// none → course_done → permit_applied → inspection_scheduled → approved

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { lightColors, spacing } from '../../constants/theme';
import { supabase } from '../config/supabase';
import { useSession } from '../context/SessionContext';
import { ProfileService } from '../services/profile';
import { notify } from '../lib/notify';
import type { MainStackParamList } from '../navigation/types';
import type { PermitStatus } from '../types/database';

type Props = NativeStackScreenProps<MainStackParamList, 'SellerCompliance'>;

const FOOD_HANDLER_COURSE_URL = 'https://www.foodsafetycourse.ca';

const LADDER: {
  status: PermitStatus;
  title: string;
  description: string;
}[] = [
  {
    status: 'none',
    title: 'Take the food handler course',
    description: 'A few hours online — most cooks finish it the same day.',
  },
  {
    status: 'course_done',
    title: 'Apply for your home food business permit',
    description: 'Requirements vary by province; we link you to the right form.',
  },
  {
    status: 'permit_applied',
    title: 'Book your kitchen inspection',
    description: 'A quick visit from your local health authority.',
  },
  {
    status: 'inspection_scheduled',
    title: 'Pass inspection & get verified',
    description: 'Upload your permit — our team confirms it and unlocks everything.',
  },
  {
    status: 'approved',
    title: "You're fully verified",
    description: 'Full meal listings unlocked, verified badge on, higher placement in search.',
  },
];

const ORDER: PermitStatus[] = ['none', 'course_done', 'permit_applied', 'inspection_scheduled', 'approved'];

export default function SellerComplianceScreen({ navigation }: Props) {
  const { seller, refresh } = useSession();
  const [busy, setBusy] = useState(false);

  if (!seller) return null;

  const currentIdx = ORDER.indexOf(seller.permit_status);
  const isApproved = seller.permit_status === 'approved';

  const advanceTo = async (next: PermitStatus, message: string) => {
    setBusy(true);
    const { error } = await supabase.from('sellers').update({ permit_status: next }).eq('id', seller.id);
    setBusy(false);
    if (error) {
      notify.error('Could not update your progress. Try again.');
      return;
    }
    notify.success(message);
    await refresh();
  };

  const uploadDoc = async (kind: 'food_handler_cert' | 'permit_doc') => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      base64: true,
    });
    if (result.canceled || !result.assets[0]?.base64) return;
    setBusy(true);
    const path = await ProfileService.uploadVerificationDoc(seller.user_id, kind, result.assets[0].base64);
    if (path) {
      const updates =
        kind === 'food_handler_cert'
          ? { food_handler_cert_path: path }
          : { permit_doc_path: path };
      await supabase.from('sellers').update(updates).eq('id', seller.id);
      notify.success('Document uploaded — our team will review it.');
      await refresh();
    } else {
      notify.error('Upload failed. Try again.');
    }
    setBusy(false);
  };

  /** The contextual action for the cook's current rung. */
  const renderAction = () => {
    switch (seller.permit_status) {
      case 'none':
        return (
          <View style={styles.actionGroup}>
            <TouchableOpacity
              style={styles.primaryBtn}
              activeOpacity={0.9}
              onPress={() => void WebBrowser.openBrowserAsync(FOOD_HANDLER_COURSE_URL)}
            >
              <Ionicons name="school-outline" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Start the course</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              activeOpacity={0.85}
              disabled={busy}
              onPress={() => void advanceTo('course_done', 'Course marked complete — nice work!')}
            >
              <Text style={styles.secondaryBtnText}>I've completed the course</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.linkBtn}
              onPress={() => void uploadDoc('food_handler_cert')}
              disabled={busy}
            >
              <Ionicons name="cloud-upload-outline" size={15} color={lightColors.primary} />
              <Text style={styles.linkBtnText}>
                {seller.food_handler_cert_path ? 'Replace certificate' : 'Upload your certificate'}
              </Text>
            </TouchableOpacity>
          </View>
        );
      case 'course_done':
        return (
          <View style={styles.actionGroup}>
            <TouchableOpacity
              style={styles.primaryBtn}
              activeOpacity={0.9}
              disabled={busy}
              onPress={() => void advanceTo('permit_applied', 'Marked as applied — keep going!')}
            >
              <Ionicons name="document-text-outline" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>I've applied for my permit</Text>
            </TouchableOpacity>
          </View>
        );
      case 'permit_applied':
        return (
          <View style={styles.actionGroup}>
            <TouchableOpacity
              style={styles.primaryBtn}
              activeOpacity={0.9}
              disabled={busy}
              onPress={() => void advanceTo('inspection_scheduled', 'Inspection booked — almost there!')}
            >
              <Ionicons name="calendar-outline" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>My inspection is booked</Text>
            </TouchableOpacity>
          </View>
        );
      case 'inspection_scheduled':
        return (
          <View style={styles.actionGroup}>
            <TouchableOpacity
              style={styles.primaryBtn}
              activeOpacity={0.9}
              disabled={busy}
              onPress={() => void uploadDoc('permit_doc')}
            >
              <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>
                {seller.permit_doc_path ? 'Replace permit document' : 'Upload your permit'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.hint}>
              Once uploaded, the HalalBasket team verifies your permit and flips you to fully verified.
            </Text>
          </View>
        );
      case 'approved':
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={lightColors.textDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Get fully verified</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {isApproved ? (
          <View style={styles.heroApproved}>
            <Ionicons name="shield-checkmark" size={56} color={lightColors.primary} />
            <Text style={styles.heroApprovedTitle}>Verified home cook</Text>
            <Text style={styles.heroApprovedText}>
              Full meal listings are unlocked and your kitchen carries the verified badge.
            </Text>
          </View>
        ) : (
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>Unlock full meal listings</Text>
            <Text style={styles.heroText}>
              Right now you can sell low-risk items (baked goods, desserts, snacks). Finish these
              steps to sell full meals and meat dishes — and earn a verified badge with higher
              placement in search.
            </Text>
          </View>
        )}

        <View style={styles.ladder}>
          {LADDER.map((step, idx) => {
            const done = idx < currentIdx || isApproved;
            const current = idx === currentIdx && !isApproved;
            return (
              <View key={step.status} style={styles.step}>
                <View style={styles.stepRail}>
                  <View
                    style={[
                      styles.stepDot,
                      done && styles.stepDotDone,
                      current && styles.stepDotCurrent,
                    ]}
                  >
                    {done ? (
                      <Ionicons name="checkmark" size={13} color="#fff" />
                    ) : (
                      <Text style={[styles.stepNum, current && styles.stepNumCurrent]}>{idx + 1}</Text>
                    )}
                  </View>
                  {idx < LADDER.length - 1 && (
                    <View style={[styles.stepLine, done && styles.stepLineDone]} />
                  )}
                </View>
                <View style={[styles.stepBody, current && styles.stepBodyCurrent]}>
                  <Text style={[styles.stepTitle, done && styles.stepTitleDone]}>{step.title}</Text>
                  <Text style={styles.stepDesc}>{step.description}</Text>
                  {current && renderAction()}
                </View>
              </View>
            );
          })}
        </View>

        {busy && <ActivityIndicator color={lightColors.primary} style={{ marginTop: 12 }} />}
      </ScrollView>
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
    paddingVertical: spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: lightColors.textDark,
  },
  scroll: {
    padding: spacing.md,
    paddingBottom: 40,
  },
  hero: {
    backgroundColor: lightColors.chipBg,
    borderRadius: 16,
    padding: spacing.xl,
    gap: 8,
    marginBottom: spacing.lg,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: lightColors.primary,
  },
  heroText: {
    fontSize: 14,
    lineHeight: 21,
    color: lightColors.textDark,
  },
  heroApproved: {
    alignItems: 'center',
    gap: 8,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  heroApprovedTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: lightColors.textDark,
  },
  heroApprovedText: {
    fontSize: 14,
    color: lightColors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
  },
  ladder: {
    gap: 0,
  },
  step: {
    flexDirection: 'row',
    gap: 12,
  },
  stepRail: {
    alignItems: 'center',
    width: 28,
  },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: lightColors.inputBg,
    borderWidth: 1,
    borderColor: lightColors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotDone: {
    backgroundColor: lightColors.primary,
    borderColor: lightColors.primary,
  },
  stepDotCurrent: {
    borderColor: lightColors.primary,
    borderWidth: 2,
  },
  stepNum: {
    fontSize: 12,
    fontWeight: '800',
    color: lightColors.textMuted,
  },
  stepNumCurrent: {
    color: lightColors.primary,
  },
  stepLine: {
    flex: 1,
    width: 2,
    backgroundColor: lightColors.divider,
    marginVertical: 4,
  },
  stepLineDone: {
    backgroundColor: lightColors.primary,
  },
  stepBody: {
    flex: 1,
    paddingBottom: spacing.xl,
    gap: 4,
  },
  stepBodyCurrent: {
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  stepTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: lightColors.textDark,
  },
  stepTitleDone: {
    color: lightColors.primary,
  },
  stepDesc: {
    fontSize: 13.5,
    color: lightColors.textMuted,
    lineHeight: 20,
  },
  actionGroup: {
    gap: 10,
    marginTop: 12,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: lightColors.primary,
    borderRadius: 12,
    paddingVertical: 14,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 14.5,
    fontWeight: '700',
  },
  secondaryBtn: {
    alignItems: 'center',
    backgroundColor: lightColors.inputBg,
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: lightColors.divider,
  },
  secondaryBtnText: {
    color: lightColors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  linkBtnText: {
    color: lightColors.primary,
    fontSize: 13.5,
    fontWeight: '700',
  },
  hint: {
    fontSize: 12.5,
    color: lightColors.textMuted,
    lineHeight: 18,
    textAlign: 'center',
  },
});
