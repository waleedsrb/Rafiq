// Larger Text (iPhone Settings > Display & Brightness > Text Size, or Accessibility >
// Larger Text). React Native already grows every Text with it; what breaks is layout:
// a label kept to one line gets cut off with "…", and a fixed-height row clips.
//
// The rule in Rafiq:
// - At the default size nothing changes: one-line labels stay one line.
// - Above it, those labels may wrap (useOneLine) and rows grow (minHeight, not height).
// - Text inside a fixed floating bar (the search capsule, the trip bar, drive mode's
//   banner and slider) grows only up to BAR_TEXT_MAX, the way Apple's own bars do.

import { useWindowDimensions } from 'react-native';

/** The person reads with text larger than the default. */
export function useBigText(): boolean {
  return useWindowDimensions().fontScale > 1;
}

/** `numberOfLines` for a label that is one line at the default size and wraps when text is larger. */
export function useOneLine(): 1 | undefined {
  return useBigText() ? undefined : 1;
}

/** How far text inside a fixed-height floating bar may grow (pass as maxFontSizeMultiplier). */
export const BAR_TEXT_MAX = 1.3;
