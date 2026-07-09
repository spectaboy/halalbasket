// HalalBasket — order confirmation. Animated success check, short order code,
// and hand-off to live tracking.

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { lightColors, spacing } from '../../constants/theme';
import type { MainStackParamList } from '../navigation/types';
import BackgroundPattern from '../components/BackgroundPattern';

type Props = NativeStackScreenProps<MainStackParamList, 'OrderConfirmation'>;

export default function OrderConfirmationScreen({ navigation, route }: Props) {
  const { orderId } = route.params;
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 350,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, [scaleAnim, fadeAnim]);

  const shortCode = orderId.replace(/-/g, '').slice(0, 8).toUpperCase();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <BackgroundPattern />
      <View style={styles.content}>
        <Animated.View style={[styles.checkWrap, { transform: [{ scale: scaleAnim }] }]}>
          <Ionicons name="checkmark-circle" size={128} color={lightColors.primary} />
        </Animated.View>

        <Animated.View style={[styles.textBlock, { opacity: fadeAnim }]}>
          <Text style={styles.title}>Order placed!</Text>
          <Text style={styles.subtitle}>
            Your halal order is confirmed and the seller has been notified.
          </Text>
          <View style={styles.codeChip}>
            <Text style={styles.codeLabel}>ORDER</Text>
            <Text style={styles.codeValue}>#{shortCode}</Text>
          </View>
        </Animated.View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.primaryBtn}
          activeOpacity={0.9}
          onPress={() => navigation.replace('OrderTracking', { orderId })}
        >
          <Ionicons name="navigate" size={18} color="#fff" />
          <Text style={styles.primaryBtnText}>Track order</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryBtn}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('CustomerTabs', { screen: 'Home' })}
        >
          <Text style={styles.secondaryBtnText}>Back home</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.background,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: 20,
  },
  checkWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: lightColors.textDark,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14.5,
    color: lightColors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 280,
  },
  codeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: lightColors.chipBg,
    borderRadius: 9999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginTop: 6,
  },
  codeLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: lightColors.textMuted,
    letterSpacing: 1,
  },
  codeValue: {
    fontSize: 16,
    fontWeight: '800',
    color: lightColors.primary,
    letterSpacing: 0.5,
  },
  actions: {
    padding: spacing.md,
    gap: 10,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: lightColors.primary,
    borderRadius: 12,
    paddingVertical: 16,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lightColors.inputBg,
    borderRadius: 12,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
  },
  secondaryBtnText: {
    color: lightColors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
});
