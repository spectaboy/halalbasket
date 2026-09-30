// app/auth/SignInScreen.tsx — email + password sign-in via Clerk, with a
// self-contained forgot-password flow (emailed reset code) in a modal.

import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Image,
  Modal,
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
import { useSignIn } from '@clerk/clerk-expo';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/types';
import { lightColors } from '../../constants/theme';
import { fonts } from '../../constants/typography';
import LoadingDots from '../components/ui/LoadingDots';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { FieldError, errorBorder, useInlineErrors } from '../components/ui/FieldError';
import { notify } from '../lib/notify';
import { LinearGradient } from 'expo-linear-gradient';
import { BackButton, BrandWordmark, discoveryImages } from '../components/ui/Discovery';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignIn'>;

type Field = 'email' | 'password' | 'code' | 'newPassword';

const SignInScreen = ({ navigation }: Props) => {
  const reducedMotion = useReducedMotion();
  const { signIn, setActive, isLoaded } = useSignIn();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { errors, setErrors, clearError, clearAll } = useInlineErrors<Field>();

  // Shared email-code modal for password reset and new-device verification.
  const [resetVisible, setResetVisible] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetShowPassword, setResetShowPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [verificationEmailId, setVerificationEmailId] = useState<string | null>(null);
  const [resendCountdown, setResendCountdown] = useState(0);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setTimeout(() => setResendCountdown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCountdown]);

  const handleSignIn = async () => {
    if (!isLoaded || !signIn) return;
    const identifier = email.trim().toLowerCase();
    setLoading(true);
    try {
      const attempt = await signIn.create({ identifier, password });
      if (attempt.status === 'complete') {
        // RootNavigator flips to Main automatically once the session is active.
        await setActive({ session: attempt.createdSessionId });
      } else if (
        attempt.status === 'needs_second_factor' ||
        // The installed SDK types predate Clerk's new Device Trust status.
        String(attempt.status) === 'needs_client_trust'
      ) {
        const emailFactor = attempt.supportedSecondFactors?.find(
          (factor) => factor.strategy === 'email_code',
        );
        if (!emailFactor || emailFactor.strategy !== 'email_code') {
          notify.error(
            'This account requires a verification method this app does not yet support.',
            {
              title: 'Verification required',
            },
          );
          return;
        }
        setVerificationEmailId(emailFactor.emailAddressId);
        setResetCode('');
        setResetNewPassword('');
        clearAll();
        setResetVisible(true);
        setResetLoading(true);
        try {
          await attempt.prepareSecondFactor({
            strategy: 'email_code',
            emailAddressId: emailFactor.emailAddressId,
          });
          setResendCountdown(60);
        } catch (err: any) {
          setErrors({
            code:
              err?.errors?.[0]?.longMessage ||
              'Unable to send a code. Tap Resend code to try again.',
          });
        } finally {
          setResetLoading(false);
        }
      } else {
        notify.info(`Sign-in status: ${attempt.status}`, { title: 'Almost there' });
      }
    } catch (err: any) {
      const firstError = err?.errors?.[0];
      if (
        firstError?.code === 'session_exists' ||
        firstError?.message?.includes('already signed in')
      ) {
        // Session already active — RootNavigator will show Main on next render.
        notify.info("You're already signed in.", { title: 'Welcome back' });
      } else if (firstError?.code === 'form_password_incorrect') {
        setErrors({ password: 'Incorrect password. Try again or reset it below.' });
      } else if (firstError?.code === 'form_identifier_not_found') {
        setErrors({ email: "We couldn't find an account with this email." });
      } else {
        notify.error(
          firstError?.longMessage || firstError?.message || 'An unexpected error occurred.',
          { title: 'Sign in failed' },
        );
      }
    } finally {
      setLoading(false);
    }
  };

  // Open the reset modal and immediately email a reset code.
  const handleForgotPassword = async () => {
    if (!isLoaded || !signIn) return;
    const identifier = email.trim().toLowerCase();
    if (!identifier || !identifier.includes('@')) {
      setErrors({ email: 'Enter your email address first, then tap "Forgot password?"' });
      return;
    }
    setResetLoading(true);
    try {
      await signIn.create({ strategy: 'reset_password_email_code', identifier });
      setVerificationEmailId(null);
      setResendCountdown(60);
      setResetCode('');
      setResetNewPassword('');
      setResetVisible(true);
    } catch (err: any) {
      const firstError = err?.errors?.[0];
      notify.error(
        firstError?.longMessage || firstError?.message || 'An unexpected error occurred.',
        { title: 'Unable to send code' },
      );
    } finally {
      setResetLoading(false);
    }
  };

  const handleResendResetCode = async () => {
    if (!isLoaded || !signIn || resetLoading || resendCountdown > 0) return;
    setResetLoading(true);
    try {
      if (verificationEmailId) {
        await signIn.prepareSecondFactor({
          strategy: 'email_code',
          emailAddressId: verificationEmailId,
        });
      } else {
        await signIn.create({
          strategy: 'reset_password_email_code',
          identifier: email.trim().toLowerCase(),
        });
      }
      setResendCountdown(60);
      clearError('code');
      notify.success('A new code has been sent to your email.', { title: 'Code sent' });
    } catch (err: any) {
      const firstError = err?.errors?.[0];
      notify.error(
        firstError?.longMessage || firstError?.message || 'An unexpected error occurred.',
        { title: 'Unable to send code' },
      );
    } finally {
      setResetLoading(false);
    }
  };

  // Only activate a session after Clerk reports completed verification.
  const handleSubmitNewPassword = async () => {
    if (!isLoaded || !signIn) return;
    const fieldErrors: Partial<Record<Field, string>> = {};
    if (resetCode.trim().length !== 6) fieldErrors.code = 'Enter the complete 6-digit code';
    if (!verificationEmailId && resetNewPassword.length < 15) {
      fieldErrors.newPassword = 'Your new password must be at least 15 characters';
    }
    if (fieldErrors.code || fieldErrors.newPassword) {
      setErrors(fieldErrors);
      return;
    }

    setResetLoading(true);
    try {
      const result = verificationEmailId
        ? await signIn.attemptSecondFactor({ strategy: 'email_code', code: resetCode.trim() })
        : await signIn.attemptFirstFactor({
            strategy: 'reset_password_email_code',
            code: resetCode.trim(),
            password: resetNewPassword,
          });
      if (result.status === 'complete') {
        setResetVisible(false);
        setResetCode('');
        setResetNewPassword('');
        setVerificationEmailId(null);
        await setActive({ session: result.createdSessionId });
      } else {
        notify.info('Additional verification is required to finish signing in.', {
          title: 'Almost there',
        });
      }
    } catch (err: any) {
      const firstError = err?.errors?.[0];
      if (
        firstError?.code === 'form_code_incorrect' ||
        firstError?.code === 'verification_expired'
      ) {
        setErrors({ code: 'That code is incorrect or expired' });
      } else {
        notify.error(
          firstError?.longMessage || firstError?.message || 'An unexpected error occurred.',
          { title: verificationEmailId ? 'Verification failed' : 'Reset failed' },
        );
      }
    } finally {
      setResetLoading(false);
    }
  };

  const closeResetModal = () => {
    if (resetLoading) return;
    setResetVisible(false);
    setResetCode('');
    setResetNewPassword('');
    setVerificationEmailId(null);
    setResendCountdown(0);
    clearAll();
  };

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
          <View style={styles.hero}>
            <Image
              source={discoveryImages.restaurant}
              style={[StyleSheet.absoluteFillObject, { width: '100%', height: '100%' }]}
              resizeMode="cover"
            />
            <LinearGradient
              colors={['rgba(251,248,241,0.25)', 'transparent', lightColors.background]}
              locations={[0, 0.72, 1]}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.heroHeader}>
              <BackButton onPress={() => navigation.goBack()} />
              <View style={styles.wordmarkSurface}>
                <BrandWordmark />
              </View>
            </View>
          </View>

          {/* Heading */}
          <View style={styles.headingWrap}>
            <Text style={styles.title}>Good food.{'\n'}Welcome back.</Text>
            <Text style={styles.subtitle}>Your local halal favourites, all in one place.</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <View style={[styles.inputRow, errorBorder(!!errors.email)]}>
              <Ionicons
                name="mail-outline"
                size={20}
                color={errors.email ? lightColors.error : lightColors.textMuted}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                accessibilityLabel="Email"
                autoComplete="email"
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
            </View>
            <FieldError message={errors.email} />

            <Text style={styles.label}>Password</Text>
            <View style={[styles.inputRow, errorBorder(!!errors.password)]}>
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={errors.password ? lightColors.error : lightColors.textMuted}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                accessibilityLabel="Password"
                autoComplete="current-password"
                placeholderTextColor={lightColors.textMuted}
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  clearError('password');
                }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                onPress={() => setShowPassword((v) => !v)}
                style={styles.eyeBtn}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={lightColors.textMuted}
                />
              </TouchableOpacity>
            </View>
            <FieldError message={errors.password} />

            <TouchableOpacity
              style={styles.forgotButton}
              onPress={handleForgotPassword}
              disabled={resetLoading}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.primaryBtn,
                (!email || !password || loading) && styles.primaryBtnDisabled,
              ]}
              onPress={handleSignIn}
              disabled={!email || !password || loading}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ disabled: !email || !password || loading, busy: loading }}
            >
              {loading && <LoadingDots color="#FFFFFF" />}
              <Text style={styles.primaryBtnText}>{loading ? 'Signing in…' : 'Sign in'}</Text>
            </TouchableOpacity>

            <View style={styles.signUpRow}>
              <Text style={styles.signUpText}>Don't have an account?</Text>
              <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
                <Text style={styles.signUpLink}>Create account</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Email verification for Device Trust or password reset. */}
      <Modal
        visible={resetVisible}
        transparent
        animationType={reducedMotion ? 'none' : 'fade'}
        statusBarTranslucent
        onRequestClose={closeResetModal}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalKav}
          >
            <View style={styles.modalCard}>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={closeResetModal}
                disabled={resetLoading}
              >
                <Ionicons name="close" size={22} color={lightColors.textMuted} />
              </TouchableOpacity>

              <Text style={styles.modalTitle}>
                {verificationEmailId ? 'Verify your sign-in' : 'Reset password'}
              </Text>
              <Text style={styles.modalSubtitle}>
                Enter the 6-digit code we sent to{'\n'}
                <Text style={styles.modalEmail}>{email.trim().toLowerCase()}</Text>
              </Text>

              <View style={[styles.inputRow, errorBorder(!!errors.code)]}>
                <Ionicons
                  name="keypad-outline"
                  size={20}
                  color={errors.code ? lightColors.error : lightColors.textMuted}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="6-digit code"
                  placeholderTextColor={lightColors.textMuted}
                  value={resetCode}
                  keyboardType="number-pad"
                  maxLength={6}
                  onChangeText={(t) => {
                    setResetCode(t);
                    clearError('code');
                  }}
                />
              </View>
              <FieldError message={errors.code} />

              {!verificationEmailId && (
                <>
                  <View style={[styles.inputRow, errorBorder(!!errors.newPassword)]}>
                    <Ionicons
                      name="lock-closed-outline"
                      size={20}
                      color={errors.newPassword ? lightColors.error : lightColors.textMuted}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="New password (15+ characters)"
                      placeholderTextColor={lightColors.textMuted}
                      value={resetNewPassword}
                      secureTextEntry={!resetShowPassword}
                      autoCapitalize="none"
                      onChangeText={(t) => {
                        setResetNewPassword(t);
                        clearError('newPassword');
                      }}
                    />
                    <TouchableOpacity
                      onPress={() => setResetShowPassword((v) => !v)}
                      style={styles.eyeBtn}
                    >
                      <Ionicons
                        name={resetShowPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={20}
                        color={lightColors.textMuted}
                      />
                    </TouchableOpacity>
                  </View>
                  <FieldError message={errors.newPassword} />
                </>
              )}

              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  resetLoading && styles.primaryBtnDisabled,
                  { marginTop: 12 },
                ]}
                onPress={handleSubmitNewPassword}
                disabled={resetLoading}
                activeOpacity={0.85}
              >
                {resetLoading ? (
                  <LoadingDots color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    {verificationEmailId ? 'Verify and sign in' : 'Reset password'}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleResendResetCode}
                disabled={resetLoading || resendCountdown > 0}
                style={styles.resendBtn}
              >
                <Text style={styles.forgotText}>
                  {resendCountdown > 0 ? `Resend in ${resendCountdown}s` : 'Resend code'}
                </Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
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
    paddingBottom: 24,
  },
  hero: { width: '100%', height: 280, overflow: 'hidden' },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
  },
  wordmarkSurface: { backgroundColor: 'rgba(251,248,241,0.92)', padding: 9, borderRadius: 20 },
  label: { color: lightColors.textDark, fontFamily: fonts.semibold, fontSize: 14, marginTop: 6 },
  forgotButton: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center' },
  headingWrap: {
    paddingHorizontal: 24,
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  title: {
    alignSelf: 'stretch',
    textAlign: 'left',
    fontSize: 34,
    lineHeight: 41,
    fontFamily: fonts.extraBold,
    color: lightColors.textDark,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 22,
    color: lightColors.textMuted,
  },
  form: {
    paddingHorizontal: 24,
    gap: 8,
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
  eyeBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  forgotText: {
    color: lightColors.primary,
    fontSize: 14,
    fontFamily: fonts.semibold,
    marginTop: 4,
  },
  primaryBtn: {
    flexDirection: 'row',
    gap: 10,
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
  signUpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 16,
  },
  signUpText: {
    color: lightColors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 15,
  },
  signUpLink: {
    color: lightColors.primary,
    fontSize: 15,
    fontFamily: fonts.bold,
  },

  /* Reset modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalKav: {
    width: '100%',
  },
  modalCard: {
    backgroundColor: lightColors.surface,
    borderRadius: 20,
    padding: 24,
    gap: 12,
  },
  modalClose: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  modalTitle: {
    fontSize: 22,
    fontFamily: fonts.extraBold,
    color: lightColors.textDark,
    marginTop: 4,
  },
  modalSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: lightColors.textMuted,
    lineHeight: 20,
    marginBottom: 4,
  },
  modalEmail: {
    color: lightColors.primary,
    fontFamily: fonts.semibold,
  },
  resendBtn: {
    alignItems: 'center',
    marginTop: 4,
  },
});

export default SignInScreen;
