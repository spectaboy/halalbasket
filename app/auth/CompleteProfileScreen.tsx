// app/auth/CompleteProfileScreen.tsx — post-signup profile completion: first
// name, last name, phone. Ensures the Supabase users row exists, saves the
// details, then refreshes the session (RootNavigator shows Main automatically
// once the session is live).

import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
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
import BackgroundPattern from '../components/BackgroundPattern';
import { FieldError, errorBorder, useInlineErrors } from '../components/ui/FieldError';
import { ProfileService } from '../services/profile';
import { useSession } from '../context/SessionContext';
import { notify } from '../lib/notify';

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
        clerkUser?.primaryEmailAddress?.emailAddress
      );
      if (!row) {
        notify.error('Could not load your profile. Please try again.');
        return;
      }

      const ok = await ProfileService.updateUser(row.id, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim(),
      });
      if (!ok) {
        notify.error('Could not save your details. Please try again.');
        return;
      }

      notify.success(`Welcome to HalalBasket, ${firstName.trim()}!`);
      // Session refresh picks up the updated row; RootNavigator shows Main.
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const isFormValid =
    firstName.trim().length > 0 && lastName.trim().length > 0 && phoneDigits(phone).length >= 10;

  return (
    <SafeAreaView style={styles.container}>
      <BackgroundPattern />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Heading */}
          <View style={styles.headingWrap}>
            <View style={styles.iconCircle}>
              <Ionicons name="person-add-outline" size={36} color={lightColors.primary} />
            </View>
            <Text style={styles.title}>Almost there</Text>
            <Text style={styles.subtitle}>
              Tell us a little about yourself so sellers and drivers know who they're serving.
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Text style={styles.label}>First name</Text>
            <View style={[styles.inputRow, errorBorder(!!errors.firstName)]}>
              <Ionicons
                name="person-outline"
                size={20}
                color={errors.firstName ? lightColors.error : lightColors.textMuted}
                style={styles.inputIcon}
              />
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
                autoCorrect={false}
              />
            </View>
            <FieldError message={errors.firstName} />

            <Text style={styles.label}>Last name</Text>
            <View style={[styles.inputRow, errorBorder(!!errors.lastName)]}>
              <Ionicons
                name="person-outline"
                size={20}
                color={errors.lastName ? lightColors.error : lightColors.textMuted}
                style={styles.inputIcon}
              />
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
                autoCorrect={false}
              />
            </View>
            <FieldError message={errors.lastName} />

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
            <Text style={styles.hint}>
              We only share your number with your driver during a delivery.
            </Text>

            <TouchableOpacity
              style={[styles.primaryBtn, (!isFormValid || saving) && styles.primaryBtnDisabled]}
              onPress={handleSave}
              disabled={!isFormValid || saving}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>
                {saving ? 'Saving…' : 'Start shopping'}
              </Text>
              {!saving && (
                <Ionicons name="arrow-forward" size={18} color="#FFFFFF" style={{ marginLeft: 8 }} />
              )}
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
    paddingBottom: 32,
  },
  headingWrap: {
    paddingHorizontal: 28,
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 32,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: lightColors.textDark,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: lightColors.textMuted,
    textAlign: 'center',
    maxWidth: 300,
  },
  form: {
    paddingHorizontal: 28,
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightColors.inputBg,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: 14,
    height: 54,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: lightColors.textDark,
    fontSize: 15,
    fontWeight: '500',
  },
  hint: {
    fontSize: 12.5,
    lineHeight: 18,
    color: lightColors.textMuted,
    marginLeft: 2,
    marginTop: 2,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lightColors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 20,
    shadowColor: lightColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  primaryBtnDisabled: {
    backgroundColor: '#C8DDD2',
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});

export default CompleteProfileScreen;
