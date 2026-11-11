// The Rafiq mark ("Orbit / Turn", chosen Nov 8): a bold R whose counter is a head
// and whose leg turns into a road sweeping out. Source SVGs live in assets/brand/.
// Two shapes: the body (with the round counter cut out) and the road beside it.

import { Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '@/theme/theme';

export const MARK_VIEWBOX = '42 57 670 615';
export const MARK_RATIO = 670 / 615; // width / height
export const MARK_BODY =
  'M42 80Q42 57 65 57L480 57C600 57 679 140 679 245C679 345 602 425 497 437L694 648Q712 672 684 672L436 672C400 610 324 565 323 520C322 482 392 452 384 422C376 395 322 386 262 393C180 403 110 438 42 486ZM448 268A96 96 0 1 0 256 268A96 96 0 1 0 448 268Z';
export const MARK_ROAD = 'M60 672Q36 672 42 638C78 556 180 470 304 434Q333 428 330 442C268 482 212 560 218 672Z';
const decorative = Platform.OS === 'web' ? { 'aria-hidden': true as const } : { accessible: false };

/** The mark at a given height; width follows the mark's proportions. */
export function RafiqMark({ size = 24, color }: { size?: number; color?: string }) {
  const { c } = useTheme();
  const ink = color ?? c.ink;
  return (
    <Svg width={size * MARK_RATIO} height={size} viewBox={MARK_VIEWBOX} {...decorative}>
      <Path d={MARK_BODY} fill={ink} fillRule="evenodd" />
      <Path d={MARK_ROAD} fill={ink} />
    </Svg>
  );
}
