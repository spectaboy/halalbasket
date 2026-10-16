import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, NativeScrollEvent, NativeSyntheticEvent, Pressable,
  ScrollView, StyleSheet, Text, useWindowDimensions, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/types';
import { lightColors } from '../../constants/theme';
import { fonts } from '../../constants/typography';
import OnboardingPhoto from '../components/ui/OnboardingPhoto';
import BrandLogo from '../components/BrandLogo';
import { useReducedMotion } from '../hooks/useReducedMotion';

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;

const slides = [
  {
    category: 'RESTAURANTS', icon: 'restaurant-outline' as const,
    title: 'Everything halal,', accent: 'delivered.',
    description: 'Meals from local restaurants, delivered to your door.',
    image: require('../../assets/onboarding/restaurant.png'),
    imageLabel: 'Chicken and saffron rice, hummus and fresh flatbread',
  },
  {
    category: 'BUTCHERS & FARMS', icon: 'storefront-outline' as const,
    title: 'Fresh finds.', accent: 'Full baskets.',
    description: 'Fresh halal cuts and farm goods for your everyday table.',
    image: require('../../assets/onboarding/butchers-and-farms.png'),
    imageLabel: 'Fresh beef and lamb cuts with vegetables and herbs',
  },
  {
    category: 'HOME COOKS', icon: 'home-outline' as const,
    title: 'Made with care.', accent: 'Shared with you.',
    description: 'Pre-order homemade dishes from cooks in your community.',
    image: require('../../assets/onboarding/home-cooking.png'),
    imageLabel: 'A home cook adding fresh herbs to a shared meal',
  },
];

export default function WelcomeScreen({ navigation }: Props) {
  const { width: windowWidth, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const width = Math.min(windowWidth, 520);
  const reducedMotion = useReducedMotion();
  const pager = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const pageRef = useRef(0);
  const availableHeight = height - insets.top - insets.bottom;
  const compact = availableHeight < 720;
  const photoHeight = compact
    ? Math.max(130, availableHeight * (fontScale > 1.15 ? 0.25 : 0.3))
    : Math.min(360, availableHeight * 0.41);
  const headlineSize = width < 370 ? 33 : width < 420 ? 38 : 42;

  // Preserve the selected slide when the window size changes.
  useEffect(() => {
    pager.current?.scrollTo({ x: pageRef.current * width, animated: false });
  }, [width]);

  const selectPage = (index: number) => {
    pageRef.current = index;
    setPage(index);
    pager.current?.scrollTo({ x: index * width, animated: !reducedMotion });
    AccessibilityInfo.announceForAccessibility(`${slides[index].category}. Page ${index + 1} of ${slides.length}.`);
  };
  const finishSwipe = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.max(0, Math.min(slides.length - 1, Math.round(event.nativeEvent.contentOffset.x / width)));
    if (index !== pageRef.current) {
      pageRef.current = index;
      setPage(index);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={[styles.layout, { width }]}>
        <View style={[styles.brand, compact && styles.compactBrand]}>
          <BrandLogo size={compact ? 'sm' : 'md'} />
        </View>

        <ScrollView ref={pager} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
          style={styles.pager} onMomentumScrollEnd={finishSwipe} bounces={false}
          scrollEventThrottle={16} directionalLockEnabled
        >
          {slides.map((slide, index) => (
            <ScrollView key={slide.category} style={{ width }} contentContainerStyle={styles.slide}
              showsVerticalScrollIndicator={compact || fontScale > 1.15} bounces={false} nestedScrollEnabled
              accessibilityElementsHidden={page !== index}
              importantForAccessibility={page === index ? 'auto' : 'no-hide-descendants'}
            >
              <View style={styles.photoWrap}>
                <OnboardingPhoto source={slide.image} height={photoHeight} label={slide.imageLabel} />
                <View style={styles.photoBadge} accessible={false}>
                  <Ionicons name={slide.icon} size={15} color={lightColors.primary} />
                  <Text style={styles.badgeText}>{slide.category}</Text>
                </View>
              </View>
              <View style={[styles.copy, compact && styles.compactCopy]}>
                <Text accessibilityRole="header" style={[styles.headline, { fontSize: headlineSize, lineHeight: headlineSize * 1.17 }]}>
                  {slide.title}{'\n'}<Text style={styles.headlineAccent}>{slide.accent}</Text>
                </Text>
                <Text style={[styles.description, compact && styles.compactDescription]}>{slide.description}</Text>
              </View>
            </ScrollView>
          ))}
        </ScrollView>

        <View style={styles.footer}>
          <View style={[styles.pagination, compact && styles.compactPagination]}>
            <View style={styles.dots}>
              {slides.map((slide, index) => (
                <Pressable key={slide.category} onPress={() => selectPage(index)} accessibilityRole="button"
                  accessibilityLabel={`Page ${index + 1} of 3: ${slide.category.toLowerCase()}`}
                  accessibilityState={{ selected: index === page }} style={styles.dotTarget}
                ><View style={[styles.dot, index === page && styles.activeDot]} /></Pressable>
              ))}
            </View>
            <Pressable onPress={() => selectPage((page + 1) % slides.length)} accessibilityRole="button"
              accessibilityLabel={page === slides.length - 1 ? 'Back to first introduction' : 'Next introduction'}
              style={({ pressed }) => [styles.next, pressed && styles.pressed]}
            >
              {fontScale < 1.5 && <Text style={styles.swipeHint}>{page === slides.length - 1 ? 'Explore again' : 'Swipe to explore'}</Text>}
              <View style={styles.nextIcon}><Ionicons name={page === slides.length - 1 ? 'refresh-outline' : 'arrow-forward'} size={19} color={lightColors.primary} /></View>
            </Pressable>
          </View>
          <Pressable onPress={() => navigation.navigate('SignUp')} accessibilityRole="button" accessibilityLabel="Get started"
            style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed]}
          >
            <Text style={styles.primaryLabel}>Get started</Text>
            <Ionicons name="arrow-forward" size={21} color="#fff" />
          </Pressable>
          <Pressable onPress={() => navigation.navigate('SignIn')} accessibilityRole="button" accessibilityLabel="Already have an account? Sign in"
            style={({ pressed }) => [styles.signIn, pressed && styles.pressed]}
          >
            <Text style={styles.signInText}>Already have an account? <Text style={styles.signInLink}>Sign in</Text></Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: lightColors.background, alignItems: 'center' },
  layout: { flex: 1 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 26, paddingTop: 12, paddingBottom: 22 },
  compactBrand: { paddingTop: 4, paddingBottom: 12 },
  pager: { flex: 1 },
  slide: { paddingBottom: 10 },
  photoWrap: { marginHorizontal: 18 },
  photoBadge: { position: 'absolute', bottom: 16, left: 16, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: lightColors.background, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, maxWidth: '90%' },
  badgeText: { flexShrink: 1, fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.15, color: lightColors.primary },
  copy: { paddingHorizontal: 26, paddingTop: 23 },
  compactCopy: { paddingTop: 15 },
  headline: { fontFamily: fonts.extraBold, color: lightColors.textDark, letterSpacing: -1.8 },
  headlineAccent: { color: lightColors.primary },
  description: { fontFamily: fonts.regular, fontSize: 15.5, lineHeight: 25, color: lightColors.textMuted, marginTop: 15 },
  compactDescription: { marginTop: 10, lineHeight: 23 },
  footer: { paddingHorizontal: 26, paddingBottom: 4, paddingTop: 4 },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  compactPagination: { marginBottom: 8 },
  dots: { flexDirection: 'row' },
  dotTarget: { width: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 4, backgroundColor: '#b9c4b8' },
  activeDot: { width: 26, backgroundColor: lightColors.primary },
  next: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9 },
  nextIcon: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: lightColors.divider, alignItems: 'center', justifyContent: 'center' },
  swipeHint: { fontFamily: fonts.medium, fontSize: 11, color: lightColors.textMuted },
  primaryButton: { minHeight: 60, borderRadius: 18, paddingHorizontal: 24, paddingVertical: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 14, backgroundColor: lightColors.primary },
  primaryLabel: { fontFamily: fonts.bold, fontSize: 17, color: '#fff' },
  primaryPressed: { backgroundColor: lightColors.primaryDark, transform: [{ scale: 0.985 }] },
  pressed: { opacity: 0.65 },
  signIn: { minHeight: 54, paddingVertical: 16, justifyContent: 'center', alignItems: 'center' },
  signInText: { fontFamily: fonts.regular, fontSize: 13, color: lightColors.textMuted, textAlign: 'center' },
  signInLink: { fontFamily: fonts.bold, color: lightColors.primary },
});
