// app/auth/WelcomeScreen.tsx — brand landing. First thing a signed-out user
// sees: wordmark, tagline, the three marketplace categories, then Get started /
// Sign in.

import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/types';
import { lightColors } from '../../constants/theme';
import BackgroundPattern from '../components/BackgroundPattern';

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;

const CATEGORIES: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  blurb: string;
}[] = [
  {
    icon: 'restaurant-outline',
    title: 'Restaurants',
    blurb: 'Hot halal meals from local kitchens, delivered fast.',
  },
  {
    icon: 'storefront-outline',
    title: 'Butchers & farms',
    blurb: 'Fresh zabiha meat and farm goods you can trust.',
  },
  {
    icon: 'home-outline',
    title: 'Home cooks',
    blurb: 'Pre-order authentic home-made dishes from your community.',
  },
];

const WelcomeScreen = ({ navigation }: Props) => {
  return (
    <SafeAreaView style={styles.container}>
      <BackgroundPattern />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Wordmark */}
        <View style={styles.brandRow}>
          <View style={styles.brandIcon}>
            <Ionicons name="basket" size={26} color="#FFFFFF" />
          </View>
          <Text style={styles.brandText}>
            Halal<Text style={styles.brandTextAccent}>Basket</Text>
          </Text>
        </View>

        {/* Tagline */}
        <Text style={styles.headline}>Everything halal,{'\n'}delivered.</Text>
        <Text style={styles.subline}>
          One basket for every halal craving — restaurants, butchers, farms and
          home cooks near you.
        </Text>

        {/* Category value props */}
        <View style={styles.cards}>
          {CATEGORIES.map((c) => (
            <View key={c.title} style={styles.card}>
              <View style={styles.cardIconCircle}>
                <Ionicons name={c.icon} size={24} color={lightColors.primary} />
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{c.title}</Text>
                <Text style={styles.cardBlurb}>{c.blurb}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Bottom actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => navigation.navigate('SignUp')}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryBtnText}>Get started</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => navigation.navigate('SignIn')}
          activeOpacity={0.7}
        >
          <Text style={styles.secondaryBtnText}>
            Already have an account? <Text style={styles.secondaryBtnBold}>Sign in</Text>
          </Text>
        </TouchableOpacity>
      </View>
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
    paddingHorizontal: 28,
    paddingTop: 32,
  },

  /* Brand */
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 36,
  },
  brandIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: lightColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: lightColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  brandText: {
    fontSize: 26,
    fontWeight: '800',
    color: lightColors.textDark,
    letterSpacing: -0.5,
  },
  brandTextAccent: {
    color: lightColors.primary,
  },

  /* Headline */
  headline: {
    fontSize: 36,
    lineHeight: 42,
    fontWeight: '800',
    color: lightColors.textDark,
    letterSpacing: -0.6,
    marginBottom: 12,
  },
  subline: {
    fontSize: 16,
    lineHeight: 23,
    color: lightColors.textMuted,
    marginBottom: 32,
    maxWidth: 320,
  },

  /* Category cards */
  cards: {
    gap: 14,
    marginBottom: 24,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    padding: 16,
    gap: 14,
    shadowColor: lightColors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: lightColors.textDark,
    marginBottom: 3,
  },
  cardBlurb: {
    fontSize: 13.5,
    lineHeight: 19,
    color: lightColors.textMuted,
  },

  /* Actions */
  actions: {
    paddingHorizontal: 28,
    paddingTop: 8,
    paddingBottom: 16,
  },
  primaryBtn: {
    backgroundColor: lightColors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: lightColors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
    marginBottom: 12,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  secondaryBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: lightColors.textMuted,
    fontSize: 15,
  },
  secondaryBtnBold: {
    color: lightColors.primary,
    fontWeight: '700',
  },
});

export default WelcomeScreen;
