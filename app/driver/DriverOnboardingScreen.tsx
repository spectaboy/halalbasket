// Driver onboarding wizard: intro -> vehicle info -> verification docs -> review/submit.
// Creates (or resubmits) the drivers row, promotes the user's role and hands off
// to the verification-pending screen.

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { lightColors, spacing } from '../../constants/theme';
import { supabase } from '../config/supabase';
import { useSession } from '../context/SessionContext';
import { ProfileService } from '../services/profile';
import { notify } from '../lib/notify';
import { logger } from '../utils/logger';
import BackgroundPattern from '../components/BackgroundPattern';
import type { MainStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'DriverOnboarding'>;

interface PickedDoc {
  uri: string;
  base64: string;
}

const STEPS = ['Intro', 'Vehicle', 'Documents', 'Review'] as const;

const PERKS: Array<{ icon: keyof typeof Ionicons.glyphMap; title: string; body: string }> = [
  {
    icon: 'time-outline',
    title: 'Earn on your schedule',
    body: 'Go online whenever you want — no shifts, no minimums.',
  },
  {
    icon: 'restaurant-outline',
    title: 'Deliver halal food',
    body: 'Every order comes from verified halal restaurants, butchers and home cooks.',
  },
  {
    icon: 'cash-outline',
    title: 'Keep the delivery fee',
    body: 'Your payout is shown up-front on every delivery before you accept it.',
  },
];

export default function DriverOnboardingScreen({ navigation }: Props) {
  const { user, driver, refresh } = useSession();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // vehicle form
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [color, setColor] = useState('');
  const [plate, setPlate] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // documents
  const [idDoc, setIdDoc] = useState<PickedDoc | null>(null);
  const [licenceDoc, setLicenceDoc] = useState<PickedDoc | null>(null);

  const isResubmission = driver?.verification_status === 'rejected';

  // If the user already has a driver record, route them to the right place —
  // except rejected drivers, who go through the wizard again with prefilled info.
  useEffect(() => {
    if (!driver) return;
    if (driver.verification_status === 'rejected') {
      const v = driver.vehicle_info ?? {};
      setMake(v.make ?? '');
      setModel(v.model ?? '');
      setYear(v.year ?? '');
      setColor(v.color ?? '');
      setPlate(v.plate ?? '');
    } else if (driver.verification_status === 'pending') {
      navigation.replace('DriverVerificationPending');
    } else {
      navigation.replace('DriverTabs', { screen: 'DriverHome' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickDoc = async (kind: 'id' | 'licence') => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        base64: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if (!asset.base64) {
        notify.error('Could not read that image — please try another one');
        return;
      }
      const doc: PickedDoc = { uri: asset.uri, base64: asset.base64 };
      if (kind === 'id') setIdDoc(doc);
      else setLicenceDoc(doc);
    } catch (err: any) {
      logger.error('User', 'driver doc pick failed', { error: err?.message });
      notify.error('Could not open your photo library');
    }
  };

  const validateVehicle = (): boolean => {
    if (!make.trim() || !model.trim() || !color.trim() || !plate.trim()) {
      setFormError('Please fill in every field.');
      return false;
    }
    if (!/^\d{4}$/.test(year.trim())) {
      setFormError('Enter a 4-digit vehicle year (e.g. 2019).');
      return false;
    }
    setFormError(null);
    return true;
  };

  const goNext = () => {
    if (step === 1 && !validateVehicle()) return;
    if (step === 2 && (!idDoc || !licenceDoc)) {
      notify.error('Please upload both documents to continue');
      return;
    }
    if (step === 3) {
      void handleSubmit();
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const goBack = () => {
    if (step > 0) setStep((s) => s - 1);
    else navigation.goBack();
  };

  const handleSubmit = async () => {
    if (submitting) return;
    if (!user) {
      notify.error('You need to be signed in to apply');
      return;
    }
    if (!idDoc || !licenceDoc) {
      notify.error('Please upload both documents');
      return;
    }
    setSubmitting(true);
    try {
      const [idPath, licencePath] = await Promise.all([
        ProfileService.uploadVerificationDoc(user.id, 'driver_id', idDoc.base64),
        ProfileService.uploadVerificationDoc(user.id, 'driver_licence', licenceDoc.base64),
      ]);
      if (!idPath || !licencePath) throw new Error('Document upload failed — please try again');

      const vehicleInfo = {
        make: make.trim(),
        model: model.trim(),
        year: year.trim(),
        color: color.trim(),
        plate: plate.trim().toUpperCase(),
      };

      if (isResubmission && driver) {
        const { error } = await supabase
          .from('drivers')
          .update({
            vehicle_info: vehicleInfo,
            id_doc_path: idPath,
            licence_doc_path: licencePath,
            verification_status: 'pending',
            rejection_reason: null,
          })
          .eq('id', driver.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('drivers').insert({
          user_id: user.id,
          verification_status: 'pending',
          vehicle_info: vehicleInfo,
          id_doc_path: idPath,
          licence_doc_path: licencePath,
        });
        if (error) throw error;
      }

      await ProfileService.setRole(user.id, 'driver');
      await refresh();
      navigation.navigate('DriverVerificationPending');
    } catch (err: any) {
      logger.error('User', 'driver onboarding submit failed', { error: err?.message });
      notify.error(err?.message ?? 'Could not submit your application');
    } finally {
      setSubmitting(false);
    }
  };

  const renderIntro = () => (
    <View>
      <View style={styles.heroIconWrap}>
        <Ionicons name="bicycle" size={44} color={lightColors.primary} />
      </View>
      <Text style={styles.heroTitle}>Deliver with HalalBasket</Text>
      <Text style={styles.heroSubtitle}>
        Earn on your schedule delivering halal food from local restaurants, butchers and home cooks
        to customers nearby.
      </Text>
      {PERKS.map((perk) => (
        <View key={perk.title} style={styles.perkCard}>
          <View style={styles.perkIcon}>
            <Ionicons name={perk.icon} size={22} color={lightColors.primary} />
          </View>
          <View style={styles.perkTextWrap}>
            <Text style={styles.perkTitle}>{perk.title}</Text>
            <Text style={styles.perkBody}>{perk.body}</Text>
          </View>
        </View>
      ))}
    </View>
  );

  const renderField = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
    options?: { keyboardType?: 'number-pad'; maxLength?: number; autoCapitalize?: 'characters' | 'words' }
  ) => (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={lightColors.textMuted}
        keyboardType={options?.keyboardType}
        maxLength={options?.maxLength}
        autoCapitalize={options?.autoCapitalize ?? 'words'}
      />
    </View>
  );

  const renderVehicle = () => (
    <View>
      <Text style={styles.stepTitle}>Your vehicle</Text>
      <Text style={styles.stepSubtitle}>
        Customers see this so they can spot their delivery arriving.
      </Text>
      {renderField('Make', make, setMake, 'e.g. Toyota')}
      {renderField('Model', model, setModel, 'e.g. Corolla')}
      <View style={styles.fieldRow}>
        <View style={styles.fieldHalf}>
          {renderField('Year', year, setYear, 'e.g. 2019', { keyboardType: 'number-pad', maxLength: 4 })}
        </View>
        <View style={styles.fieldHalf}>{renderField('Color', color, setColor, 'e.g. Silver')}</View>
      </View>
      {renderField('Licence plate', plate, setPlate, 'e.g. ABC 1234', { autoCapitalize: 'characters' })}
      {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
    </View>
  );

  const renderDocCard = (
    label: string,
    hint: string,
    doc: PickedDoc | null,
    onPress: () => void
  ) => (
    <TouchableOpacity style={styles.docCard} onPress={onPress} activeOpacity={0.8}>
      {doc ? (
        <Image source={{ uri: doc.uri }} style={styles.docPreview} />
      ) : (
        <View style={styles.docPlaceholder}>
          <Ionicons name="cloud-upload-outline" size={28} color={lightColors.primary} />
        </View>
      )}
      <View style={styles.docTextWrap}>
        <Text style={styles.docLabel}>{label}</Text>
        <Text style={styles.docHint}>{doc ? 'Tap to replace' : hint}</Text>
      </View>
      <Ionicons
        name={doc ? 'checkmark-circle' : 'chevron-forward'}
        size={22}
        color={doc ? lightColors.primary : lightColors.textMuted}
      />
    </TouchableOpacity>
  );

  const renderDocs = () => (
    <View>
      <Text style={styles.stepTitle}>Verification documents</Text>
      <Text style={styles.stepSubtitle}>
        We review these to keep the marketplace safe. They're stored privately and never shared with
        customers.
      </Text>
      {renderDocCard('Government ID', 'Passport, PR card or provincial ID', idDoc, () => void pickDoc('id'))}
      {renderDocCard("Driver's licence", 'A clear photo of the front', licenceDoc, () => void pickDoc('licence'))}
    </View>
  );

  const renderReviewRow = (label: string, value: string) => (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{value}</Text>
    </View>
  );

  const renderReview = () => (
    <View>
      <Text style={styles.stepTitle}>Review & submit</Text>
      <Text style={styles.stepSubtitle}>
        Double-check everything below — our team usually reviews applications within 1–2 business
        days.
      </Text>
      <View style={styles.reviewCard}>
        <Text style={styles.reviewSection}>Vehicle</Text>
        {renderReviewRow('Make & model', `${make.trim()} ${model.trim()}`)}
        {renderReviewRow('Year', year.trim())}
        {renderReviewRow('Color', color.trim())}
        {renderReviewRow('Plate', plate.trim().toUpperCase())}
      </View>
      <View style={styles.reviewCard}>
        <Text style={styles.reviewSection}>Documents</Text>
        <View style={styles.reviewDocsRow}>
          {idDoc ? <Image source={{ uri: idDoc.uri }} style={styles.reviewDocThumb} /> : null}
          {licenceDoc ? <Image source={{ uri: licenceDoc.uri }} style={styles.reviewDocThumb} /> : null}
        </View>
        <Text style={styles.reviewDocsCaption}>Government ID · Driver's licence</Text>
      </View>
      {isResubmission ? (
        <View style={styles.resubmitNote}>
          <Ionicons name="refresh" size={16} color={lightColors.primary} />
          <Text style={styles.resubmitNoteText}>
            Resubmitting will replace your previous application.
          </Text>
        </View>
      ) : null}
    </View>
  );

  const footerLabel =
    step === 0 ? 'Get started' : step === 3 ? (isResubmission ? 'Resubmit application' : 'Submit application') : 'Continue';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <BackgroundPattern />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} disabled={submitting}>
          <Ionicons name="arrow-back" size={22} color={lightColors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Become a driver</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Step progress */}
      <View style={styles.progressRow}>
        {STEPS.map((s, i) => (
          <View key={s} style={[styles.progressSegment, i <= step && styles.progressSegmentActive]} />
        ))}
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 0 && renderIntro()}
          {step === 1 && renderVehicle()}
          {step === 2 && renderDocs()}
          {step === 3 && renderReview()}
        </ScrollView>

        {/* Bottom action bar */}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <TouchableOpacity
            style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
            onPress={goNext}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>{footerLabel}</Text>
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
    overflow: 'hidden',
  },
  flex: { flex: 1 },
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
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: lightColors.textDark,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: lightColors.divider,
  },
  progressSegmentActive: {
    backgroundColor: lightColors.primary,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },

  // intro
  heroIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: lightColors.textDark,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  heroSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: lightColors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  perkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    marginBottom: spacing.sm,
  },
  perkIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  perkTextWrap: { flex: 1 },
  perkTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: lightColors.textDark,
    marginBottom: 2,
  },
  perkBody: {
    fontSize: 13,
    lineHeight: 18,
    color: lightColors.textMuted,
  },

  // form
  stepTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: lightColors.textDark,
    marginBottom: spacing.xs,
  },
  stepSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: lightColors.textMuted,
    marginBottom: spacing.lg,
  },
  fieldWrap: { marginBottom: spacing.md },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: lightColors.textDark,
    marginBottom: 6,
  },
  input: {
    backgroundColor: lightColors.inputBg,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 15,
    color: lightColors.textDark,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  fieldHalf: { flex: 1 },
  errorText: {
    color: lightColors.error,
    fontSize: 13,
    marginTop: spacing.xs,
  },

  // docs
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    marginBottom: spacing.sm,
  },
  docPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  docPreview: {
    width: 56,
    height: 56,
    borderRadius: 12,
    marginRight: spacing.md,
  },
  docTextWrap: { flex: 1 },
  docLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: lightColors.textDark,
    marginBottom: 2,
  },
  docHint: {
    fontSize: 13,
    color: lightColors.textMuted,
  },

  // review
  reviewCard: {
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    marginBottom: spacing.sm,
  },
  reviewSection: {
    fontSize: 13,
    fontWeight: '800',
    color: lightColors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  reviewLabel: {
    fontSize: 14,
    color: lightColors.textMuted,
  },
  reviewValue: {
    fontSize: 14,
    fontWeight: '700',
    color: lightColors.textDark,
  },
  reviewDocsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  reviewDocThumb: {
    width: 72,
    height: 72,
    borderRadius: 12,
  },
  reviewDocsCaption: {
    fontSize: 13,
    color: lightColors.textMuted,
  },
  resubmitNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: lightColors.chipBg,
    borderRadius: 12,
    padding: spacing.md,
  },
  resubmitNoteText: {
    flex: 1,
    fontSize: 13,
    color: lightColors.textDark,
  },

  // footer
  footer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: 'transparent',
  },
  primaryBtn: {
    backgroundColor: lightColors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
