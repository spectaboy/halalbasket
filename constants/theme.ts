// HalalBasket: warm cream, forest green, and quiet neutral surfaces.

// ── Logo colours ─────────────────────────────────────────────────────────────
// Sampled from the HalalBasket logo (assets/HalalBasket.png). Use these for the
// brand lockup so the app matches the icon exactly.
export const brand = {
  green: '#055134',   // Logo background green
  gold:  '#E1AC44',   // Wreath / basket gold — the "Basket" half of the wordmark
  ink:   '#FFFFFF',   // The "Halal" half of the wordmark
};

// ── Light theme palette (new design system) ──────────────────────────────────
export const lightColors = {
  background:  '#FBF8F1',
  surface:     '#FFFFFF',
  inputBg:     '#F0F1E9',
  primary:     '#205A3C',
  primaryDark: '#134D2F',               // Pressed / darker green
  blob:        'rgba(39,174,96,0.13)',   // Large decorative circles
  blobMid:     'rgba(39,174,96,0.09)',   // Medium / smaller blobs
  stripe:      'rgba(39,174,96,0.11)',   // Diagonal stripe lines
  textDark:    '#19382A',
  textMuted:   '#667166',
  cardShadow:  '#000000',
  divider:     '#E4E6DA',
  chipBg:      '#E9EEE2',
  error:       '#E74C3C',
};

// ── Dark theme palette (legacy — still used by non-migrated screens) ─────────
export const colors = {
  // Brand green
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
