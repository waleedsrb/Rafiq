// Rafiq's two colour palettes, light and dark, from the design system
// (tokens v2, direction C5). Both have exactly the same names, so a screen asks
// for `c.ink` and gets the right one for the look the person is in.
//
// Pure data and helpers, no React, so the tests can import it.

export const light = {
  surface: '#F7F6F3', // bg: porcelain, the single app background
  card: '#FFFFFF', // white, sparingly: input fields, grouped inputs
  sunken: '#ECEAE5', // quick-action circles, the "where to?" capsule, avatars
  ink: '#17191C', // primary text and primary buttons (graphite)
  inkPressed: '#2E3136',
  inkSecondary: '#6B6E73',
  hairline: '#E7E5E0', // line: separators instead of shadows and cards
  lineStrong: '#B9BBC0', // unselected chip borders, secondary buttons
  onInk: '#FFFFFF', // text and icons on an ink fill (the primary button)
  clay: '#B4583B', // signal: ONLY for "something needs you"
  claySoft: '#F0E4DE',
  clayPressed: '#9C4B32',
  veil: 'rgba(23,25,28,0.32)', // behind pop-ups
  glassFill: 'rgba(255,255,255,0.72)',
  glassTint: 'rgba(247,246,243,0.55)', // Liquid Glass tint for bars over a map
  glassVeil: 'rgba(247,246,243,0.38)', // porcelain wash on top, so text reads on a dark map
  glassCardVeil: 'rgba(247,246,243,0.5)', // the same wash on the expanded card, which holds more text
  glassEdge: 'rgba(255,255,255,0.90)',
  glassLens: 'rgba(23,25,28,0.07)', // the selected tab's pill
  fill: 'rgba(23,25,28,0.05)', // quiet fill: search fields, notes, small round buttons on the page
  fillStrong: 'rgba(23,25,28,0.07)', // a step stronger: buttons on a frosted bar or panel
  panel: 'rgba(247,246,243,0.86)', // a frosted panel over a map (drive mode, the date strip)
  scrim: 'rgba(23,25,28,0.3)', // small dark marks over anything (the pin's shadow dot)
  lifted: 'rgba(251,250,248,0.98)', // a bar that moves over the page: the page colour, a touch lighter so its edge reads
  plateInk: '#1F6B3A', // fixed: copies the real plate
  statusOpen: '#2E7A4D',
  statusOpenSoft: '#E8F2EC',
  statusCrowded: '#8A6410',
  statusCrowdedDot: '#B8860B',
  statusCrowdedSoft: '#FBF1D9',
  statusClosed: '#B3263A',
  statusClosedSoft: '#F8E4E7',
  // Fixed in both looks, for things that copy the real world or are always dark
  // (license plates, the graphite launch screen).
  graphite: '#17191C',
  white: '#FFFFFF',
  alarm: '#B3263A', // a solid red banner with white text (a closed checkpoint while driving)
  alarmFill: 'rgba(255,255,255,0.2)', // the icon circle on that banner
} as const;

export type ColorName = keyof typeof light;
export type Palette = { readonly [K in ColorName]: string };

// Dark: warm graphite, not pure black (Waleed's pick, Nov 11). Values come from
// the design system's "Dark" theme; the glass washes are new and follow it.
export const dark: Palette = {
  surface: '#141619',
  card: '#1F2226',
  sunken: '#2A2D33',
  ink: '#F4F3F0',
  inkPressed: '#D6D4CF',
  inkSecondary: '#A0A3A8',
  hairline: '#30333A',
  lineStrong: '#5A5E66',
  onInk: '#17191C',
  clay: '#D8805F',
  claySoft: '#3A2820',
  clayPressed: '#C26C4D',
  veil: 'rgba(0,0,0,0.55)',
  glassFill: 'rgba(31,34,38,0.62)',
  glassTint: 'rgba(20,22,25,0.55)',
  glassVeil: 'rgba(20,22,25,0.38)',
  glassCardVeil: 'rgba(20,22,25,0.5)',
  glassEdge: 'rgba(255,255,255,0.14)',
  glassLens: 'rgba(244,243,240,0.12)',
  fill: 'rgba(244,243,240,0.08)',
  fillStrong: 'rgba(244,243,240,0.12)',
  panel: 'rgba(20,22,25,0.88)',
  scrim: 'rgba(0,0,0,0.45)',
  lifted: 'rgba(31,34,38,0.98)',
  plateInk: '#1F6B3A',
  statusOpen: '#6FCB93',
  statusOpenSoft: '#1E3326',
  statusCrowded: '#E8B84A',
  statusCrowdedDot: '#E8B84A',
  statusCrowdedSoft: '#3A2F17',
  statusClosed: '#F07A8C',
  statusClosedSoft: '#3D1F24',
  graphite: '#17191C',
  white: '#FFFFFF',
  alarm: '#B3263A',
  alarmFill: 'rgba(255,255,255,0.2)',
};

export const palettes: Record<Scheme, Palette> = { light, dark };

export type Scheme = 'light' | 'dark';
/** What the person picked in Settings. */
export type AppearancePref = 'system' | 'light' | 'dark';

/** The pick a phone starts with: follow the phone's own light or dark. */
export const DEFAULT_PREF: AppearancePref = 'system';

/** Read a saved pick; anything unknown (nothing saved yet, an old value) is the default. */
export function parsePref(saved: string | null | undefined): AppearancePref {
  return saved === 'system' || saved === 'light' || saved === 'dark' ? saved : DEFAULT_PREF;
}

/** The look to draw: the pick, or the phone's own look when following it. */
export function resolveScheme(pref: AppearancePref, phone: string | null | undefined): Scheme {
  if (pref !== 'system') return pref;
  return phone === 'dark' ? 'dark' : 'light';
}

/** What to tell iOS and Android, so native parts (keyboard, glass, alerts) match. */
export function nativeOverride(pref: AppearancePref): 'light' | 'dark' | 'unspecified' {
  return pref === 'system' ? 'unspecified' : pref;
}

/** A palette colour (#RRGGBB) at some opacity: `wash(c.surface, 0.8)` is a frosted porcelain. */
export function wash(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * A faint ink fill (a quiet field or button on the page). Light ink on a dark page
 * shows less than dark ink on a light one, so dark gets a bit more.
 */
export function inkWash(c: Palette, alpha: number): string {
  return wash(c.ink, c.ink === dark.ink ? Math.round(alpha * 160) / 100 : alpha);
}
