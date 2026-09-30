// app/auth/CompleteProfileScreen.tsx — post-signup profile completion: first
// name, last name, phone. Ensures the Supabase users row exists, saves the
// details, then refreshes the session (RootNavigator shows Main automatically
// once the session is live).

import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useUser } from '@clerk/clerk-expo';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/types';
import { lightColors } from '../../constants/theme';
import { fonts } from '../../constants/typography';
import LoadingDots from '../components/ui/LoadingDots';
import { FieldError, errorBorder, useInlineErrors } from '../components/ui/FieldError';
import { ProfileService } from '../services/profile';
import { useSession } from '../context/SessionContext';
import { notify } from '../lib/notify';
import { BrandWordmark } from '../components/ui/Discovery';

type Props = NativeStackScreenProps<AuthStackParamList, 'CompleteProfile'>;

type Field = 'firstName' | 'lastName' | 'phone';

// Loose phone check: 10-15 digits after stripping formatting.
const phoneDigits = (raw: string) => raw.replace(/\D/g, '');

const CompleteProfileScreen = (_props: Props) => {
  const { userId } = useAuth();
  const { user: clerkUser } = useUser();
  const { refresh } = useSession();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const { errors, setErrors, clearError } = useInlineErrors<Field>();

  const validate = (): boolean => {
    const next: Partial<Record<Field, string>> = {};
    if (!firstName.trim()) next.firstName = 'Enter your first name';
    if (!lastName.trim()) next.lastName = 'Enter your last name';
    const digits = phoneDigits(phone);
    if (digits.length < 10 || digits.length > 15) {
      next.phone = 'Enter a valid phone number';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    if (!userId) {
      notify.error('Your session has expired. Please sign in again.');
      return;
    }

    setSaving(true);
    try {
      const row = await ProfileService.ensureUser(
        userId,
        clerkUser?.primaryEmailAddress?.emailAddress,
      );
      if (!row) {
        notify.error('Could not load your profile. Please try again.');
        return;
      }

      const ok = await ProfileService.updateUser(row.id, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim(),
        ...(address.trim() ? { default_address: address.trim() } : {}),
      });
      if (!ok) {
        notify.error('Could not save your details. Please try again.');
        return;
      }

      notify.success(`Welcome to HalalBasket, ${firstName.trim()}!`);
      // Session refresh picks up the updated row; RootNavigator shows Main.
      await refresh();
    } catch {
      notify.error('Could not connect to your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const isFormValid =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    phoneDigits(phone).length >= 10 &&
    phoneDigits(phone).length <= 15;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topBar}>
            <BrandWordmark />
          </View>
          <View style={styles.headingWrap}>
            <Text style={styles.title}>Make it yours</Text>
            <Text style={styles.subtitle}>A few details to get you started.</Text>
          </View>
          <View style={styles.avatarWrap}>
            {clerkUser?.hasImage ? (
              <Image source={{ uri: clerkUser.imageUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                {firstName ? (
                  <Text style={styles.initial}>{firstName.charAt(0).toUpperCase()}</Text>
                ) : (
                  <Ionicons name="person-outline" size={48} color={lightColors.primary} />
                )}
              </View>
            )}
            <View style={styles.avatarBadge}>
              <Ionicons name="leaf" size={18} color="#FFFFFF" />
            </View>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <View style={styles.nameRow}>
              <View style={styles.nameField}>
                <Text style={styles.label}>First name</Text>
                <View style={[styles.inputRow, errorBorder(!!errors.firstName)]}>
                  <TextInput
                    style={styles.input}
                    placeholder="First name"
                    accessibilityLabel="First name"
                    autoComplete="given-name"
                    placeholderTextColor={lightColors.textMuted}
                    value={firstName}
                    onChangeText={(t) => {
                      setFirstName(t);
                      clearError('firstName');
                    }}
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
                </View>
                <FieldError message={errors.firstName} />
              </View>
              <View style={styles.nameField}>
                <Text style={styles.label}>Last name</Text>
                <View style={[styles.inputRow, errorBorder(!!errors.lastName)]}>
                  <TextInput
                    style={styles.input}
                    placeholder="Last name"
                    accessibilityLabel="Last name"
                    autoComplete="family-name"
                    placeholderTextColor={lightColors.textMuted}
                    value={lastName}
                    onChangeText={(t) => {
                      setLastName(t);
                      clearError('lastName');
                    }}
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
                </View>
                <FieldError message={errors.lastName} />
              </View>
            </View>

            <Text style={styles.label}>Phone number</Text>
            <View style={[styles.inputRow, errorBorder(!!errors.phone)]}>
              <Ionicons
                name="call-outline"
                size={20}
                color={errors.phone ? lightColors.error : lightColors.textMuted}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="(555) 123-4567"
                accessibilityLabel="Phone number"
                autoComplete="tel"
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
            <Text style={styles.hint}>So your driver can reach you during delivery.</Text>
            <Text style={styles.label}>
              Delivery address <Text style={styles.optional}>(optional)</Text>
            </Text>
            <View style={styles.inputRow}>
              <Ionicons
                name="location-outline"
                size={20}
                color={lightColors.textMuted}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                accessibilityLabel="Delivery address, optional"
                placeholder="Street address, city"
                placeholderTextColor={lightColors.textMuted}
                value={address}
                onChangeText={setAddress}
                autoComplete="street-address"
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, (!isFormValid || saving) && styles.primaryBtnDisabled]}
              onPress={handleSave}
              disabled={!isFormValid || saving}
              accessibilityRole="button"
              accessibilityState={{ disabled: !isFormValid || saving, busy: saving }}
              activeOpacity={0.85}
            >
              {saving && <LoadingDots color="#FFFFFF" />}
              <Text style={styles.primaryBtnText}>{saving ? 'Saving…' : 'Continue'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.background,
    overflow: 'hidden',
  },
  scroll: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    paddingBottom: 32,
  },
  topBar: { padding: 24, alignItems: 'flex-end' },
  nameRow: { flexDirection: 'row', gap: 12 },
  nameField: { flex: 1, gap: 8 },
  avatarWrap: { alignSelf: 'center', marginVertical: 28 },
  avatar: { width: 128, height: 128, borderRadius: 64 },
  avatarFallback: {
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { fontFamily: fonts.extraBold, fontSize: 48, color: lightColors.primary },
  avatarBadge: {
    position: 'absolute',
    bottom: 2,
    right: 0,
    backgroundColor: lightColors.primary,
    borderRadius: 20,
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: lightColors.background,
  },
  optional: { fontFamily: fonts.regular, color: lightColors.textMuted },
  headingWrap: {
    paddingHorizontal: 24,
    alignItems: 'flex-start',
    marginTop: 16,
    marginBottom: 0,
  },
  title: {
    alignSelf: 'stretch',
    textAlign: 'left',
    fontSize: 32,
    lineHeight: 40,
    fontFamily: fonts.extraBold,
    color: lightColors.textDark,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: lightColors.textMuted,
    textAlign: 'left',
    maxWidth: 300,
  },
  form: {
    paddingHorizontal: 24,
    gap: 8,
  },
  label: {
    fontSize: 13.5,
    fontFamily: fonts.bold,
    color: lightColors.textDark,
    marginTop: 8,
    marginLeft: 2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: lightColors.divider,
    paddingHorizontal: 14,
    minHeight: 54,
    paddingVertical: 8,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: lightColors.textDark,
    fontSize: 15,
    fontFamily: fonts.medium,
  },
  hint: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
    lineHeight: 18,
    color: lightColors.textMuted,
    marginLeft: 2,
    marginTop: 2,
  },
  primaryBtn: {
    gap: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lightColors.primary,
    borderRadius: 18,
    paddingVertical: 16,
    marginTop: 40,
    shadowColor: lightColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0,
    shadowRadius: 8,
    elevation: 0,
  },
  primaryBtnDisabled: {
    backgroundColor: '#83968A',
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontFamily: fonts.bold,
  },
});

export default CompleteProfileScreen;
