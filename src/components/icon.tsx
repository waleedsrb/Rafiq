import Svg, { Path } from 'react-native-svg';

import { colors } from '@/theme/tokens';

import { iconPaths, type IconName } from './icon-paths';

export type { IconName };

/**
 * A Phosphor icon. `flip` mirrors it, for icons that point a direction
 * (back, chevrons) so they point the right way in Arabic.
 */
export function Icon({
  name,
  size = 22,
  color = colors.ink,
  flip,
}: {
  name: IconName;
  size?: number;
  color?: string;
  flip?: boolean;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill={color}
      style={flip ? { transform: [{ scaleX: -1 }] } : undefined}
      accessible={false}
    >
      {iconPaths[name].map((d) => (
        <Path key={d} d={d} />
      ))}
    </Svg>
  );
}
