// app/profile/EditProfileScreen.tsx — edit name / phone / default address and
// avatar. Avatar goes through expo-image-picker (base64) into the public
// 'avatars' storage bucket; the public URL lands on users.avatar_url.

import React, { useState } from 'react';
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
import type { MainStackParamList } from '../navigation/types';
import { lightColors } from '../../constants/theme';
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={lightColors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Avatar */}
          <View style={styles.avatarWrap}>
            <TouchableOpacity onPress={handlePickAvatar} activeOpacity={0.8}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Ionicons name="person" size={44} color={lightColors.primary} />
                </View>
              )}
              <View style={styles.cameraBadge}>
                <Ionicons name="camera" size={16} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
            <Text style={styles.avatarHint}>Tap to change photo</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Text style={styles.label}>First name</Text>
            <View style={[styles.inputRow, errorBorder(!!errors.firstName)]}>
              <TextInput
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

            <Text style={styles.label}>Last name</Text>
            <View style={[styles.inputRow, errorBorder(!!errors.lastName)]}>
              <TextInput
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

            <Text style={styles.label}>Phone number</Text>
            <View style={[styles.inputRow, errorBorder(!!errors.phone)]}>
              <TextInput
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

            <Text style={styles.label}>Default delivery address</Text>
            <View style={[styles.inputRow, styles.inputRowMultiline]}>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                placeholder="Street, city, postal code"
                placeholderTextColor={lightColors.textMuted}
                value={defaultAddress}
                onChangeText={setDefaultAddress}
                multiline
                numberOfLines={2}
              />
            </View>
            <Text style={styles.hint}>Used to pre-fill checkout — you can change it per order.</Text>
          </View>
        </ScrollView>

        {/* Bottom action */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.saveBtnText}>Save changes</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.background,
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
    fontSize: 20,
    fontWeight: '800',
    color: lightColors.textDark,
  },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },

  /* Avatar */
  avatarWrap: {
    alignItems: 'center',
    marginBottom: 28,
  },
  avatar: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: lightColors.inputBg,
  },
  avatarFallback: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: lightColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: lightColors.background,
  },
  avatarHint: {
    marginTop: 10,
    fontSize: 13,
    color: lightColors.textMuted,
    fontWeight: '600',
  },

  /* Form */
  form: {
    gap: 8,
  },
  label: {
    fontSize: 13.5,
    fontWeight: '700',
    color: lightColors.textDark,
    marginTop: 8,
    marginLeft: 2,
  },
  inputRow: {
    backgroundColor: lightColors.inputBg,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: 14,
    minHeight: 54,
    justifyContent: 'center',
  },
  inputRowMultiline: {
    paddingVertical: 10,
  },
  input: {
    color: lightColors.textDark,
    fontSize: 15,
    fontWeight: '500',
  },
  inputMultiline: {
    minHeight: 44,
    textAlignVertical: 'top',
  },
  hint: {
    fontSize: 12.5,
    lineHeight: 18,
    color: lightColors.textMuted,
    marginLeft: 2,
    marginTop: 2,
  },

  /* Footer */
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    backgroundColor: lightColors.background,
    borderTopWidth: 1,
    borderTopColor: lightColors.divider,
  },
  saveBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lightColors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    shadowColor: lightColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  saveBtnDisabled: {
    backgroundColor: '#C8DDD2',
    shadowOpacity: 0,
    elevation: 0,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});

export default EditProfileScreen;
