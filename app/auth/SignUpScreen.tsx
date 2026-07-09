// app/auth/SignUpScreen.tsx — email + password account creation via Clerk.
// signUp.create -> prepareEmailAddressVerification('email_code') -> VerifyEmail.

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
import { useSignUp } from '@clerk/clerk-expo';
import * as WebBrowser from 'expo-web-browser';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/types';
import { lightColors } from '../../constants/theme';
import BackgroundPattern from '../components/BackgroundPattern';
import { FieldError, errorBorder, useInlineErrors } from '../components/ui/FieldError';
import { notify } from '../lib/notify';

const TERMS_URL = 'https://halalbasket.app/terms';
const PRIVACY_URL = 'https://halalbasket.app/privacy';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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
  const { errors, setErrors, clearError } = useInlineErrors<Field>();

  const emailValid = EMAIL_RE.test(normalizeEmail(email));

  const validate = (): boolean => {
    const next: Partial<Record<Field, string>> = {};
    if (!emailValid) next.email = 'Enter a valid email address';
    if (password.length < 8) next.password = 'Password must be at least 8 characters';
    if (confirmPassword !== password) next.confirm = 'Passwords do not match';
    if (!agreedToTerms) next.terms = 'You must accept the terms to continue';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSignUp = async () => {
    if (!isLoaded || !signUp) return;
    if (!validate()) return;

    const normalizedEmail = normalizeEmail(email);
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
      setLoading(false);
    }
  };

  const isFormValid =
    emailValid && password.length >= 8 && confirmPassword === password && agreedToTerms;

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
          {/* Back */}
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={lightColors.primary} />
          </TouchableOpacity>

          {/* Heading */}
          <View style={styles.headingWrap}>
            <Text style={styles.title}>Create your account</Text>
            <Text style={styles.subtitle}>
              Sign up to start filling your basket with everything halal.
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
                placeholder="Password (8+ characters)"
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
              style={[styles.primaryBtn, (!isFormValid || loading) && styles.primaryBtnDisabled]}
              onPress={handleSignUp}
              disabled={!isFormValid || loading}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>
                {loading ? 'Creating account…' : 'Create account'}
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
  container: {
    flex: 1,
    backgroundColor: lightColors.background,
    overflow: 'hidden',
  },
  scroll: {
    flexGrow: 1,
    paddingBottom: 32,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: lightColors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    marginLeft: 24,
  },
  headingWrap: {
    paddingHorizontal: 28,
    marginTop: 28,
    marginBottom: 28,
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
    fontSize: 13,
    lineHeight: 19,
  },
  termsLink: {
    color: lightColors.primary,
    fontWeight: '700',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lightColors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 12,
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
  signInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
  },
  signInText: {
    color: lightColors.textMuted,
    fontSize: 15,
  },
  signInLink: {
    color: lightColors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
});

export default SignUpScreen;
