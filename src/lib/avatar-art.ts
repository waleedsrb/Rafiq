// Generated avatars for people without a visible photo: a calm colour and a simple motif
// from the road and the hills, picked from the person's id so they always get the same one.
//
// The colours are earthy and muted, so they sit next to porcelain, graphite and clay
// without fighting them: olive, sage, sand, stone blue, plum, teal, ochre and a terracotta
// that is deliberately browner than clay (clay stays the "something needs you" colour).
//
// Every shape is drawn on a 100 × 100 square that the avatar clips to a circle.

export type Swatch = { bg: string; fg: string; soft: string };

export const SWATCHES: readonly Swatch[] = [
  { bg: '#6E7A55', fg: '#E9E4D2', soft: '#8C9672' }, // olive
  { bg: '#A9B8A0', fg: '#3E4A3C', soft: '#C4CFBC' }, // sage
  { bg: '#D8C7A6', fg: '#6B5636', soft: '#E7DCC5' }, // sand
  { bg: '#9C6B53', fg: '#F2E5D8', soft: '#B5866F' }, // terracotta
  { bg: '#7F93A6', fg: '#EEF1F4', soft: '#9CADBD' }, // stone blue
  { bg: '#866A7C', fg: '#F1E7EC', soft: '#A0879A' }, // plum
  { bg: '#4F7A74', fg: '#E3EEEA', soft: '#6E9690' }, // teal
  { bg: '#C49A4F', fg: '#4A3A1E', soft: '#D6B57C' }, // ochre
  { bg: '#3B4048', fg: '#E7E3DA', soft: '#5A606A' }, // graphite
];

/** One drawn part: a filled shape, or a stroked line. `tone` picks fg or soft. */
export type Part =
  | { kind: 'path'; d: string; tone: 'fg' | 'soft' }
  | { kind: 'line'; d: string; tone: 'fg' | 'soft'; width: number }
  | { kind: 'dot'; cx: number; cy: number; r: number; tone: 'fg' | 'soft' };

/** The motifs. Each reads at 32pt as well as at 72pt. */
export const MOTIFS: readonly (readonly Part[])[] = [
  // Hills: two folds of land.
  [
    { kind: 'path', d: 'M0 62 Q28 40 56 58 T100 52 V100 H0 Z', tone: 'soft' },
    { kind: 'path', d: 'M0 78 Q34 58 70 74 T100 72 V100 H0 Z', tone: 'fg' },
  ],
  // Sun over a hill.
  [
    { kind: 'dot', cx: 62, cy: 40, r: 14, tone: 'fg' },
    { kind: 'path', d: 'M0 76 Q50 50 100 76 V100 H0 Z', tone: 'soft' },
  ],
  // The road: one bend between two cities.
  [
    { kind: 'line', d: 'M28 104 C28 62 72 62 72 -4', tone: 'fg', width: 16 },
  ],
  // Olive leaf.
  [
    { kind: 'path', d: 'M28 74 C26 46 48 26 76 24 C78 52 58 74 28 74 Z', tone: 'fg' },
    { kind: 'line', d: 'M22 80 L60 42', tone: 'soft', width: 4 },
  ],
  // Two companions.
  [
    { kind: 'dot', cx: 40, cy: 56, r: 16, tone: 'fg' },
    { kind: 'dot', cx: 66, cy: 44, r: 10, tone: 'soft' },
  ],
  // An orbit, like the logo's head.
  [
    { kind: 'line', d: 'M50 22 A28 28 0 1 1 22 50', tone: 'fg', width: 11 },
    { kind: 'dot', cx: 50, cy: 50, r: 7, tone: 'soft' },
  ],
  // Terraces.
  [
    { kind: 'line', d: 'M-4 44 Q50 30 104 44', tone: 'soft', width: 8 },
    { kind: 'line', d: 'M-4 62 Q50 48 104 62', tone: 'fg', width: 8 },
    { kind: 'line', d: 'M-4 80 Q50 66 104 80', tone: 'soft', width: 8 },
  ],
  // Half sun on the horizon.
  [
    { kind: 'path', d: 'M18 64 A32 32 0 0 1 82 64 Z', tone: 'fg' },
    { kind: 'path', d: 'M0 64 H100 V100 H0 Z', tone: 'soft' },
  ],
];

export type AvatarArt = { swatch: Swatch; motif: readonly Part[]; rotate: number; flip: boolean };

/** A small, stable hash (FNV-1a) so the same id always gives the same avatar. */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function avatarArt(seed: string): AvatarArt {
  const h = hashSeed(seed);
  const swatch = SWATCHES[h % SWATCHES.length];
  const motif = MOTIFS[Math.floor(h / SWATCHES.length) % MOTIFS.length];
  const rest = Math.floor(h / (SWATCHES.length * MOTIFS.length));
  // Landscapes stay upright (a hill upside down looks like a mistake); the others turn.
  const upright = motif === MOTIFS[0] || motif === MOTIFS[1] || motif === MOTIFS[6] || motif === MOTIFS[7];
  return { swatch, motif, rotate: upright ? 0 : (rest % 4) * 90, flip: (rest >> 2) % 2 === 1 };
}
