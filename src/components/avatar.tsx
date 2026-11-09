// A person's circle: their profile photo when it's shown to you. Otherwise a generated
// avatar (a colour and a motif picked from their id, see lib/avatar-art.ts), or their
// initial when we don't know who it is.

import { Image, View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { IconCircle } from '@/components/ui';
import { avatarArt, type Part, type Swatch } from '@/lib/avatar-art';
import { useAvatarUrl } from '@/lib/avatar';
import { colors } from '@/theme/tokens';

export function Avatar({
  path,
  name,
  seed,
  size = 40,
}: {
  path?: string | null;
  name: string;
  /** The person's id: the same person always gets the same generated avatar. */
  seed?: string | null;
  size?: number;
}) {
  const url = useAvatarUrl(path);
  const round = { width: size, height: size, borderRadius: size / 2, overflow: 'hidden' as const, backgroundColor: colors.sunken };
  if (url) {
    return (
      <View style={round}>
        <Image source={{ uri: url }} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />
      </View>
    );
  }
  if (seed) {
    return (
      <View style={round} accessible accessibilityLabel={name}>
        <GeneratedAvatar seed={seed} size={size} />
      </View>
    );
  }
  return <IconCircle letter={name.trim().charAt(0)} size={size} />;
}

function GeneratedAvatar({ seed, size }: { seed: string; size: number }) {
  const { swatch, motif, rotate, flip } = avatarArt(seed);
  const transform = `rotate(${rotate} 50 50)${flip ? ' translate(100 0) scale(-1 1)' : ''}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect width={100} height={100} fill={swatch.bg} />
      <G transform={transform}>{motif.map((p, i) => drawPart(p, swatch, i))}</G>
    </Svg>
  );
}

function drawPart(p: Part, sw: Swatch, key: number) {
  const color = p.tone === 'fg' ? sw.fg : sw.soft;
  if (p.kind === 'path') return <Path key={key} d={p.d} fill={color} />;
  if (p.kind === 'line') return <Path key={key} d={p.d} fill="none" stroke={color} strokeWidth={p.width} strokeLinecap="round" />;
  return <Circle key={key} cx={p.cx} cy={p.cy} r={p.r} fill={color} />;
}
