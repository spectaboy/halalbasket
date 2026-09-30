import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, ImageSourcePropType, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { lightColors } from '../../../constants/theme';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export default function OnboardingPhoto({ source, height, label }: {
  source: ImageSourcePropType;
  height: number;
  label: string;
}) {
  const reducedMotion = useReducedMotion();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [width, setWidth] = useState(400);
  const opacity = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (loaded || failed || reducedMotion) return;
    const animation = Animated.loop(Animated.timing(shimmer, {
      toValue: 1, duration: 1500, easing: Easing.linear, useNativeDriver: true, isInteraction: false,
    }));
    animation.start();
    return () => animation.stop();
  }, [loaded, failed, reducedMotion, shimmer]);

  return (
    <View style={[styles.frame, { height }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {!loaded && !failed && (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, {
          transform: [{ translateX: shimmer.interpolate({ inputRange: [0, 1], outputRange: [-width, width] }) }],
        }]}>
          <LinearGradient colors={['transparent', '#f7f7ed', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      )}
      {failed ? (
        <View style={styles.fallback}><Ionicons name="basket-outline" color={lightColors.primary} size={54} /></View>
      ) : (
        <Animated.Image source={source} accessibilityLabel={label} style={[StyleSheet.absoluteFill, { width: '100%', height: '100%', opacity }]} resizeMode="cover"
          onLoad={() => {
            setLoaded(true);
            Animated.timing(opacity, { toValue: 1, duration: reducedMotion ? 0 : 320, useNativeDriver: true }).start();
          }}
          onError={() => setFailed(true)}
        />
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  frame: { overflow: 'hidden', borderRadius: 28, backgroundColor: '#e6ebdf' },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
