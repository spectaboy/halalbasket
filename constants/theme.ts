// constants/theme.ts — URide brand palette

// ── Light theme palette (new design system) ──────────────────────────────────
export const lightColors = {
  background:  '#FFFFFF',
  surface:     '#FFFFFF',
  inputBg:     '#F2F9F5',               // Very light mint for input fields & steppers
  primary:     '#1A5C38',               // Brand green (deep forest)
  primaryDark: '#134D2F',               // Pressed / darker green
  blob:        'rgba(39,174,96,0.13)',   // Large decorative circles
  blobMid:     'rgba(39,174,96,0.09)',   // Medium / smaller blobs
  stripe:      'rgba(39,174,96,0.11)',   // Diagonal stripe lines
  textDark:    '#1A2E1F',               // Near-black, green-tinted
  textMuted:   '#6B8070',               // Secondary / placeholder text
  cardShadow:  '#000000',
  divider:     'rgba(0,0,0,0.06)',
  chipBg:      '#EAF5EE',               // Light mint chip / badge backgrounds
  error:       '#E74C3C',
};

// ── Dark theme palette (legacy — still used by non-migrated screens) ─────────
export const colors = {
  // URide brand green
  primary: '#27AE60',         // Slightly deeper than logo — less neon, more premium
  primaryLight: '#2ECC71',    // Bright version for hero/highlights only
  primaryDark: '#1E8A4A',     // Darker green for hover/pressed states

  // Dark green backgrounds — rich, not black
  backgroundDark: '#0C1E11',  // Deep forest green
  surfaceDark: '#132819',     // Cards / surfaces
  controlDark: '#1A3321',     // Inputs, chips, steppers

  // CTA / action button background
  cta: '#163A37',             // Deep teal-green for action buttons

  // Text
  textOnDark: '#E8F5EC',      // Off-white with a green tint
  textMuted: '#5E7A69',       // Muted text

  // Accent / mint tints
  mintSoft: '#C8E6D4',        // Soft mint for accent text / badges
  mintPale: '#E4F5EC',        // Very pale mint for subtle fills

  // Borders
  border: '#1E3526',

  // Status
  error: '#E74C3C',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};
