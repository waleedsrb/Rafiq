// Concentric corners (Apple HIG, Liquid Glass): a shape nested inside another uses the
// same centre for its corner curve, so its radius is the outer radius minus the gap
// between them. On iPhone the outermost shape is the display itself, so a card that
// floats a few points in from the screen edge gets corners that run parallel to the
// glass, the way Find My's sheet and tab bar do.
//
// iOS doesn't publish the display's corner radius, so we look it up by screen size
// (points, portrait). Phones with a home button have square screens (0). Anything we
// don't know (new models, Android) falls back to a typical modern value.

// width x height in points -> display corner radius in points.
const KNOWN: Record<string, number> = {
  '375x812': 39, // X, XS, 11 Pro (12 mini and 13 mini are 44, same size; 39 is the safe side)
  '414x896': 39, // XS Max, 11 Pro Max, XR, 11 (XR and 11 are 41.5)
  '360x780': 44, // 12 mini, 13 mini (zoomed display)
  '390x844': 47.33, // 12, 12 Pro, 13, 13 Pro, 14, 16e
  '428x926': 53.33, // 12 Pro Max, 13 Pro Max, 14 Plus
  '393x852': 55, // 14 Pro, 15, 15 Pro, 16
  '430x932': 55, // 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
  '402x874': 62, // 16 Pro, 17, 17 Pro
  '420x912': 62, // Air
  '440x956': 62, // 16 Pro Max, 17 Pro Max
};

/** Display corner radius we assume for a rounded screen we don't recognise. */
export const FALLBACK_SCREEN_RADIUS = 47;

/** Gap between a floating card or sheet and the screen edges (Find My uses about this). */
export const FLOAT_INSET = 8;

/** The display's corner radius, by screen size. `homeIndicator`: the bottom safe-area inset is > 0. */
export function screenCornerRadius(width: number, height: number, homeIndicator: boolean): number {
  if (!homeIndicator) return 0; // home-button phones and most Android phones in this layout: square corners
  const w = Math.round(Math.min(width, height));
  const h = Math.round(Math.max(width, height));
  return KNOWN[`${w}x${h}`] ?? FALLBACK_SCREEN_RADIUS;
}

/** The radius of a shape inset `gap` points inside a container with radius `outer`, never below `min`. */
export function concentric(outer: number, gap: number, min = 0): number {
  return Math.max(min, outer - gap);
}

export function cornersFor(width: number, height: number, homeIndicator: boolean) {
  const screen = screenCornerRadius(width, height, homeIndicator);
  const inset = FLOAT_INSET;
  // Square screen: nothing to follow, so the design system's sheet radius.
  const card = screen > 0 ? concentric(screen, inset, 28) : 28;
  const capsuleInset = (h: number) => (screen > 0 ? Math.min(28, Math.max(inset, Math.round(screen - h / 2))) : 12);
  return { screen, inset, card, capsuleInset };
}
