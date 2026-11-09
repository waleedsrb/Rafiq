// Design tokens from the Rafiq design system (direction C5, tokens v2).
// Screens read colors, spacing and type from here, never hard-coded values,
// so a design change happens in one place.

export const colors = {
  surface: '#F7F6F3', // bg: porcelain, the single app background
  card: '#FFFFFF', // white, sparingly: input fields, grouped inputs
  sunken: '#ECEAE5', // quick-action circles, the "where to?" capsule, avatars
  ink: '#17191C', // primary text and primary buttons (graphite)
  inkPressed: '#2E3136',
  inkSecondary: '#6B6E73',
  hairline: '#E7E5E0', // line: separators instead of shadows and cards
  lineStrong: '#B9BBC0', // unselected chip borders, secondary buttons
  onInk: '#FFFFFF',
  clay: '#B4583B', // signal: ONLY for "something needs you"
  claySoft: '#F0E4DE',
  clayPressed: '#9C4B32',
  veil: 'rgba(23,25,28,0.32)', // behind pop-ups
  glassFill: 'rgba(255,255,255,0.72)',
  glassTint: 'rgba(247,246,243,0.55)', // Liquid Glass tint for bars over a map
  glassVeil: 'rgba(247,246,243,0.38)', // porcelain wash on top, so text reads on a dark map
  glassEdge: 'rgba(255,255,255,0.90)',
  glassLens: 'rgba(23,25,28,0.07)', // the selected tab's pill
  plateInk: '#1F6B3A',
  statusOpen: '#2E7A4D',
  statusOpenSoft: '#E8F2EC',
  statusCrowded: '#8A6410',
  statusCrowdedDot: '#B8860B',
  statusCrowdedSoft: '#FBF1D9',
  statusClosed: '#B3263A',
  statusClosedSoft: '#F8E4E7',
} as const;

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
