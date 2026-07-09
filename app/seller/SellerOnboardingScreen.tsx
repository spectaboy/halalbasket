// SellerOnboardingScreen — multi-step "become a seller" wizard.
// Guided, not a wall: three seller types with different rules (spec heart).
//   1) choose type  2) business details  3) (home cooks) food tier
//   4) documents    5) review + submit

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import BackgroundPattern from '../components/BackgroundPattern';
import { FieldError, errorBorder, useInlineErrors } from '../components/ui/FieldError';
import { notify } from '../lib/notify';
import { logger } from '../utils/logger';
import { useScreenLogger } from '../utils/loggerHooks';
import { supabase } from '../config/supabase';
import { ProfileService } from '../services/profile';
import { useSession } from '../context/SessionContext';
import type { MainStackParamList } from '../navigation/types';
import type { FoodCategoryTier, SellerType } from '../types/database';

type Props = NativeStackScreenProps<MainStackParamList, 'SellerOnboarding'>;

type StepKey = 'type' | 'details' | 'tier' | 'docs' | 'review';
type DocKind = 'id' | 'licence' | 'food_handler_cert' | 'permit';
type DetailField = 'businessName' | 'address';

const COMMISSION: Record<SellerType, number> = { restaurant: 0.15, butcher: 0.1, home_cook: 0 };

const TYPE_CARDS: Array<{
  type: SellerType;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  tagline: string;
  bullets: string[];
}> = [
  {
    type: 'restaurant',
    icon: 'restaurant-outline',
    title: 'Restaurant',
    tagline: 'Live orders, delivered hot',
    bullets: [
      'Real-time orders during your open hours',
      'Business licence required',
      '15% commission on food subtotal',
    ],
  },
  {
    type: 'butcher',
    icon: 'storefront-outline',
    title: 'Butcher / Farm',
    tagline: 'Fresh halal meat & produce',
    bullets: [
      'Live orders or scheduled pickups — your choice',
      'Business licence required',
      '10% commission on food subtotal',
    ],
  },
  {
    type: 'home_cook',
    icon: 'home-outline',
    title: 'Home cook',
    tagline: 'Share your kitchen with the community',
    bullets: [
      'Pre-order meal drops — cook on your schedule',
      'Free to join, keep 100% of your food price',
      'Start with just your ID for low-risk foods',
    ],
  },
];

const TAG_SUGGESTIONS: Record<SellerType, string[]> = {
  restaurant: ['Shawarma', 'Biryani', 'Burgers', 'Pizza', 'Mediterranean', 'Desi', 'Turkish'],
  butcher: ['Beef', 'Chicken', 'Lamb', 'Goat', 'Organic', 'Farm-raised', 'Deli'],
  home_cook: ['Home-style', 'Baked goods', 'Desserts', 'Somali', 'Pakistani', 'Arab', 'Afghan'],
};

export default function SellerOnboardingScreen({ navigation }: Props) {
  useScreenLogger('SellerOnboardingScreen');
  const insets = useSafeAreaInsets();
  const { user, refresh } = useSession();

  const [sellerType, setSellerType] = useState<SellerType | null>(null);
  const [businessName, setBusinessName] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [tier, setTier] = useState<FoodCategoryTier | null>(null);
  const [docs, setDocs] = useState<Partial<Record<DocKind, string>>>({});
  const [uploadingDoc, setUploadingDoc] = useState<DocKind | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { errors, setErrors, clearError } = useInlineErrors<DetailField>();

  const steps = useMemo<StepKey[]>(
    () =>
      sellerType === 'home_cook'
        ? ['type', 'details', 'tier', 'docs', 'review']
        : ['type', 'details', 'docs', 'review'],
    [sellerType]
  );
  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex] ?? 'type';

  const isHomeCook = sellerType === 'home_cook';
  const isHighRisk = isHomeCook && tier === 'high_risk';

  // Which docs this application needs (permit is always optional).
  const requiredDocs = useMemo<DocKind[]>(() => {
    if (!sellerType) return [];
    if (sellerType === 'home_cook') {
      return tier === 'high_risk' ? ['id', 'food_handler_cert'] : ['id'];
    }
    return ['licence', 'id'];
  }, [sellerType, tier]);

  const docsComplete = requiredDocs.every((k) => !!docs[k]);

  // ── Navigation between steps ────────────────────────────────────────────
  const goBackStep = () => {
    if (stepIndex === 0) navigation.goBack();
    else setStepIndex((i) => i - 1);
  };

  const validateDetails = (): boolean => {
    const next: Partial<Record<DetailField, string>> = {};
    if (!businessName.trim()) next.businessName = 'Give your business a name — it can be simple!';
    if (!address.trim()) next.address = 'We need an address so drivers know where to pick up.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const goNext = () => {
    if (step === 'type' && !sellerType) {
      notify.info('Pick the option that fits you best.');
      return;
    }
    if (step === 'details' && !validateDetails()) return;
    if (step === 'tier' && !tier) {
      notify.info('Choose the category that matches what you plan to sell.');
      return;
    }
    if (step === 'docs' && !docsComplete) {
      notify.info('Almost there — just a couple of documents left.');
      return;
    }
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  };

  // ── Tags ────────────────────────────────────────────────────────────────
  const addTag = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    setTags((prev) => (prev.includes(t) || prev.length >= 6 ? prev : [...prev, t]));
    setTagInput('');
  };
  const removeTag = (t: string) => setTags((prev) => prev.filter((x) => x !== t));

  // ── Document upload ─────────────────────────────────────────────────────
  const pickAndUpload = useCallback(
    async (kind: DocKind) => {
      if (!user) return;
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        notify.error('Photo access is needed to upload documents.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.7,
        base64: true,
      });
      const asset = res.canceled ? null : res.assets?.[0];
      if (!asset?.base64) return;
      setUploadingDoc(kind);
      try {
        const path = await ProfileService.uploadVerificationDoc(user.id, kind, asset.base64);
        if (!path) {
          notify.error("That upload didn't go through. Please try again.");
          return;
        }
        setDocs((prev) => ({ ...prev, [kind]: path }));
        notify.success('Uploaded — looking good!');
      } finally {
        setUploadingDoc(null);
      }
    },
    [user]
  );

  // ── Submit ──────────────────────────────────────────────────────────────
  const submit = async () => {
    if (!user || !sellerType || submitting) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('sellers').insert({
        user_id: user.id,
        seller_type: sellerType,
        business_name: businessName.trim(),
        description: description.trim() || null,
        address: address.trim(),
        cuisine_tags: tags,
        verification_status: 'pending',
        commission_rate: COMMISSION[sellerType],
        food_category_tier: isHomeCook ? tier : null,
        permit_status: 'none',
        compliance_label:
          isHomeCook && tier === 'low_risk' ? 'Low-risk home foods — baked goods, desserts & snacks' : null,
        id_doc_path: docs.id ?? null,
        licence_doc_path: docs.licence ?? null,
        food_handler_cert_path: docs.food_handler_cert ?? null,
        permit_doc_path: docs.permit ?? null,
        accepts_realtime: sellerType !== 'home_cook',
        accepts_scheduled: sellerType !== 'restaurant',
      });
      if (error) throw error;
      await ProfileService.setRole(user.id, 'seller');
      await refresh();
      notify.success('Application submitted — welcome aboard!');
      navigation.replace('SellerVerificationPending');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error('Onboarding', 'seller submit failed', { error: msg });
      notify.error("We couldn't submit your application. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Step renderers ──────────────────────────────────────────────────────
  const renderTypeStep = () => (
    <View>
      <Text style={styles.stepTitle}>What kind of seller are you?</Text>
      <Text style={styles.stepSubtitle}>
        Every seller on HalalBasket is halal-only. Pick the option that fits — you can always talk to
        us if you're not sure.
      </Text>
      {TYPE_CARDS.map((card) => {
        const selected = sellerType === card.type;
        return (
          <TouchableOpacity
            key={card.type}
            style={[styles.typeCard, selected && styles.typeCardSelected]}
            activeOpacity={0.85}
            onPress={() => {
              setSellerType(card.type);
              if (card.type !== 'home_cook') setTier(null);
              setDocs({});
            }}
          >
            <View style={styles.typeCardHeader}>
              <View style={[styles.typeIconWrap, selected && styles.typeIconWrapSelected]}>
                <Ionicons name={card.icon} size={22} color={selected ? '#FFFFFF' : lightColors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.typeTitle}>{card.title}</Text>
                <Text style={styles.typeTagline}>{card.tagline}</Text>
              </View>
              <Ionicons
                name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                size={24}
                color={selected ? lightColors.primary : lightColors.divider}
              />
            </View>
            {card.bullets.map((b) => (
              <View key={b} style={styles.bulletRow}>
                <Ionicons name="checkmark" size={14} color={lightColors.primary} />
                <Text style={styles.bulletText}>{b}</Text>
              </View>
            ))}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderDetailsStep = () => (
    <View>
      <Text style={styles.stepTitle}>Tell us about your business</Text>
      <Text style={styles.stepSubtitle}>
        This is what customers will see when they find you. Don't worry — you can edit everything later.
      </Text>

      <Text style={styles.fieldLabel}>Business name</Text>
      <TextInput
        style={[styles.input, errorBorder(!!errors.businessName)]}
        placeholder={isHomeCook ? "e.g. Amina's Kitchen" : 'e.g. Al-Madina Grill'}
        placeholderTextColor={lightColors.textMuted}
        value={businessName}
        onChangeText={(t) => {
          setBusinessName(t);
          clearError('businessName');
        }}
      />
      <FieldError message={errors.businessName} />

      <Text style={styles.fieldLabel}>Description</Text>
      <TextInput
        style={[styles.input, styles.inputMultiline]}
        placeholder="What do you make? What makes it special?"
        placeholderTextColor={lightColors.textMuted}
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={3}
      />

      <Text style={styles.fieldLabel}>{isHomeCook ? 'Pickup address' : 'Business address'}</Text>
      <TextInput
        style={[styles.input, errorBorder(!!errors.address)]}
        placeholder="Street address, city"
        placeholderTextColor={lightColors.textMuted}
        value={address}
        onChangeText={(t) => {
          setAddress(t);
          clearError('address');
        }}
      />
      <FieldError message={errors.address} />
      {isHomeCook && (
        <Text style={styles.helperText}>
          Your exact address is only shared with drivers at pickup time.
        </Text>
      )}

      <Text style={styles.fieldLabel}>Cuisine & product tags</Text>
      <View style={styles.tagRow}>
        {tags.map((t) => (
          <TouchableOpacity key={t} style={styles.tagChipActive} onPress={() => removeTag(t)}>
            <Text style={styles.tagChipActiveText}>{t}</Text>
            <Ionicons name="close" size={13} color="#FFFFFF" />
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.tagInputRow}>
        <TextInput
          style={[styles.input, { flex: 1, marginBottom: 0 }]}
          placeholder="Add a tag"
          placeholderTextColor={lightColors.textMuted}
          value={tagInput}
          onChangeText={setTagInput}
          onSubmitEditing={() => addTag(tagInput)}
          returnKeyType="done"
        />
        <TouchableOpacity style={styles.tagAddBtn} onPress={() => addTag(tagInput)}>
          <Ionicons name="add" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
      {sellerType && (
        <View style={styles.tagRow}>
          {TAG_SUGGESTIONS[sellerType]
            .filter((t) => !tags.includes(t))
            .map((t) => (
              <TouchableOpacity key={t} style={styles.tagChip} onPress={() => addTag(t)}>
                <Text style={styles.tagChipText}>{t}</Text>
              </TouchableOpacity>
            ))}
        </View>
      )}
    </View>
  );

  const renderTierStep = () => (
    <View>
      <Text style={styles.stepTitle}>What will you be cooking?</Text>
      <Text style={styles.stepSubtitle}>
        Food safety rules depend on what you sell. Both paths are welcome — one just starts faster.
      </Text>

      <TouchableOpacity
        style={[styles.typeCard, tier === 'low_risk' && styles.typeCardSelected]}
        activeOpacity={0.85}
        onPress={() => setTier('low_risk')}
      >
        <View style={styles.typeCardHeader}>
          <View style={[styles.typeIconWrap, tier === 'low_risk' && styles.typeIconWrapSelected]}>
            <Ionicons name="cafe-outline" size={22} color={tier === 'low_risk' ? '#FFFFFF' : lightColors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.typeTitle}>Low-risk foods</Text>
            <Text style={styles.typeTagline}>Baked goods, desserts & snacks</Text>
          </View>
          <Ionicons
            name={tier === 'low_risk' ? 'checkmark-circle' : 'ellipse-outline'}
            size={24}
            color={tier === 'low_risk' ? lightColors.primary : lightColors.divider}
          />
        </View>
        <View style={styles.bulletRow}>
          <Ionicons name="flash" size={14} color={lightColors.primary} />
          <Text style={styles.bulletText}>Start selling right away — all we need is your ID</Text>
        </View>
        <View style={styles.bulletRow}>
          <Ionicons name="checkmark" size={14} color={lightColors.primary} />
          <Text style={styles.bulletText}>Cookies, cakes, baklava, granola, spice mixes…</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.typeCard, tier === 'high_risk' && styles.typeCardSelected]}
        activeOpacity={0.85}
        onPress={() => setTier('high_risk')}
      >
        <View style={styles.typeCardHeader}>
          <View style={[styles.typeIconWrap, tier === 'high_risk' && styles.typeIconWrapSelected]}>
            <Ionicons name="restaurant-outline" size={22} color={tier === 'high_risk' ? '#FFFFFF' : lightColors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.typeTitle}>Full meals</Text>
            <Text style={styles.typeTagline}>Cooked meals & meat dishes</Text>
          </View>
          <Ionicons
            name={tier === 'high_risk' ? 'checkmark-circle' : 'ellipse-outline'}
            size={24}
            color={tier === 'high_risk' ? lightColors.primary : lightColors.divider}
          />
        </View>
        <View style={styles.bulletRow}>
          <Ionicons name="shield-checkmark-outline" size={14} color={lightColors.primary} />
          <Text style={styles.bulletText}>
            Needs a food handler certificate and a home-kitchen permit — totally doable, and we'll
            guide you through every step
          </Text>
        </View>
        <View style={styles.bulletRow}>
          <Ionicons name="checkmark" size={14} color={lightColors.primary} />
          <Text style={styles.bulletText}>Biryani, curries, grilled meats, full family meals…</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.infoBanner}>
        <Ionicons name="heart-outline" size={16} color={lightColors.primary} />
        <Text style={styles.infoBannerText}>
          Many cooks start with low-risk foods and unlock full meals later. You can upgrade any time
          from your dashboard.
        </Text>
      </View>
    </View>
  );

  const docMeta: Record<DocKind, { title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap }> = {
    id: { title: 'Government ID', subtitle: "Driver's licence, passport or provincial ID", icon: 'card-outline' },
    licence: { title: 'Business licence', subtitle: 'Your municipal or provincial business licence', icon: 'document-text-outline' },
    food_handler_cert: { title: 'Food handler certificate', subtitle: 'Your food safety course certificate', icon: 'ribbon-outline' },
    permit: { title: 'Home kitchen permit (optional)', subtitle: 'Already have a permit? Upload it to fast-track approval', icon: 'shield-checkmark-outline' },
  };

  const renderDocRow = (kind: DocKind, optional = false) => {
    const meta = docMeta[kind];
    const uploaded = !!docs[kind];
    const uploading = uploadingDoc === kind;
    return (
      <TouchableOpacity
        key={kind}
        style={[styles.docCard, uploaded && styles.docCardDone]}
        activeOpacity={0.85}
        onPress={() => pickAndUpload(kind)}
        disabled={uploading}
      >
        <View style={[styles.typeIconWrap, uploaded && styles.typeIconWrapSelected]}>
          <Ionicons name={meta.icon} size={20} color={uploaded ? '#FFFFFF' : lightColors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.typeTitle}>{meta.title}</Text>
          <Text style={styles.typeTagline}>{uploaded ? 'Uploaded — tap to replace' : meta.subtitle}</Text>
        </View>
        {uploading ? (
          <ActivityIndicator size="small" color={lightColors.primary} />
        ) : uploaded ? (
          <Ionicons name="checkmark-circle" size={24} color={lightColors.primary} />
        ) : (
          <View style={styles.uploadPill}>
            <Text style={styles.uploadPillText}>{optional ? 'Add' : 'Upload'}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderDocsStep = () => (
    <View>
      <Text style={styles.stepTitle}>A few documents</Text>
      <Text style={styles.stepSubtitle}>
        {isHomeCook && tier === 'low_risk'
          ? "Just your ID — that's it. Snap a clear photo and you're done."
          : 'Clear photos are perfect — no scanner needed. Our team reviews these within a couple of days.'}
      </Text>
      {requiredDocs.map((k) => renderDocRow(k))}
      {isHighRisk && renderDocRow('permit', true)}
      <View style={styles.infoBanner}>
        <Ionicons name="lock-closed-outline" size={16} color={lightColors.primary} />
        <Text style={styles.infoBannerText}>
          Documents are stored privately and only used for verification. They're never shown to customers.
        </Text>
      </View>
    </View>
  );

  const renderReviewStep = () => {
    const typeCard = TYPE_CARDS.find((c) => c.type === sellerType);
    const rows: Array<[string, string]> = [
      ['Seller type', typeCard?.title ?? ''],
      ['Business name', businessName],
      ['Address', address],
      ['Tags', tags.length ? tags.join(', ') : '—'],
    ];
    if (isHomeCook) {
      rows.push(['Food category', tier === 'high_risk' ? 'Full meals (high-risk)' : 'Low-risk foods']);
    }
    rows.push([
      'Commission',
      sellerType === 'home_cook' ? '0% — you keep 100% of your food price' : `${Math.round(COMMISSION[sellerType ?? 'restaurant'] * 100)}% of food subtotal`,
    ]);
    rows.push(['Documents', `${requiredDocs.filter((k) => docs[k]).length + (docs.permit ? 1 : 0)} uploaded`]);
    return (
      <View>
        <Text style={styles.stepTitle}>Ready to submit?</Text>
        <Text style={styles.stepSubtitle}>
          One last look. After you submit, our team reviews your application — most are approved within
          1–2 business days.
        </Text>
        <View style={styles.reviewCard}>
          {rows.map(([label, value], i) => (
            <View key={label} style={[styles.reviewRow, i > 0 && styles.reviewRowBorder]}>
              <Text style={styles.reviewLabel}>{label}</Text>
              <Text style={styles.reviewValue} numberOfLines={2}>
                {value}
              </Text>
            </View>
          ))}
        </View>
        {description ? (
          <View style={styles.reviewCard}>
            <Text style={styles.reviewLabel}>Description</Text>
            <Text style={[styles.reviewValue, { textAlign: 'left', marginTop: 4 }]}>{description}</Text>
          </View>
        ) : null}
        <View style={styles.infoBanner}>
          <Ionicons name="sparkles-outline" size={16} color={lightColors.primary} />
          <Text style={styles.infoBannerText}>
            We're excited to have you. You'll get a notification the moment you're approved.
          </Text>
        </View>
      </View>
    );
  };

  const nextLabel = step === 'review' ? 'Submit application' : 'Continue';
  const nextDisabled =
    (step === 'type' && !sellerType) ||
    (step === 'tier' && !tier) ||
    (step === 'docs' && !docsComplete) ||
    submitting;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <BackgroundPattern />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={goBackStep} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={lightColors.textDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Become a seller</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Progress dots */}
      <View style={styles.dotsRow}>
        {steps.map((s, i) => (
          <View
            key={s}
            style={[styles.dot, i === stepIndex && styles.dotActive, i < stepIndex && styles.dotDone]}
          />
        ))}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 'type' && renderTypeStep()}
          {step === 'details' && renderDetailsStep()}
          {step === 'tier' && renderTierStep()}
          {step === 'docs' && renderDocsStep()}
          {step === 'review' && renderReviewStep()}
        </ScrollView>

        {/* Bottom action bar */}
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
          <TouchableOpacity
            style={[styles.primaryBtn, nextDisabled && styles.primaryBtnDisabled]}
            onPress={step === 'review' ? submit : goNext}
            disabled={nextDisabled}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryBtnText}>{nextLabel}</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: lightColors.background },
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
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: spacing.sm,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: lightColors.chipBg },
  dotActive: { backgroundColor: lightColors.primary, width: 22 },
  dotDone: { backgroundColor: 'rgba(26,92,56,0.45)' },
  scrollContent: { padding: spacing.md, paddingBottom: 32 },

  stepTitle: { fontSize: 22, fontWeight: '800', color: lightColors.textDark, marginBottom: 6 },
  stepSubtitle: { fontSize: 14, color: lightColors.textMuted, lineHeight: 20, marginBottom: spacing.md },

  typeCard: {
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    marginBottom: spacing.sm + 4,
  },
  typeCardSelected: {
    borderColor: lightColors.primary,
    borderWidth: 1.5,
    backgroundColor: '#FBFEFC',
    shadowColor: lightColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  typeCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  typeIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeIconWrapSelected: { backgroundColor: lightColors.primary },
  typeTitle: { fontSize: 16, fontWeight: '800', color: lightColors.textDark },
  typeTagline: { fontSize: 12.5, color: lightColors.textMuted, marginTop: 1 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginTop: 5, paddingRight: 6 },
  bulletText: { flex: 1, fontSize: 13, color: lightColors.textDark, lineHeight: 18 },

  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: lightColors.textDark,
    marginBottom: 6,
    marginTop: spacing.md,
  },
  input: {
    backgroundColor: lightColors.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: lightColors.textDark,
  },
  inputMultiline: { minHeight: 84, textAlignVertical: 'top' },
  helperText: { fontSize: 12, color: lightColors.textMuted, marginTop: 6 },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  tagChip: {
    backgroundColor: lightColors.chipBg,
    borderRadius: 9999,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  tagChipText: { color: lightColors.primary, fontSize: 13, fontWeight: '600' },
  tagChipActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: lightColors.primary,
    borderRadius: 9999,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  tagChipActiveText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  tagInputRow: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' },
  tagAddBtn: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: lightColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    marginBottom: spacing.sm + 4,
  },
  docCardDone: { borderColor: lightColors.primary, backgroundColor: '#FBFEFC' },
  uploadPill: {
    backgroundColor: lightColors.chipBg,
    borderRadius: 9999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  uploadPillText: { color: lightColors.primary, fontWeight: '700', fontSize: 13 },

  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: lightColors.chipBg,
    borderRadius: 12,
    padding: 12,
    marginTop: spacing.sm,
  },
  infoBannerText: { flex: 1, fontSize: 12.5, color: lightColors.textDark, lineHeight: 18 },

  reviewCard: {
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    marginBottom: spacing.sm + 4,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 9,
  },
  reviewRowBorder: { borderTopWidth: 1, borderTopColor: lightColors.divider },
  reviewLabel: { fontSize: 13, color: lightColors.textMuted, fontWeight: '600' },
  reviewValue: { flex: 1, fontSize: 13.5, color: lightColors.textDark, fontWeight: '600', textAlign: 'right' },

  bottomBar: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: lightColors.background,
    borderTopWidth: 1,
    borderTopColor: lightColors.divider,
  },
  primaryBtn: {
    backgroundColor: lightColors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
