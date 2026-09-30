// app/auth/SignUpScreen.tsx — email + password account creation via Clerk.
// signUp.create -> prepareEmailAddressVerification('email_code') -> VerifyEmail.

import React, { useRef, useState } from 'react';
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
import { useSignUp } from '@clerk/clerk-expo';
import * as WebBrowser from 'expo-web-browser';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/types';
import { lightColors } from '../../constants/theme';
import { fonts } from '../../constants/typography';
import LoadingDots from '../components/ui/LoadingDots';
import OnboardingPhoto from '../components/ui/OnboardingPhoto';
import { FieldError, errorBorder, useInlineErrors } from '../components/ui/FieldError';
import { notify } from '../lib/notify';

const TERMS_URL = 'https://halalbasket.app/terms';
const PRIVACY_URL = 'https://halalbasket.app/privacy';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 15;
const normalizeEmail = (raw: string) => raw.trim().toLowerCase();

type Props = NativeStackScreenProps<AuthStackParamList, 'SignUp'>;

type Field = 'email' | 'password' | 'confirm' | 'terms';

const SignUpScreen = ({ navigation }: Props) => {
  const { signUp, isLoaded } = useSignUp();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);
  const { errors, setErrors, clearError } = useInlineErrors<Field>();

  const emailValid = EMAIL_RE.test(normalizeEmail(email));

  const validate = (): boolean => {
    const next: Partial<Record<Field, string>> = {};
    if (!emailValid) next.email = 'Enter a valid email address';
    if (password.length < MIN_PASSWORD_LENGTH) next.password = 'Password must be at least 15 characters';
    if (confirmPassword !== password) next.confirm = 'Passwords do not match';
    if (!agreedToTerms) next.terms = 'You must accept the terms to continue';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSignUp = async () => {
    if (!isLoaded || !signUp || submitting.current) return;
    if (!validate()) return;

    const normalizedEmail = normalizeEmail(email);
    submitting.current = true;
    setLoading(true);
    try {
      await signUp.create({ emailAddress: normalizedEmail, password });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      navigation.navigate('VerifyEmail', { email: normalizedEmail });
    } catch (err: any) {
      const firstError = err?.errors?.[0];
      if (firstError?.code === 'form_identifier_exists') {
        setErrors({ email: 'An account with this email already exists. Try signing in.' });
      } else if (firstError?.code === 'form_password_pwned') {
        setErrors({ password: 'This password has appeared in a data breach — choose another.' });
      } else if (firstError?.meta?.paramName === 'password') {
        setErrors({ password: firstError.longMessage || firstError.message });
      } else {
        notify.error(
          firstError?.longMessage || firstError?.message || 'Failed to create account. Please try again.',
          { title: 'Sign up failed' }
        );
      }
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  const submitDisabled = !isLoaded || !signUp || loading;
  const missingPasswordCharacters = Math.max(0, MIN_PASSWORD_LENGTH - password.length);

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
          {/* Back */}
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={22} color={lightColors.primary} />
          </TouchableOpacity>

          <View style={styles.photo}>
            <OnboardingPhoto source={require('../../assets/onboarding/home-cooking.png')} height={170} label="A home cook preparing a meal with fresh herbs" />
          </View>

          {/* Heading */}
          <View style={styles.headingWrap}>
            <Text style={styles.title}>Make yourself at home.</Text>
            <Text style={styles.subtitle}>
              Create your account. Good food starts here.
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <View style={[styles.inputRow, errorBorder(!!errors.email)]}>
              <Ionicons
                name="mail-outline"
                size={20}
                color={errors.email ? lightColors.error : lightColors.textMuted}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Email address"
                placeholderTextColor={lightColors.textMuted}
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  clearError('email');
                }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
              />
              {emailValid && (
                <Ionicons name="checkmark-circle" size={20} color={lightColors.primary} />
              )}
            </View>
            <FieldError message={errors.email} />

            <View style={[styles.inputRow, errorBorder(!!errors.password)]}>
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={errors.password ? lightColors.error : lightColors.textMuted}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Password (15+ characters)"
                placeholderTextColor={lightColors.textMuted}
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  clearError('password');
                }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={lightColors.textMuted}
                />
              </TouchableOpacity>
            </View>
            <FieldError message={errors.password} />
            {!errors.password && (
              <Text style={styles.fieldHint} accessibilityLiveRegion="polite">
                {!password.length
                  ? 'Use at least 15 characters.'
                  : missingPasswordCharacters > 0
                    ? `Add ${missingPasswordCharacters} more character${missingPasswordCharacters === 1 ? '' : 's'} (15 minimum).`
                    : '15-character minimum met.'}
              </Text>
            )}

            <View style={[styles.inputRow, errorBorder(!!errors.confirm)]}>
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={errors.confirm ? lightColors.error : lightColors.textMuted}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Confirm password"
                placeholderTextColor={lightColors.textMuted}
                value={confirmPassword}
                onChangeText={(t) => {
                  setConfirmPassword(t);
                  clearError('confirm');
                }}
                secureTextEntry={!showConfirm}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowConfirm((v) => !v)} style={styles.eyeBtn}>
                <Ionicons
                  name={showConfirm ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={lightColors.textMuted}
                />
              </TouchableOpacity>
            </View>
            <FieldError message={errors.confirm} />

            {/* Terms consent */}
            <TouchableOpacity
              style={styles.termsRow}
              activeOpacity={0.7}
              onPress={() => {
                setAgreedToTerms((v) => !v);
                clearError('terms');
              }}
            >
              <Ionicons
                name={agreedToTerms ? 'checkbox' : 'square-outline'}
                size={22}
                color={agreedToTerms ? lightColors.primary : lightColors.textMuted}
              />
              <Text style={styles.termsText}>
                I agree to HalalBasket's{' '}
                <Text
                  style={styles.termsLink}
                  onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)}
                >
                  Terms of Service
                </Text>{' '}
                and{' '}
                <Text
                  style={styles.termsLink}
                  onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)}
                >
                  Privacy Policy
                </Text>
                .
              </Text>
            </TouchableOpacity>
            <FieldError message={errors.terms} />

            <TouchableOpacity
              style={[styles.primaryBtn, submitDisabled && styles.primaryBtnDisabled]}
              onPress={handleSignUp}
              disabled={submitDisabled}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ disabled: submitDisabled, busy: loading || !isLoaded }}
            >
              {loading && <LoadingDots color="#FFFFFF" />}
              <Text style={styles.primaryBtnText}>
                {loading ? 'Creating account…' : !isLoaded ? 'Connecting…' : 'Create account'}
              </Text>
              {!loading && (
                <Ionicons name="arrow-forward" size={18} color="#FFFFFF" style={{ marginLeft: 8 }} />
              )}
            </TouchableOpacity>

            <View style={styles.signInRow}>
              <Text style={styles.signInText}>Already have an account?</Text>
              <TouchableOpacity onPress={() => navigation.navigate('SignIn')}>
                <Text style={styles.signInLink}>Sign in</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  fieldHint: {
    color: lightColors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 2,
    marginTop: 6,
  },
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
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 20,
    backgroundColor: lightColors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    marginLeft: 24,
  },
  headingWrap: {
    paddingHorizontal: 28,
    marginTop: 22,
    marginBottom: 28,
  },
  title: {
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
    maxWidth: 300,
  },
  form: {
    paddingHorizontal: 28,
    gap: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightColors.inputBg,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: lightColors.divider,
    paddingHorizontal: 14,
    minHeight: 60,
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
  eyeBtn: {
    padding: 6,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 8,
    paddingHorizontal: 2,
  },
  termsText: {
    flex: 1,
    color: lightColors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
  },
  termsLink: {
    color: lightColors.primary,
    fontFamily: fonts.bold,
  },
  primaryBtn: {
    gap: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lightColors.primary,
    borderRadius: 18,
    paddingVertical: 16,
    marginTop: 12,
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
  signInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 16,
  },
  signInText: {
    color: lightColors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 15,
  },
  signInLink: {
    color: lightColors.primary,
    fontSize: 15,
    fontFamily: fonts.bold,
  },
  photo: { marginHorizontal: 24, marginTop: 22 },
});

export default SignUpScreen;
