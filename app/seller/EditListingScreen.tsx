// EditListingScreen — create / edit a listing (modal).
// Image via ProfileService.uploadListingImage, category suggestion chips,
// and (home cooks) the low-risk / high-risk selector with permit gating.

import React, { useEffect, useMemo, useState } from 'react';
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
import { FieldError, errorBorder, useInlineErrors } from '../components/ui/FieldError';
import { notify } from '../lib/notify';
import { logger } from '../utils/logger';
import { useScreenLogger } from '../utils/loggerHooks';
import { supabase } from '../config/supabase';
import { ProfileService } from '../services/profile';
import { useSession } from '../context/SessionContext';
import type { MainStackParamList } from '../navigation/types';
import type { ListingRow, SellerType } from '../types/database';

type Props = NativeStackScreenProps<MainStackParamList, 'EditListing'>;

type Field = 'name' | 'price';

const CATEGORY_SUGGESTIONS: Record<SellerType, string[]> = {
  restaurant: ['Mains', 'Appetizers', 'Sides', 'Desserts', 'Drinks', 'Family meals'],
  butcher: ['Beef', 'Chicken', 'Lamb', 'Goat', 'Deli', 'Eggs', 'Produce'],
  home_cook: ['Meals', 'Baked goods', 'Desserts', 'Snacks', 'Frozen', 'Preserves'],
};

export default function EditListingScreen({ navigation, route }: Props) {
  const listingId = route.params?.listingId;
  useScreenLogger('EditListingScreen', { listingId });
  const insets = useSafeAreaInsets();
  const { seller } = useSession();

  const [loading, setLoading] = useState(!!listingId);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [isLowRisk, setIsLowRisk] = useState(true);
  const [imageUrl, setImageUrl] = useState<string | null>(null); // saved public URL
  const [pendingImage, setPendingImage] = useState<{ uri: string; base64: string } | null>(null);
  const { errors, setErrors, clearError } = useInlineErrors<Field>();

  const isHomeCook = seller?.seller_type === 'home_cook';
  const permitApproved = seller?.permit_status === 'approved';
  const suggestions = useMemo(
    () => (seller ? CATEGORY_SUGGESTIONS[seller.seller_type] : []),
    [seller]
  );

  useEffect(() => {
    if (!listingId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('listings')
        .select('*')
        .eq('id', listingId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        logger.error('Supabase', 'listing load failed', { listingId, error: error?.message });
        notify.error("Couldn't load that listing.");
        navigation.goBack();
        return;
      }
      const row = data as ListingRow;
      setName(row.name);
      setDescription(row.description ?? '');
      setPrice(String(Number(row.price)));
      setCategory(row.category ?? '');
      setIsLowRisk(row.is_low_risk);
      setImageUrl(row.image_url);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [listingId, navigation]);

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      notify.error('Photo access is needed to add a picture.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.75,
      base64: true,
    });
    const asset = res.canceled ? null : res.assets?.[0];
    if (!asset?.base64 || !asset.uri) return;
    setPendingImage({ uri: asset.uri, base64: asset.base64 });
  };

  const save = async () => {
    if (!seller || saving) return;
    const parsedPrice = Number(price.replace(',', '.'));
    const next: Partial<Record<Field, string>> = {};
    if (!name.trim()) next.name = 'Give this item a name.';
    if (!price.trim() || Number.isNaN(parsedPrice) || parsedPrice < 0) {
      next.price = 'Enter a valid price, like 12.99.';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      let finalImageUrl = imageUrl;
      if (pendingImage) {
        finalImageUrl = await ProfileService.uploadListingImage(seller.id, pendingImage.base64);
        if (!finalImageUrl) {
          notify.error("The photo upload didn't go through. Please try again.");
          setSaving(false);
          return;
        }
      }
      const payload = {
        seller_id: seller.id,
        name: name.trim(),
        description: description.trim() || null,
        price: Math.round(parsedPrice * 100) / 100,
        category: category.trim() || null,
        image_url: finalImageUrl,
        is_low_risk: isHomeCook ? isLowRisk : true,
      };
      const { error } = listingId
        ? await supabase.from('listings').update(payload).eq('id', listingId)
        : await supabase.from('listings').insert(payload);
      if (error) throw error;
      notify.success(listingId ? 'Listing updated.' : 'Listing added — nice!');
      navigation.goBack();
    } catch (e: unknown) {
      logger.error('Supabase', 'listing save failed', { error: e instanceof Error ? e.message : String(e) });
      notify.error("Couldn't save the listing. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const previewUri = pendingImage?.uri ?? imageUrl;
  const showHighRiskWarning = isHomeCook && !permitApproved && !isLowRisk;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={lightColors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={24} color={lightColors.textDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{listingId ? 'Edit listing' : 'New listing'}</Text>
        <View style={styles.backBtn} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Image */}
          <TouchableOpacity style={styles.imagePicker} onPress={pickImage} activeOpacity={0.85}>
            {previewUri ? (
              <>
                <Image source={{ uri: previewUri }} style={styles.image} />
                <View style={styles.imageEditBadge}>
                  <Ionicons name="camera" size={15} color="#FFFFFF" />
                  <Text style={styles.imageEditBadgeText}>Change photo</Text>
                </View>
              </>
            ) : (
              <View style={styles.imageEmpty}>
                <View style={styles.imageEmptyIcon}>
                  <Ionicons name="camera-outline" size={26} color={lightColors.primary} />
                </View>
                <Text style={styles.imageEmptyTitle}>Add a photo</Text>
                <Text style={styles.imageEmptySubtitle}>Listings with photos sell 3× better</Text>
              </View>
            )}
          </TouchableOpacity>

          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput
            style={[styles.input, errorBorder(!!errors.name)]}
            placeholder="e.g. Chicken biryani (serves 2)"
            placeholderTextColor={lightColors.textMuted}
            value={name}
            onChangeText={(t) => {
              setName(t);
              clearError('name');
            }}
          />
          <FieldError message={errors.name} />

          <Text style={styles.fieldLabel}>Description</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            placeholder="Ingredients, portion size, what makes it special…"
            placeholderTextColor={lightColors.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
          />

          <Text style={styles.fieldLabel}>Price</Text>
          <View style={[styles.priceRow, errorBorder(!!errors.price)]}>
            <Text style={styles.pricePrefix}>$</Text>
            <TextInput
              style={styles.priceInput}
              placeholder="0.00"
              placeholderTextColor={lightColors.textMuted}
              value={price}
              onChangeText={(t) => {
                setPrice(t.replace(/[^0-9.,]/g, ''));
                clearError('price');
              }}
              keyboardType="decimal-pad"
            />
          </View>
          <FieldError message={errors.price} />

          <Text style={styles.fieldLabel}>Category</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Mains"
            placeholderTextColor={lightColors.textMuted}
            value={category}
            onChangeText={setCategory}
          />
          <View style={styles.chipRow}>
            {suggestions.map((c) => {
              const active = category.trim().toLowerCase() === c.toLowerCase();
              return (
                <TouchableOpacity
                  key={c}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setCategory(c)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{c}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Home-cook risk tier */}
          {isHomeCook && (
            <>
              <Text style={styles.fieldLabel}>Food category</Text>
              <Text style={styles.riskExplainer}>
                Low-risk foods (baked goods, desserts, snacks) can be sold by every verified home cook.
                Full meals and meat dishes need an approved home-kitchen permit.
              </Text>
              <View style={styles.riskRow}>
                <TouchableOpacity
                  style={[styles.riskCard, isLowRisk && styles.riskCardActive]}
                  onPress={() => setIsLowRisk(true)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="cafe-outline" size={20} color={isLowRisk ? '#FFFFFF' : lightColors.primary} />
                  <Text style={[styles.riskTitle, isLowRisk && styles.riskTitleActive]}>Low-risk</Text>
                  <Text style={[styles.riskSubtitle, isLowRisk && styles.riskSubtitleActive]}>
                    Baked, dry & sweet
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.riskCard, !isLowRisk && styles.riskCardActive]}
                  onPress={() => setIsLowRisk(false)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="restaurant-outline" size={20} color={!isLowRisk ? '#FFFFFF' : lightColors.primary} />
                  <Text style={[styles.riskTitle, !isLowRisk && styles.riskTitleActive]}>High-risk</Text>
                  <Text style={[styles.riskSubtitle, !isLowRisk && styles.riskSubtitleActive]}>
                    Meals & meat dishes
                  </Text>
                </TouchableOpacity>
              </View>
              {showHighRiskWarning && (
                <View style={styles.warnBanner}>
                  <Ionicons name="lock-closed-outline" size={16} color="#8A6D1D" />
                  <Text style={styles.warnBannerText}>
                    You can save this listing now, but it stays hidden from customers until your
                    home-kitchen permit is approved. Track your progress in the Compliance tab.
                  </Text>
                </View>
              )}
            </>
          )}
        </ScrollView>

        {/* Bottom bar */}
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
          <TouchableOpacity
            style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
            onPress={save}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryBtnText}>{listingId ? 'Save changes' : 'Add listing'}</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  scrollContent: { padding: spacing.md, paddingBottom: 32 },

  imagePicker: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: spacing.sm,
    backgroundColor: lightColors.inputBg,
  },
  image: { width: '100%', height: 190 },
  imageEditBadge: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  imageEditBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  imageEmpty: {
    height: 170,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(26,92,56,0.20)',
    borderStyle: 'dashed',
    borderRadius: 16,
  },
  imageEmptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  imageEmptyTitle: { fontSize: 15, fontWeight: '800', color: lightColors.textDark },
  imageEmptySubtitle: { fontSize: 12, color: lightColors.textMuted, marginTop: 2 },

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

  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightColors.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 14,
  },
  pricePrefix: { fontSize: 16, fontWeight: '800', color: lightColors.textDark, marginRight: 4 },
  priceInput: { flex: 1, paddingVertical: 13, fontSize: 15, color: lightColors.textDark },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: {
    backgroundColor: lightColors.chipBg,
    borderRadius: 9999,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  chipActive: { backgroundColor: lightColors.primary },
  chipText: { color: lightColors.primary, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#FFFFFF', fontWeight: '700' },

  riskExplainer: { fontSize: 12.5, color: lightColors.textMuted, lineHeight: 18, marginBottom: 10 },
  riskRow: { flexDirection: 'row', gap: 10 },
  riskCard: {
    flex: 1,
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    alignItems: 'center',
    gap: 4,
  },
  riskCardActive: { backgroundColor: lightColors.primary, borderColor: lightColors.primary },
  riskTitle: { fontSize: 14, fontWeight: '800', color: lightColors.textDark, marginTop: 4 },
  riskTitleActive: { color: '#FFFFFF' },
  riskSubtitle: { fontSize: 11.5, color: lightColors.textMuted },
  riskSubtitleActive: { color: 'rgba(255,255,255,0.85)' },

  warnBanner: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: 'rgba(233,162,59,0.13)',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  warnBannerText: { flex: 1, fontSize: 12.5, color: '#6B5312', lineHeight: 18, fontWeight: '600' },

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
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
