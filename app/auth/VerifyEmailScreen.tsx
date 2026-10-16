// app/auth/VerifyEmailScreen.tsx — 6-digit email OTP entry. Verifies the code,
// activates the Clerk session, then moves to CompleteProfile. Resend has a 60s
// cooldown.

import React, { useEffect, useRef, useState } from 'react';
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
import { useSignUp } from '@clerk/clerk-expo';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/types';
import { lightColors } from '../../constants/theme';
import { fonts } from '../../constants/typography';
import LoadingDots from '../components/ui/LoadingDots';
import { FieldError, errorBorder, useInlineErrors } from '../components/ui/FieldError';
import { notify } from '../lib/notify';
import { BackButton, BrandWordmark, discoveryImages } from '../components/ui/Discovery';
import type { TextInputInstance } from 'react-native';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_S = 60;

type Props = NativeStackScreenProps<AuthStackParamList, 'VerifyEmail'>;

const VerifyEmailScreen = ({ navigation, route }: Props) => {
  const { signUp, setActive, isLoaded } = useSignUp();
  const { email } = route.params;

  const [otp, setOtp] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const inputRefs = useRef<Array<TextInputInstance | null>>([]);
  const { errors, setErrors, clearError } = useInlineErrors<'code'>();

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleOtpChange = (text: string, index: number) => {
    clearError('code');
    const digits = text.replace(/\D/g, '');

    // Paste of the full code into any box.
    if (digits.length > 1) {
      const next = Array(CODE_LENGTH).fill('');
      digits
        .slice(0, CODE_LENGTH)
        .split('')
        .forEach((d, i) => {
          next[i] = d;
        });
      setOtp(next);
      inputRefs.current[Math.min(digits.length, CODE_LENGTH) - 1]?.focus();
      return;
    }

    const next = [...otp];
    next[index] = digits;
    setOtp(next);
    if (digits && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e: { nativeEvent: { key: string } }, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    if (!isLoaded || !signUp) return;
    const code = otp.join('');
    if (code.length !== CODE_LENGTH) {
      setErrors({ code: 'Enter the complete 6-digit code' });
      return;
    }

    setLoading(true);
    try {
      await signUp.attemptEmailAddressVerification({ code });
      await setActive({ session: signUp.createdSessionId });
      // Verified — the signup form behind this screen must not be reachable
      // via back, so reset onto CompleteProfile.
      navigation.reset({ index: 0, routes: [{ name: 'CompleteProfile' }] });
    } catch (err: any) {
      const firstError = err?.errors?.[0];
      if (firstError?.code === 'verification_expired') {
        setErrors({ code: 'That code has expired — request a new one below' });
      } else {
        setErrors({ code: 'That code is incorrect or expired' });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!isLoaded || !signUp || countdown > 0) return;
    setResendLoading(true);
    try {
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setCountdown(RESEND_COOLDOWN_S);
      notify.success('A new verification code is on its way to your email.', {
        title: 'Code sent',
      });
    } catch {
      notify.error('Failed to resend the code. Please try again.');
    } finally {
      setResendLoading(false);
    }
  };

  const codeComplete = otp.join('').length === CODE_LENGTH;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inner}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topBar}>
            <BackButton onPress={() => navigation.goBack()} />
            <BrandWordmark />
          </View>

          <View style={styles.content}>
            <Image
              source={discoveryImages.email}
              style={styles.illustration}
              resizeMode="contain"
            />

            <Text style={styles.title}>Check your inbox</Text>
            <Text style={styles.subtitle}>We've sent a 6-digit verification code to</Text>
            <Text style={styles.email}>{email}</Text>

            {/* OTP boxes */}
            <View style={styles.otpContainer}>
              {otp.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={(ref) => {
                    inputRefs.current[index] = ref;
                  }}
                  style={[
                    styles.otpInput,
                    digit !== '' && styles.otpInputFilled,
                    errorBorder(!!errors.code),
                  ]}
                  value={digit}
                  onChangeText={(text) => handleOtpChange(text, index)}
                  onKeyPress={(e) => handleKeyPress(e, index)}
                  keyboardType="number-pad"
                  accessibilityLabel={`Verification digit ${index + 1}`}
                  maxFontSizeMultiplier={1.4}
                  maxLength={index === 0 ? CODE_LENGTH : 1}
                  selectTextOnFocus
                  autoComplete={index === 0 ? 'one-time-code' : 'off'}
                  textContentType={index === 0 ? 'oneTimeCode' : 'none'}
                />
              ))}
            </View>
            <FieldError message={errors.code} />

            <TouchableOpacity
              style={[styles.primaryBtn, (!codeComplete || loading) && styles.primaryBtnDisabled]}
              onPress={handleVerify}
              disabled={!codeComplete || loading}
              accessibilityRole="button"
              accessibilityState={{ disabled: !codeComplete || loading, busy: loading }}
              activeOpacity={0.85}
            >
              {loading && <LoadingDots color="#FFFFFF" />}
              <Text style={styles.primaryBtnText}>{loading ? 'Verifying…' : 'Verify email'}</Text>
            </TouchableOpacity>

            <View style={styles.resendRow}>
              <Text style={styles.resendText}>Didn't receive the code?</Text>
              {countdown > 0 ? (
                <Text style={styles.countdownText}>Resend in {countdown}s</Text>
              ) : (
                <TouchableOpacity onPress={handleResend} disabled={resendLoading}>
                  <Text style={styles.resendLink}>
                    {resendLoading ? 'Sending…' : 'Resend code'}
                  </Text>
                </TouchableOpacity>
              )}
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
  inner: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    paddingHorizontal: 24,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  illustration: { width: '100%', maxWidth: 300, height: 265, marginBottom: 12 },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 48,
    paddingTop: 12,
  },
  title: {
    alignSelf: 'stretch',
    fontSize: 32,
    lineHeight: 40,
    fontFamily: fonts.extraBold,
    color: lightColors.textDark,
    letterSpacing: -0.4,
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: lightColors.textMuted,
    textAlign: 'center',
    marginBottom: 4,
  },
  email: {
    fontSize: 15,
    color: lightColors.primary,
    fontFamily: fonts.bold,
    textAlign: 'center',
    marginBottom: 32,
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
  },
  otpInput: {
    flex: 1,
    maxWidth: 52,
    height: 56,
    borderWidth: 1,
    borderColor: lightColors.divider,
    borderRadius: 10,
    backgroundColor: 'transparent',
    color: lightColors.textDark,
    fontSize: 24,
    fontFamily: fonts.bold,
    textAlign: 'center',
  },
  otpInputFilled: {
    borderColor: lightColors.primary,
  },
  primaryBtn: {
    gap: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lightColors.primary,
    borderRadius: 18,
    paddingVertical: 16,
    alignSelf: 'stretch',
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
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 24,
  },
  resendText: {
    color: lightColors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 15,
  },
  resendLink: {
    color: lightColors.primary,
    fontSize: 15,
    fontFamily: fonts.bold,
  },
  countdownText: {
    color: lightColors.textMuted,
    fontSize: 15,
    fontFamily: fonts.semibold,
  },
});

export default VerifyEmailScreen;
