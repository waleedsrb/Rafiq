// Design tokens from the Rafiq design system (direction C5, tokens v2).
// Screens read colors, spacing and type from here, never hard-coded values,
// so a design change happens in one place. The colours themselves live in
// palettes.ts (light and dark).

export const radii = {
  sm: 8,
  plate: 10,
  md: 12,
  container: 16,
  sheet: 28,
  capsule: 999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  screen: 20, // side margin of every screen
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const sizes = {
  touch: 44, // minimum touch target, glass top buttons, avatars
  control: 48,
  button: 56, // full-width capsule button, input fields, quick actions
  controlSm: 36, // chips
  icon: 22,
  dock: 64,
} as const;

export const fonts = {
  ar: {
    regular: 'IBMPlexSansArabic_400Regular',
    medium: 'IBMPlexSansArabic_500Medium',
    bold: 'IBMPlexSansArabic_600SemiBold',
  },
  en: {
    regular: 'IBMPlexSans_400Regular',
    medium: 'IBMPlexSans_500Medium',
    bold: 'IBMPlexSans_600SemiBold',
  },
} as const;

// Soft shadows only on the glass layer (top buttons, dock), never on content.
export const shadows = {
  float: { shadowColor: '#17191C', shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  glass: { shadowColor: '#17191C', shadowOpacity: 0.12, shadowRadius: 32, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
} as const;

// Pop-up motion: one calm rhythm for every pop-up (src/components/dialog-host.tsx).
// Ease-out in, quicker ease-in out, never a spring: nothing bounces.
export const motion = {
  inMs: 280,
  outMs: 200,
  /** A sheet closes when dragged past this share of its height... */
  dismissShare: 0.3,
  /** ...or flicked down faster than this (points per second). */
  dismissVelocity: 900,
} as const;
