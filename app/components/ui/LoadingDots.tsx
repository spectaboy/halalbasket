import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { lightColors } from '../../../constants/theme';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export default function LoadingDots({ color = lightColors.primary }: { color?: string }) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reducedMotion) { progress.setValue(0); return; }
    const animation = Animated.loop(Animated.timing(progress, {
      toValue: 1, duration: 1200, useNativeDriver: true, isInteraction: false,
    }));
    animation.start();
    return () => animation.stop();
  }, [progress, reducedMotion]);
  return (
    <View style={styles.row} accessible={false} importantForAccessibility="no-hide-descendants">
      {[0, 1, 2].map((index) => (
        <Animated.View key={index} style={[styles.dot, {
          backgroundColor: color,
          opacity: reducedMotion ? 0.7 : progress.interpolate({
            inputRange: [0, 0.15 + index * 0.18, 0.4 + index * 0.18, 1],
            outputRange: [0.35, 1, 0.35, 0.35],
          }),
        }]} />
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 20 },
  dot: { width: 5, height: 5, borderRadius: 3 },
});
