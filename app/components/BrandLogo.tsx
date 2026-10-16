// app/components/BrandLogo.tsx — the HalalBasket lockup: the real logo emblem
// plus the wordmark (white "Halal" + gold "Basket"). Always render the brand
// through this component so every screen shows the same mark.
//
// The wordmark only works on brand green, so on light screens the lockup sits
// on a green plaque rather than recolouring the letters.

import React from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { brand } from '../../constants/theme';

type Size = 'sm' | 'md' | 'lg';

type Props = {
  /** 'plaque' for light screens (green block behind the lockup); 'onDark' when
   *  the screen is already brand green. */
  variant?: 'plaque' | 'onDark';
  size?: Size;
  /** Emblem only, no wordmark — for compact headers and auth screens. */
  markOnly?: boolean;
  style?: StyleProp<ViewStyle>;
};

const SIZES: Record<Size, { mark: number; font: number; pad: number; radius: number; gap: number }> = {
  sm: { mark: 26, font: 18, pad: 8, radius: 12, gap: 8 },
  md: { mark: 34, font: 24, pad: 10, radius: 16, gap: 10 },
  lg: { mark: 46, font: 32, pad: 14, radius: 20, gap: 12 },
};

const BrandLogo = ({ variant = 'plaque', size = 'md', markOnly = false, style }: Props) => {
  const s = SIZES[size];
  const onPlaque = variant === 'plaque';

  return (
    <View
      style={[
        styles.row,
        { gap: markOnly ? 0 : s.gap },
        onPlaque && {
          backgroundColor: brand.green,
          borderRadius: s.radius,
          paddingHorizontal: markOnly ? s.pad : s.pad + 4,
          paddingVertical: s.pad,
          ...styles.plaqueShadow,
        },
        style,
      ]}
    >
      <Image
        source={require('../../assets/logo-mark.png')}
        style={{ width: s.mark, height: s.mark }}
        resizeMode="contain"
        accessibilityRole="image"
        accessibilityLabel="HalalBasket"
      />

      {!markOnly && (
        <Text style={[styles.word, { fontSize: s.font, color: brand.ink }]}>
          Halal<Text style={{ color: brand.gold }}>Basket</Text>
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  plaqueShadow: {
    shadowColor: brand.green,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  word: {
    fontWeight: '800',
    letterSpacing: -0.5,
  },
});

export default BrandLogo;
