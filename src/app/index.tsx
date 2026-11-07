// Intro: the first thing a signed-out person sees, right after the graphite splash.
// A driver at the wheel, drawn in negative space on graphite; then the graphite
// springs into the R and the driver's head becomes its counter. Then the name,
// the line, and the two ways in fade up.
// Motion and numbers come from the Counter Head studio and the Intro board.

import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { R_HEAD, R_POINTS } from '@/components/intro-points';
import { Button, useFont } from '@/components/ui';
import { useT } from '@/lib/session';
import { colors, space } from '@/theme/tokens';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Timeline, in ms (studio defaults).
const INTRO = 600; // driver fades in
const HOLD = 1000; // driver drives
const C = INTRO + HOLD; // collapse starts
const UI_DELAY = 750; // words and buttons after the collapse
const END = C + UI_DELAY + 900;
// Springs (stiffness k, damping c), same maths as the studio.
const MORPH = { k: 140, c: 24 };
const HEAD = { k: 200, c: 15 };
const BOUNCE = { k: 300, c: 9, amount: 0.12 };

// The scene is 390 units wide (the board), as tall as the screen needs.
const W = 390;
const CX = 195;
const CY = 300; // where the R sits
const PL = { s: 1.5, x: CX - 107 * 1.5, y: CY - 103 * 1.5 }; // mark box -> scene
const H0 = { x: 176, y: 262, r: 34 }; // the driver's head before the collapse
const H1 = { x: PL.x + R_HEAD.x * PL.s, y: PL.y + R_HEAD.y * PL.s, r: R_HEAD.r * PL.s };

function spring(t: number, k: number, c: number) {
  'worklet';
  if (t <= 0) return 0;
  const s = t / 1000;
  const w = Math.sqrt(k);
  const z = c / (2 * w);
  if (z < 1) {
    const wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * s) * (Math.cos(wd * s) + ((z * w) / wd) * Math.sin(wd * s));
  }
  return 1 - Math.exp(-w * s) * (1 + w * s);
}

function impulse(t: number, k: number, c: number) {
  'worklet';
  if (t <= 0) return 0;
  const s = t / 1000;
  const w = Math.sqrt(k);
  const z = Math.min(c / (2 * w), 0.95);
  const wd = w * Math.sqrt(1 - z * z);
  return Math.exp(-z * w * s) * Math.sin(wd * s) * 1.6;
}

const clamp = (x: number) => {
  'worklet';
  return Math.max(0, Math.min(1, x));
};
const outCubic = (x: number) => {
  'worklet';
  return 1 - Math.pow(1 - x, 3);
};

export default function Intro() {
  const { t } = useT();
  const { f } = useFont();
  const { width, height } = useWindowDimensions();
  const H = (W * height) / width;
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const time = useSharedValue(reduce ? END + 1 : 0);
  const [collapsed, setCollapsed] = useState(reduce);
  const [ready, setReady] = useState(reduce);

  // Start points: the four screen edges, 60 points each, matching the R's four runs.
  const from = useMemo(() => {
    const rect = [
      [-4, -4, W + 4, -4],
      [W + 4, -4, W + 4, H + 4],
      [W + 4, H + 4, -4, H + 4],
      [-4, H + 4, -4, -4],
    ];
    const out: number[] = [];
    for (const [ax, ay, bx, by] of rect) {
      for (let i = 0; i < 60; i++) {
        const k = i / 60;
        out.push(ax + (bx - ax) * k, ay + (by - ay) * k);
      }
    }
    return out;
  }, [H]);
  const to = useMemo(() => R_POINTS.map((v, i) => (i % 2 === 0 ? PL.x + v * PL.s : PL.y + v * PL.s)), []);

  useFrameCallback((info) => {
    // Stop moving once the scene has settled; the R stays still.
    if (time.value <= END + 200) time.value = info.timeSinceFirstFrame;
  }, !reduce);

  // Status bar text turns dark once the graphite has gone; buttons work once visible.
  useEffect(() => {
    if (reduce) return;
    const a = setTimeout(() => setCollapsed(true), C + 200);
    const b = setTimeout(() => setReady(true), C + UI_DELAY + 300);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [reduce]);

  const inkProps = useAnimatedProps(() => {
    const tt = time.value;
    const p = spring(tt - C, MORPH.k, MORPH.c);
    const b = 1 - BOUNCE.amount * impulse(tt - C - 260, BOUNCE.k, BOUNCE.c);
    let d = 'M';
    for (let i = 0; i < from.length; i += 2) {
      const x = from[i] + (to[i] - from[i]) * p;
      const y = from[i + 1] + (to[i + 1] - from[i + 1]) * p;
      d += (i ? 'L' : '') + (CX + (x - CX) * b).toFixed(1) + ',' + (CY + (y - CY) * b).toFixed(1);
    }
    return { d: d + 'Z' };
  });

  // The driver's body and the wheel bob along, then fade as the collapse starts.
  const bodyProps = useAnimatedProps(() => {
    const tt = time.value;
    const a = outCubic(clamp(tt / INTRO));
    const bob = tt < C ? Math.sin(tt / 260) * 1.5 : 0;
    const y = (v: number) => (v + bob).toFixed(1);
    return {
      d: `M138,${y(306)} L200,${y(306)} L280,${y(396)} L280,${y(440)} L214,${y(366)} L214,${y(486)} L138,${y(486)} Z`,
      opacity: Math.min(a, 1 - clamp((tt - C) / 260)),
    };
  });

  const wheelProps = useAnimatedProps(() => {
    const tt = time.value;
    const a = outCubic(clamp(tt / INTRO));
    const bob = tt < C ? Math.sin(tt / 260) * 1.5 : 0;
    const wiggle = Math.sin(tt / 420) * 5 * (1 - clamp((tt - C) / 200));
    const r = ((-20 + wiggle) * Math.PI) / 180;
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    // A 12 x 124 bar centred on (292, 414), rotated.
    const pt = (x: number, y: number) =>
      (292 + x * cos - y * sin).toFixed(1) + ',' + (414 + bob + x * sin + y * cos).toFixed(1);
    return {
      d: `M${pt(-6, -62)} L${pt(6, -62)} L${pt(6, 62)} L${pt(-6, 62)} Z`,
      opacity: Math.min(a, 1 - clamp((tt - C) / 260)),
    };
  });

  const headProps = useAnimatedProps(() => {
    const tt = time.value;
    const a = outCubic(clamp(tt / INTRO));
    const bob = tt < C ? Math.sin(tt / 260) * 1.5 : 0;
    const hq = spring(tt - C - 40, HEAD.k, HEAD.c);
    const b = 1 - BOUNCE.amount * impulse(tt - C - 260, BOUNCE.k, BOUNCE.c);
    const hx = H0.x + (H1.x - H0.x) * hq;
    const hy = H0.y + bob + (H1.y - H0.y - bob) * hq;
    const hr = H0.r + (H1.r - H0.r) * hq;
    return {
      cx: CX + (hx - CX) * b,
      cy: CY + (hy - CY) * b,
      r: Math.max(0, hr * b * (tt < INTRO ? a : 1)),
    };
  });

  const uiStyle = useAnimatedStyle(() => {
    const u = outCubic(clamp((time.value - C - UI_DELAY) / 600));
    return { opacity: u, transform: [{ translateY: (1 - u) * 14 }] };
  });

  return (
    <View style={styles.root}>
      <StatusBar style={collapsed ? 'dark' : 'light'} />
      <Svg
        width={width}
        height={height}
        viewBox={`0 0 ${W} ${H}`}
        style={StyleSheet.absoluteFill}
        accessibilityLabel={t('appName')}
      >
        <Rect width={W} height={H} fill={colors.surface} />
        <AnimatedPath animatedProps={inkProps} fill={colors.ink} />
        <AnimatedPath animatedProps={bodyProps} fill={colors.surface} />
        <AnimatedPath animatedProps={wheelProps} fill={colors.surface} />
        <AnimatedCircle animatedProps={headProps} fill={colors.surface} />
      </Svg>

      <Animated.View style={[styles.ui, { bottom: insets.bottom + 16 }, uiStyle]} pointerEvents={ready ? 'auto' : 'none'}>
        <Text style={[styles.name, { fontFamily: f.bold }]}>{t('appName')}</Text>
        <Text style={[styles.line, { fontFamily: f.regular }]}>{t('slide1Title')}</Text>
        <Button
          label={t('getStarted')}
          onPress={() => router.push('/welcome')}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/sign-up/phone')}
          style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.6 }]}
        >
          <Text style={[styles.secondaryText, { fontFamily: f.medium }]}>{t('haveAccount')}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  ui: { position: 'absolute', left: space.lg, right: space.lg, gap: 10 },
  name: { fontSize: 40, lineHeight: 48, color: colors.ink, textAlign: 'center', letterSpacing: -0.4 },
  line: { fontSize: 16, lineHeight: 24, color: colors.inkSecondary, textAlign: 'center', marginBottom: 18 },
  secondary: { height: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 16, color: colors.ink },
});
