// The car's number plate as the real thing (West Bank green on white, or Israeli yellow),
// drawn from the asset studio's plate generator for whatever number the driver entered.
// A number we can't draw falls back to the plain text plate.

import { useMemo } from 'react';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { Plate } from '@/components/plate';
import { plateSvg } from '@/lib/plate-svg';

export function PlateArt({ plate, width = 180 }: { plate: string; width?: number }) {
  const xml = useMemo(() => plateSvg(plate), [plate]);
  if (!xml) return <Plate plate={plate} size={width < 160 ? 'sm' : 'md'} />;
  // Real plates are 520 x 110 mm.
  const height = (width * 110) / 520;
  return (
    <View style={{ width, height, direction: 'ltr' }} accessible accessibilityRole="image" accessibilityLabel={plate}>
      <SvgXml xml={xml} width={width} height={height} />
    </View>
  );
}
