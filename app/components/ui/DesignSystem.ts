/**
 * URide Design System
 * Shared UI components and styles for consistent app-wide design
 * Based on HomeScreen design language
 */

import { StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { colors } from '../../../constants/theme';

// =====================================================
// COLOR TOKENS (Direct exports for programmatic use)
// =====================================================
export const DS = {
  colors: {
    // Brand
    primary: colors.primary,           // #23B16E
    primaryDark: colors.primaryDark,   // #0E8A63
    cta: colors.cta,                   // #163A37
    
    // Dark Theme
    background: colors.backgroundDark, // #0F1917
    surface: colors.surfaceDark,       // #122321
    control: colors.controlDark,       // #1E2B29
    
    // Text
    text: colors.textOnDark,           // #EAF4F1
    textMuted: colors.textMuted,       // #8AA39B
    
    // Accents
    mintSoft: colors.mintSoft,         // #CDEBE3
    mintPale: colors.mintPale,         // #E6F4EF
    
    // Status
    error: colors.error,               // #E53935
    
    // Additional semantic colors
    divider: 'rgba(138, 163, 155, 0.15)',
    overlay: 'rgba(0, 0, 0, 0.4)',
  },
  
  // Border radius tokens
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    full: 9999,
  },
  
  // Spacing tokens
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    '2xl': 24,
    '3xl': 32,
  },
};

// =====================================================
// SHARED STYLES
// =====================================================
export const sharedStyles = StyleSheet.create({
  // Screen containers
  safeArea: {
    flex: 1,
    backgroundColor: DS.colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: DS.colors.background,
  },
  
  // Headers
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: DS.spacing.lg,
    paddingVertical: DS.spacing.md,
  },
  headerTitle: {
    color: DS.colors.text,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    flex: 1,
  },
  headerTitleWithBack: {
    marginRight: 44,
  },
  backButton: {
    padding: DS.spacing.sm,
    marginLeft: -DS.spacing.sm,
  },
  
  // Card patterns
  surfaceCard: {
    backgroundColor: DS.colors.surface,
    borderRadius: DS.radius.lg,
    padding: DS.spacing.lg,
  },
  controlCard: {
    backgroundColor: DS.colors.surface,
    borderRadius: DS.radius.lg,
    paddingHorizontal: DS.spacing.md,
    paddingVertical: DS.spacing.sm,
  },
  
  // Control rows
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: DS.spacing.md,
  },
  controlRowBorder: {
    borderTopWidth: 1,
    borderTopColor: DS.colors.control,
  },
  controlRowInset: {
    paddingHorizontal: DS.spacing.md,
  },
  controlLabel: {
    color: DS.colors.text,
    fontSize: 15,
    fontWeight: '500',
  },
  controlLabelMuted: {
    color: DS.colors.textMuted,
    fontSize: 14,
  },
  
  // Chips
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: DS.spacing.sm,
    paddingHorizontal: DS.spacing.md,
    paddingVertical: DS.spacing.sm,
    borderRadius: DS.radius.md,
    backgroundColor: DS.colors.control,
  },
  chipActive: {
    backgroundColor: DS.colors.primaryDark,
  },
  chipText: {
    color: DS.colors.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
  chipTextActive: {
    color: DS.colors.text,
    fontWeight: '600',
  },
  
  // Buttons
  primaryButton: {
    backgroundColor: DS.colors.cta,
    borderRadius: DS.radius.md,
    paddingVertical: DS.spacing.lg,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: DS.spacing.sm,
  },
  primaryButtonText: {
    color: DS.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  greenButton: {
    backgroundColor: DS.colors.primary,
    borderRadius: DS.radius.md,
    paddingVertical: DS.spacing.lg,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: DS.spacing.sm,
  },
  greenButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  dangerButton: {
    backgroundColor: DS.colors.error,
    borderRadius: DS.radius.md,
    paddingVertical: DS.spacing.lg,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: DS.spacing.sm,
  },
  dangerButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  
  // Count steppers
  countStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: DS.spacing.sm,
  },
  countButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: DS.colors.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countButtonText: {
    color: DS.colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  countValue: {
    color: DS.colors.text,
    fontSize: 18,
    fontWeight: '800',
    minWidth: 24,
    textAlign: 'center',
  },
  
  // Empty states
  emptyStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: DS.spacing['3xl'],
  },
  emptyStateTitle: {
    color: DS.colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: DS.spacing.sm,
  },
  emptyStateSubtitle: {
    color: DS.colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: DS.spacing.xl,
  },
  emptyStateText: {
    color: DS.colors.textMuted,
    fontSize: 15,
  },
  
  // Lists
  listContainer: {
    flex: 1,
    paddingHorizontal: DS.spacing.lg,
  },
  
  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: DS.colors.background,
  },
  
  // Bottom action bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: DS.spacing.lg,
    paddingTop: DS.spacing.md,
    backgroundColor: DS.colors.background,
    borderTopWidth: 1,
    borderTopColor: DS.colors.divider,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  
  // Dividers
  divider: {
    height: 1,
    backgroundColor: DS.colors.divider,
  },
  
  // Route display
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: DS.colors.primary,
  },
  routeDotEnd: {
    backgroundColor: DS.colors.textMuted,
  },
  routeLine: {
    width: 2,
    height: 24,
    backgroundColor: DS.colors.primary,
    marginVertical: DS.spacing.xs,
  },
  
  // Badges
  badge: {
    backgroundColor: DS.colors.control,
    paddingHorizontal: DS.spacing.sm,
    paddingVertical: DS.spacing.xs,
    borderRadius: DS.radius.sm,
  },
  badgeText: {
    color: DS.colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  badgeActive: {
    backgroundColor: DS.colors.primaryDark,
  },
  badgeTextActive: {
    color: DS.colors.text,
  },
  
  // Avatars
  avatarSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: DS.colors.control,
  },
  avatarMedium: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: DS.colors.control,
  },
});

// =====================================================
// TABS COMPONENT STYLE
// =====================================================
export const tabStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginHorizontal: DS.spacing.lg,
    marginBottom: DS.spacing.lg,
    backgroundColor: DS.colors.surface,
    borderRadius: DS.radius.md,
    padding: 4,
  },
  button: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: DS.spacing.md,
    borderRadius: DS.radius.sm,
  },
  buttonActive: {
    backgroundColor: DS.colors.control,
  },
  text: {
    color: DS.colors.textMuted,
    fontSize: 15,
    fontWeight: '500',
  },
  textActive: {
    color: DS.colors.text,
    fontWeight: '700',
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: DS.colors.primary,
    marginLeft: DS.spacing.sm,
  },
});

// =====================================================
// DATE SELECTOR STYLES
// =====================================================
export const dateSelectorStyles = StyleSheet.create({
  container: {
    paddingHorizontal: DS.spacing.lg,
    marginBottom: DS.spacing.lg,
  },
  monthText: {
    color: DS.colors.textMuted,
    fontSize: 14,
    marginBottom: DS.spacing.md,
    textAlign: 'center',
  },
  scrollContent: {
    paddingVertical: DS.spacing.xs,
  },
  dayButton: {
    backgroundColor: DS.colors.surface,
    borderRadius: DS.radius.md,
    paddingVertical: DS.spacing.md,
    paddingHorizontal: DS.spacing.md,
    marginRight: DS.spacing.md,
    alignItems: 'center',
    minWidth: 56,
  },
  dayButtonActive: {
    backgroundColor: DS.colors.primary,
  },
  dayText: {
    color: DS.colors.textMuted,
    fontSize: 12,
  },
  dayTextActive: {
    color: DS.colors.text,
  },
  dayNum: {
    color: DS.colors.text,
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 2,
  },
  dayNumActive: {
    color: DS.colors.text,
  },
  navButton: {
    padding: DS.spacing.sm,
  },
});

// =====================================================
// RIDE CARD STYLES
// =====================================================
export const rideCardStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: DS.colors.surface,
    borderRadius: DS.radius.lg,
    padding: DS.spacing.lg,
    marginBottom: DS.spacing.md,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: DS.colors.control,
  },
  timeSection: {
    alignItems: 'center',
    marginRight: DS.spacing.lg,
    width: 56,
  },
  timeText: {
    color: DS.colors.text,
    fontSize: 14,
    fontWeight: 'bold',
  },
  verticalLine: {
    height: 24,
    width: 2,
    backgroundColor: DS.colors.primary,
    marginVertical: DS.spacing.xs,
    borderRadius: 1,
  },
  detailsSection: {
    flex: 1,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: DS.spacing.md,
  },
  driverName: {
    color: DS.colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  price: {
    color: DS.colors.primary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  routeInfo: {
    marginBottom: DS.spacing.sm,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: DS.spacing.xs,
  },
  locationDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: DS.colors.primary,
    marginRight: DS.spacing.md,
  },
  locationDotEnd: {
    backgroundColor: DS.colors.textMuted,
  },
  locationText: {
    color: DS.colors.text,
    fontSize: 14,
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: DS.spacing.xs,
  },
  metaText: {
    color: DS.colors.textMuted,
    fontSize: 12,
    marginLeft: DS.spacing.xs,
  },
});

// =====================================================
// MODAL SHEET STYLES
// =====================================================
export const sheetStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: DS.colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: DS.colors.surface,
    borderTopLeftRadius: DS.radius.xl,
    borderTopRightRadius: DS.radius.xl,
    padding: DS.spacing.lg,
    paddingBottom: DS.spacing['2xl'],
  },
  title: {
    color: DS.colors.text,
    fontWeight: '800',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: DS.spacing.xs,
  },
  subtitle: {
    color: DS.colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: DS.spacing.lg,
  },
  // Modal preview specific styles (used in MyRidesScreen ride preview)
  overlay: {
    flex: 1,
    backgroundColor: DS.colors.overlay,
    justifyContent: 'center',
    padding: DS.spacing.lg,
  },
  animatedContainer: {
    backgroundColor: DS.colors.surface,
    borderRadius: DS.radius.lg,
    padding: DS.spacing.lg,
  },
  content: {
    // Container for modal content
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: DS.spacing.md,
    backgroundColor: DS.colors.control,
  },
  headerTitle: {
    color: DS.colors.text,
    fontWeight: '800',
    fontSize: 16,
  },
  headerSubtitle: {
    color: DS.colors.textMuted,
    fontSize: 13,
    marginLeft: 4,
  },
  sectionTitle: {
    color: DS.colors.text,
    fontWeight: '700',
    fontSize: 14,
    marginBottom: DS.spacing.xs,
  },
  routeText: {
    color: DS.colors.text,
    fontSize: 14,
  },
  timeText: {
    color: DS.colors.textMuted,
    fontSize: 13,
    marginTop: 4,
    marginBottom: 8,
  },
  vehicleImage: {
    width: 72,
    height: 48,
    borderRadius: 6,
    marginRight: DS.spacing.md,
  },
  vehicleText: {
    color: DS.colors.text,
    fontSize: 14,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: DS.spacing.lg,
  },
  price: {
    color: DS.colors.cta,
    fontWeight: '800',
    fontSize: 16,
  },
  actionButton: {
    backgroundColor: DS.colors.cta,
    borderRadius: DS.radius.md,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  actionButtonText: {
    color: DS.colors.text,
    fontWeight: '700',
    fontSize: 14,
  },
});

// =====================================================
// VIEW MODE TOGGLE STYLES (Upcoming/Past)
// =====================================================
export const viewModeStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginHorizontal: DS.spacing.lg,
    marginBottom: DS.spacing.lg,
    backgroundColor: DS.colors.surface,
    borderRadius: DS.radius.md,
    padding: 4,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: DS.spacing.md,
    paddingHorizontal: DS.spacing.md,
    borderRadius: DS.radius.sm,
    gap: DS.spacing.sm,
  },
  buttonActive: {
    backgroundColor: DS.colors.control,
  },
  text: {
    color: DS.colors.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
  textActive: {
    color: DS.colors.primary,
    fontWeight: '600',
  },
});

// =====================================================
// MAP CARD STYLES (For screens with map headers)
// =====================================================
export const mapCardStyles = StyleSheet.create({
  mapContainer: {
    height: 180,
    backgroundColor: DS.colors.control,
    marginHorizontal: DS.spacing.lg,
    borderRadius: DS.radius.lg,
    overflow: 'hidden',
    marginBottom: DS.spacing.lg,
  },
  map: {
    flex: 1,
  },
  markerContainer: {
    backgroundColor: DS.colors.background,
    padding: 6,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: DS.colors.primary,
  },
  markerContainerEnd: {
    borderColor: DS.colors.textMuted,
  },
});

// =====================================================
// INFO CARD STYLES (For ride details)
// =====================================================
export const infoCardStyles = StyleSheet.create({
  card: {
    backgroundColor: DS.colors.surface,
    borderRadius: DS.radius.lg,
    padding: DS.spacing.lg,
    marginBottom: DS.spacing.lg,
  },
  title: {
    color: DS.colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: DS.spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: DS.spacing.md,
  },
  label: {
    color: DS.colors.textMuted,
    fontSize: 14,
    width: 100,
  },
  value: {
    color: DS.colors.text,
    fontSize: 14,
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: DS.colors.divider,
    marginVertical: DS.spacing.md,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: DS.spacing.sm,
  },
  badge: {
    backgroundColor: DS.colors.control,
    paddingHorizontal: DS.spacing.md,
    paddingVertical: DS.spacing.sm,
    borderRadius: DS.radius.md,
  },
  badgeText: {
    color: DS.colors.mintSoft,
    fontSize: 13,
    fontWeight: '500',
  },
});

// =====================================================
// PROFILE CARD STYLES
// =====================================================
export const profileCardStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: DS.colors.surface,
    borderRadius: DS.radius.lg,
    padding: DS.spacing.lg,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: DS.colors.control,
    marginRight: DS.spacing.lg,
  },
  avatarMedium: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: DS.colors.control,
    marginRight: DS.spacing.md,
  },
  avatarSmall: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: DS.colors.control,
    marginRight: DS.spacing.md,
  },
  name: {
    color: DS.colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  subtitle: {
    color: DS.colors.textMuted,
    fontSize: 14,
    marginTop: 2,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  ratingText: {
    color: DS.colors.textMuted,
    fontSize: 14,
    marginLeft: 4,
  },
});
