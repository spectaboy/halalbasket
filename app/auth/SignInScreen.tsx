// app/auth/SignInScreen.tsx — email + password sign-in via Clerk, with a
// self-contained forgot-password flow (emailed reset code) in a modal.

import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
import BackgroundPattern from '../components/BackgroundPattern';
import { FieldError, errorBorder, useInlineErrors } from '../components/ui/FieldError';
import { notify } from '../lib/notify';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignIn'>;

type Field = 'email' | 'password' | 'code' | 'newPassword';

const SignInScreen = ({ navigation }: Props) => {
  const { signIn, setActive, isLoaded } = useSignIn();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { errors, setErrors, clearError, clearAll } = useInlineErrors<Field>();

  // Forgot-password (reset via email code) — self-contained modal state.
  const [resetVisible, setResetVisible] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetShowPassword, setResetShowPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const handleSignIn = async () => {
    if (!isLoaded || !signIn) return;
    const identifier = email.trim().toLowerCase();
    setLoading(true);
    try {
      const attempt = await signIn.create({ identifier, password });
      if (attempt.status === 'complete') {
        // RootNavigator flips to Main automatically once the session is active.
        await setActive({ session: attempt.createdSessionId });
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
          { title: 'Sign in failed' }
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
      setResetCode('');
      setResetNewPassword('');
      setResetVisible(true);
    } catch (err: any) {
      const firstError = err?.errors?.[0];
      notify.error(
        firstError?.longMessage || firstError?.message || 'An unexpected error occurred.',
        { title: 'Unable to send code' }
      );
    } finally {
      setResetLoading(false);
    }
  };

  const handleResendResetCode = async () => {
    if (!isLoaded || !signIn) return;
    setResetLoading(true);
    try {
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: email.trim().toLowerCase(),
      });
      clearError('code');
      notify.success('A new reset code has been sent to your email.', { title: 'Code sent' });
    } catch (err: any) {
      const firstError = err?.errors?.[0];
      notify.error(
        firstError?.longMessage || firstError?.message || 'An unexpected error occurred.',
        { title: 'Unable to send code' }
      );
    } finally {
      setResetLoading(false);
    }
  };

  // Verify the 6-digit code + set the new password, then activate the session.
  const handleSubmitNewPassword = async () => {
    if (!isLoaded || !signIn) return;
    const fieldErrors: Partial<Record<Field, string>> = {};
    if (resetCode.trim().length !== 6) fieldErrors.code = 'Enter the complete 6-digit code';
    if (resetNewPassword.length < 8) {
      fieldErrors.newPassword = 'Your new password must be at least 8 characters';
    }
    if (fieldErrors.code || fieldErrors.newPassword) {
      setErrors(fieldErrors);
      return;
    }

    setResetLoading(true);
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: resetCode.trim(),
        password: resetNewPassword,
      });
      if (result.status === 'complete') {
        setResetVisible(false);
        setResetCode('');
        setResetNewPassword('');
        await setActive({ session: result.createdSessionId });
      } else {
        notify.info(`Reset status: ${result.status}`, { title: 'Almost there' });
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
          { title: 'Reset failed' }
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
    clearAll();
  };

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

          {/* Brand mark */}
          <View style={styles.brandWrap}>
            <View style={styles.brandIcon}>
              <Ionicons name="basket" size={30} color="#FFFFFF" />
            </View>
          </View>

          {/* Heading */}
          <View style={styles.headingWrap}>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in to your HalalBasket account</Text>
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
                placeholder="Email"
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

            <View style={[styles.inputRow, errorBorder(!!errors.password)]}>
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={errors.password ? lightColors.error : lightColors.textMuted}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Password"
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

            <TouchableOpacity onPress={handleForgotPassword} disabled={resetLoading}>
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
            >
              <Text style={styles.primaryBtnText}>{loading ? 'Signing in…' : 'Sign in'}</Text>
            </TouchableOpacity>

            <View style={styles.signUpRow}>
              <Text style={styles.signUpText}>New to HalalBasket?</Text>
              <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
                <Text style={styles.signUpLink}>Create an account</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Forgot password — reset via emailed code */}
      <Modal
        visible={resetVisible}
        transparent
        animationType="fade"
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

              <Text style={styles.modalTitle}>Reset password</Text>
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

              <View style={[styles.inputRow, errorBorder(!!errors.newPassword)]}>
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color={errors.newPassword ? lightColors.error : lightColors.textMuted}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="New password"
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

              <TouchableOpacity
                style={[styles.primaryBtn, resetLoading && styles.primaryBtnDisabled, { marginTop: 12 }]}
                onPress={handleSubmitNewPassword}
                disabled={resetLoading}
                activeOpacity={0.85}
              >
                {resetLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryBtnText}>Reset password</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleResendResetCode}
                disabled={resetLoading}
                style={styles.resendBtn}
              >
                <Text style={styles.forgotText}>Resend code</Text>
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
  brandWrap: {
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 20,
  },
  brandIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: lightColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: lightColors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  headingWrap: {
    paddingHorizontal: 28,
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: lightColors.textDark,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: lightColors.textMuted,
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
  forgotText: {
    color: lightColors.primary,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  primaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lightColors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 8,
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
  signUpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
  },
  signUpText: {
    color: lightColors.textMuted,
    fontSize: 15,
  },
  signUpLink: {
    color: lightColors.primary,
    fontSize: 15,
    fontWeight: '700',
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
    fontWeight: '800',
    color: lightColors.textDark,
    marginTop: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: lightColors.textMuted,
    lineHeight: 20,
    marginBottom: 4,
  },
  modalEmail: {
    color: lightColors.primary,
    fontWeight: '600',
  },
  resendBtn: {
    alignItems: 'center',
    marginTop: 4,
  },
});

export default SignInScreen;
