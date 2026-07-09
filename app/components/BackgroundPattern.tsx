import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';

/** Cluster of parallel diagonal lines */
const DiagonalLines = ({ style }: { style?: object }) => (
  <View style={[styles.linesContainer, style]}>
    {Array.from({ length: 8 }).map((_, i) => (
      <View
        key={i}
        style={[styles.line, { left: i * 18 }]}
      />
    ))}
  </View>
);

/**
 * Decorative mint background pattern — circles, dots, and diagonal line clusters.
 * Place as the first child inside a screen container with `overflow:'hidden'`.
 * Uses `pointerEvents="none"` so it doesn't block touches.
 */
const BackgroundPattern = () => {
  const { width, height } = useWindowDimensions();

  return (
  <View style={StyleSheet.absoluteFill} pointerEvents="none">
    {/* Large circle — top left (partially off-screen) */}
    <View style={styles.circleTL} />

    {/* Small dot — top area */}
    <View style={[styles.dotTop, { top: height * 0.14, left: width * 0.22 }]} />

    {/* Diagonal lines — top right */}
    <DiagonalLines style={styles.linesTR} />

    {/* Small circle — right side */}
    <View style={[styles.dotRight, { top: height * 0.12 }]} />

    {/* Small circle — bottom left */}
    <View style={styles.dotBL} />

    {/* Diagonal lines — bottom right */}
    <DiagonalLines style={styles.linesBR} />

    {/* Large circle — bottom right (partially off-screen) */}
    <View style={styles.circleBR} />
  </View>
  );
};

const styles = StyleSheet.create({
  /* ── Large circles ── */
  circleTL: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(143,213,166,0.45)',
    top: -60,
    left: -60,
  },
  circleBR: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(143,213,166,0.45)',
    bottom: -50,
    right: -50,
  },

  /* ── Small dots ── */
  dotTop: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(26,92,56,0.28)',
  },
  dotRight: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(143,213,166,0.55)',
    right: 30,
  },
  dotBL: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(143,213,166,0.50)',
    bottom: 60,
    left: 16,
  },

  /* ── Diagonal line clusters ── */
  linesContainer: {
    position: 'absolute',
    width: 160,
    height: 180,
    overflow: 'hidden',
  },
  line: {
    position: 'absolute',
    width: 3,
    height: 260,
    backgroundColor: 'rgba(26,92,56,0.06)',
    borderRadius: 1.5,
    transform: [{ rotate: '-45deg' }],
    top: -40,
  },
  linesTR: {
    top: 20,
    right: -10,
  },
  linesBR: {
    bottom: 30,
    right: -10,
  },
});

export default BackgroundPattern;
