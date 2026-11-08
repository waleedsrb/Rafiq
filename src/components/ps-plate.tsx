// Waleed's West Bank plate asset (assets/plates/plate-ps-private.svg in the project files),
// drawn natively. With `draw`, the characters write themselves on one after another,
// the way the asset's README suggests (stroke-dashoffset from full length to 0).

import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { ClipPath, Defs, G, Path, Rect, SvgXml } from 'react-native-svg';

import { PS_PLATE_BASE, PS_PLATE_CHARS } from './ps-plate-data';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const INK = '#1F6B45';
const PER_CHAR_MS = 170;

export function PsPlate({ width, draw, delay = 0 }: { width: number; draw?: boolean; delay?: number }) {
  const height = (width * 110) / 520;
  // 0 = nothing written, N = every character written.
  const written = useSharedValue(draw ? 0 : PS_PLATE_CHARS.length);

  useEffect(() => {
    if (!draw) return;
    written.value = 0;
    written.value = withDelay(
      delay,
      withTiming(PS_PLATE_CHARS.length, { duration: PS_PLATE_CHARS.length * PER_CHAR_MS, easing: Easing.inOut(Easing.quad) }),
    );
  }, [draw, delay, written]);

  return (
    <View style={{ width, height, direction: 'ltr' }} accessible accessibilityLabel="4-2718-H">
      <SvgXml xml={PS_PLATE_BASE} width={width} height={height} style={{ position: 'absolute' }} />
      <Svg width={width} height={height} viewBox="0 0 520 110" style={{ position: 'absolute' }}>
        <Defs>
          {PS_PLATE_CHARS.map((c, i) => (
            <ClipPath key={i} id={`psc-${i}`}>
              <Rect x={c.clip[0]} y={c.clip[1]} width={c.clip[2]} height={c.clip[3]} />
            </ClipPath>
          ))}
        </Defs>
        {PS_PLATE_CHARS.map((c, i) => (
          <G key={i} transform={`translate(${c.x} ${c.y})`} clipPath={`url(#psc-${i})`}>
            {c.paths.map((p, k) => (
              <Stroke key={k} d={p.d} len={p.len} width={c.sw} index={i} part={k / c.paths.length} parts={c.paths.length} written={written} />
            ))}
          </G>
        ))}
      </Svg>
    </View>
  );
}

/** One stroke of a character. A character with several strokes draws them in order. */
function Stroke({
  d,
  len,
  width,
  index,
  part,
  parts,
  written,
}: {
  d: string;
  len: number;
  width: number;
  index: number;
  part: number;
  parts: number;
  written: SharedValue<number>;
}) {
  const props = useAnimatedProps(() => {
    const local = Math.min(1, Math.max(0, (written.value - index - part) * parts));
    return { strokeDashoffset: len * (1 - local) };
  });
  return (
    <AnimatedPath
      d={d}
      fill="none"
      stroke={INK}
      strokeWidth={width}
      strokeLinejoin="miter"
      strokeLinecap="butt"
      strokeDasharray={[len, len]}
      animatedProps={props}
    />
  );
}
