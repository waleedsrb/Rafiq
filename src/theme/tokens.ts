// Design tokens from the Rafiq design system (direction C5).
// Screens read colors, spacing and type from here, never hard-coded values,
// so a design change happens in one place.

export const colors = {
  surface: '#F7F6F3', // porcelain, the single app background
  ink: '#17191C', // primary text and primary buttons (graphite)
  inkSecondary: '#6B6E73',
  hairline: '#E7E5E0', // separators instead of shadows and cards
  onInk: '#FFFFFF',
  clay: '#B4583B', // ONLY for "something needs you" signals
  statusOpen: '#2E7D4F',
  statusCrowded: '#B7791F',
  statusClosed: '#B42318',
} as const;

export const radii = {
  capsule: 999,
  container: 16,
  sheet: 28,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const sizes = {
  button: 56, // full-width capsule button height
  topButton: 44,
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
