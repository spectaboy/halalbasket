// app/profile/EditProfileScreen.tsx — edit name / phone / default address and
// avatar. Avatar goes through expo-image-picker (base64) into the public
// 'avatars' storage bucket; the public URL lands on users.avatar_url.

import React, { useState } from 'react';
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
import type { MainStackParamList } from '../navigation/types';
import { lightColors } from '../../constants/theme';
import { fonts } from '../../constants/typography';
import { BackButton, BrandWordmark } from '../components/ui/Discovery';
import ProfileAvatar, { profileInitials } from './ProfileAvatar';
import { supabase } from '../config/supabase';
import { useSession } from '../context/SessionContext';
import { ProfileService } from '../services/profile';
import { FieldError, errorBorder, useInlineErrors } from '../components/ui/FieldError';
import { notify } from '../lib/notify';
import { logger } from '../utils/logger';

type Props = NativeStackScreenProps<MainStackParamList, 'EditProfile'>;

type Field = 'firstName' | 'lastName' | 'phone';

const EditProfileScreen = ({ navigation }: Props) => {
  const insets = useSafeAreaInsets();
  const { user, refresh } = useSession();

  const [firstName, setFirstName] = useState(user?.first_name ?? '');
  const [lastName, setLastName] = useState(user?.last_name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [defaultAddress, setDefaultAddress] = useState(user?.default_address ?? '');
  // Local pick held until Save; preview via uri, upload via base64.
  const [pickedAvatar, setPickedAvatar] = useState<{ uri: string; base64: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const { errors, setErrors, clearError } = useInlineErrors<Field>();

  const avatarUri = pickedAvatar?.uri ?? user?.avatar_url ?? null;

  const handlePickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      notify.warning('Allow photo access to update your profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.base64) {
      notify.error('Could not read that image. Please try another one.');
      return;
    }
    setPickedAvatar({ uri: asset.uri, base64: asset.base64 });
  };

  const uploadAvatar = async (userId: string, base64: string): Promise<string | null> => {
    const path = `${userId}/avatar_${Date.now()}.jpg`;
    const { decode } = await import('base64-arraybuffer');
    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, decode(base64), { contentType: 'image/jpeg', upsert: true });
    if (error) {
      logger.error('User', 'avatar upload failed', { error: error.message });
      return null;
    }
    return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
  };

  const validate = (): boolean => {
    const next: Partial<Record<Field, string>> = {};
    if (!firstName.trim()) next.firstName = 'First name is required';
    if (!lastName.trim()) next.lastName = 'Last name is required';
    const digits = phone.replace(/\D/g, '');
    if (phone.trim() && (digits.length < 10 || digits.length > 15)) {
      next.phone = 'Enter a valid phone number';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!user) return;
    if (!validate()) return;

    setSaving(true);
    try {
      let avatarUrl = user.avatar_url;
      if (pickedAvatar) {
        const uploaded = await uploadAvatar(user.id, pickedAvatar.base64);
        if (!uploaded) {
          notify.error('Your photo could not be uploaded. Please try again.');
          return;
        }
        avatarUrl = uploaded;
      }

      const ok = await ProfileService.updateUser(user.id, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim() || null,
        default_address: defaultAddress.trim() || null,
        avatar_url: avatarUrl,
      });
      if (!ok) {
        notify.error('Could not save your changes. Please try again.');
        return;
      }

      await refresh();
      notify.success('Profile updated');
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <BrandWordmark />
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heading}>
            <Text style={styles.title}>Personal details</Text>
            <Text style={styles.subtitle}>A little about you. All in one place.</Text>
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
            onPress={handlePickAvatar}
            activeOpacity={0.8}
            style={styles.photoCard}
          >
            <View>
              <ProfileAvatar
                uri={avatarUri}
                initials={profileInitials(firstName, lastName, user?.email)}
                size={88}
              />
              <View style={styles.cameraBadge}>
                <Ionicons name="camera-outline" size={17} color="#fff" />
              </View>
            </View>
            <View style={styles.photoBody}>
              <Text style={styles.photoTitle}>Your profile photo</Text>
              <Text style={styles.hint}>Put a face to your favourites.</Text>
              <Text style={styles.photoLink}>Change photo</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>First name</Text>
              <View style={[styles.inputRow, errorBorder(!!errors.firstName)]}>
                <TextInput
                  accessibilityLabel="First name"
                  style={styles.input}
                  placeholder="First name"
                  placeholderTextColor={lightColors.textMuted}
                  value={firstName}
                  onChangeText={(t) => {
                    setFirstName(t);
                    clearError('firstName');
                  }}
                  autoCapitalize="words"
                />
              </View>
              <FieldError message={errors.firstName} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Last name</Text>
              <View style={[styles.inputRow, errorBorder(!!errors.lastName)]}>
                <TextInput
                  accessibilityLabel="Last name"
                  style={styles.input}
                  placeholder="Last name"
                  placeholderTextColor={lightColors.textMuted}
                  value={lastName}
                  onChangeText={(t) => {
                    setLastName(t);
                    clearError('lastName');
                  }}
                  autoCapitalize="words"
                />
              </View>
              <FieldError message={errors.lastName} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Phone number</Text>
              <View style={[styles.inputRow, errorBorder(!!errors.phone)]}>
                <Ionicons name="call-outline" size={20} color={lightColors.textMuted} />
                <TextInput
                  accessibilityLabel="Phone number"
                  style={styles.input}
                  placeholder="(555) 123-4567"
                  placeholderTextColor={lightColors.textMuted}
                  value={phone}
                  onChangeText={(t) => {
                    setPhone(t);
                    clearError('phone');
                  }}
                  keyboardType="phone-pad"
                />
              </View>
              <FieldError message={errors.phone} />
              <Text style={styles.hint}>So your driver can reach you.</Text>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Default delivery address</Text>
              <View style={[styles.inputRow, styles.inputRowMultiline]}>
                <Ionicons name="location-outline" size={21} color={lightColors.textMuted} />
                <TextInput
                  accessibilityLabel="Default delivery address"
                  style={[styles.input, styles.inputMultiline]}
                  placeholder="Street, city, postal code"
                  placeholderTextColor={lightColors.textMuted}
                  value={defaultAddress}
                  onChangeText={setDefaultAddress}
                  multiline
                  numberOfLines={2}
                />
              </View>
              <Text style={styles.hint}>Ready for checkout. You can change it for each order.</Text>
            </View>
          </View>
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Save changes"
            accessibilityState={{ disabled: saving, busy: saving }}
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.saveBtnText}>Save changes</Text>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: lightColors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 24,
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
  },
  heading: { gap: 8 },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 32,
    lineHeight: 39,
    letterSpacing: -1.1,
    color: lightColors.textDark,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 22,
    color: lightColors.textMuted,
  },
  photoCard: {
    padding: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    borderRadius: 22,
    backgroundColor: lightColors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  photoBody: { flex: 1, gap: 5 },
  photoTitle: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 22, color: lightColors.textDark },
  photoLink: {
    fontFamily: fonts.bold,
    fontSize: 13,
    lineHeight: 20,
    color: lightColors.primary,
    marginTop: 4,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: lightColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: lightColors.surface,
  },
  form: { gap: 20 },
  field: { gap: 8 },
  label: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 20, color: lightColors.textDark },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: lightColors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: lightColors.divider,
    paddingHorizontal: 14,
    minHeight: 56,
  },
  inputRowMultiline: { minHeight: 88, paddingVertical: 10 },
  input: {
    flex: 1,
    minHeight: 54,
    fontFamily: fonts.medium,
    color: lightColors.textDark,
    fontSize: 14,
    paddingVertical: 12,
  },
  inputMultiline: { textAlignVertical: 'top' },
  hint: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: lightColors.textMuted },
  footer: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: lightColors.background,
    borderTopWidth: 1,
    borderTopColor: lightColors.divider,
  },
  saveBtn: {
    minHeight: 56,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: lightColors.primary,
    borderRadius: 16,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { fontFamily: fonts.bold, color: '#FFFFFF', fontSize: 16 },
});

export default EditProfileScreen;
