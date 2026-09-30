import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { lightColors } from '../../../constants/theme';
import { fonts } from '../../../constants/typography';
import LoadingDots from './LoadingDots';

export default function BrandLoadingScreen({ fontsReady = true }: { fontsReady?: boolean }) {
  return (
    <View style={styles.screen} accessibilityLabel="Loading HalalBasket" accessibilityRole="progressbar" accessibilityState={{ busy: true }}>
      <View style={styles.mark}><Ionicons name="basket-outline" size={38} color={lightColors.primary} /></View>
      <Text style={[styles.name, fontsReady && { fontFamily: fonts.bold }]}>HalalBasket</Text>
      <LoadingDots />
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: lightColors.background, gap: 18 },
  mark: { width: 88, height: 88, borderRadius: 28, backgroundColor: lightColors.chipBg, alignItems: 'center', justifyContent: 'center' },
  name: { color: lightColors.textDark, fontSize: 24, letterSpacing: -0.8 },
});
