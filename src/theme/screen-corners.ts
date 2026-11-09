// The hook side of src/lib/corners.ts: corners for the phone this is running on.

import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cornersFor } from '@/lib/corners';

export { concentric } from '@/lib/corners';

/**
 * Corners for things that float at the bottom of the screen.
 * - `screen`: the display's own radius.
 * - `inset`: how far a floating card or sheet sits from the screen edges.
 * - `card`: that card's corner radius, concentric with the screen.
 * - `capsuleInset(h)`: where a capsule `h` tall has to sit for its ends to follow the screen corner.
 */
export function useScreenCorners() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return cornersFor(width, height, insets.bottom > 0);
}

