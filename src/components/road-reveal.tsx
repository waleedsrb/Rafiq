import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedProps, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, G, Path, Rect } from 'react-native-svg';
import type { GProps } from 'react-native-svg';

import { expandedInk, progress, REVEAL_END, ROAD_CUTOUT, roadDrawing, sceneTransform } from '@/components/intro-motion';
import { launchDuration, launchSceneTime } from '@/components/launch-timing';
import { MARK_BODY, MARK_ROAD } from '@/components/rafiq-mark';
import type { LaunchMode } from '@/lib/launch-state';
import { makeStyles, useTheme } from '@/theme/theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedGroup = Animated.createAnimatedComponent(G);
const isWeb = Platform.OS === 'web';
const decorative = isWeb ? { 'aria-hidden': true as const } : { accessible: false };

export function RoadReveal({ mode, reduced, label, onComplete, onLayout }: {
  mode: LaunchMode; reduced: boolean; label: string; onComplete: () => void; onLayout: () => void;
}) {
  const { dark: themeDark } = useTheme();
  const { c: colors } = useTheme();
  const styles = useStyles();
  const { width, height } = useWindowDimensions();
  const H = 360 * height / width;
  const time = useSharedValue(reduced ? REVEAL_END : 0);
  const startedAt = useSharedValue(-1);
  const [settled, setSettled] = useState(reduced);
  const duration = launchDuration(mode, reduced);

  useFrameCallback((info) => {
    if (startedAt.get() < 0) startedAt.set(info.timestamp);
    time.set(launchSceneTime(info.timestamp - startedAt.get(), mode));
  }, !reduced && !settled);

  useEffect(() => {
    const timer = setTimeout(() => { setSettled(true); time.set(REVEAL_END); onComplete(); }, duration);
    return () => clearTimeout(timer);
  }, [duration, onComplete, time]);

  const groupProps = useAnimatedProps<GProps>(() => {
    const { scale, x, y } = sceneTransform(time.value, H * 0.414);
    return isWeb ? { transform: `matrix(${scale} 0 0 ${scale} ${x} ${y})` } : { matrix: [scale, 0, 0, scale, x, y] };
  });
  const inkProps = useAnimatedProps(() => ({ d: expandedInk(time.value), opacity: time.value < REVEAL_END ? 1 : 0 }));
  const roadProps = useAnimatedProps(() => ({ d: roadDrawing(time.value), opacity: time.value < REVEAL_END ? 1 : 0 }));
  const headProps = useAnimatedProps(() => ({ r: 96 * progress(time.value, 5100, 6000), opacity: time.value < REVEAL_END ? 1 : 0 }));
  const finalProps = useAnimatedProps(() => ({ opacity: time.value >= REVEAL_END ? 1 : 0 }));

  return (
    <View onLayout={onLayout} style={styles.root} accessible accessibilityLabel={label}>
      <StatusBar style={settled && !themeDark ? 'dark' : 'light'} />
      <Svg width={width} height={height} viewBox={`0 0 360 ${H}`} {...decorative}>
        <Defs><ClipPath id="launch-road"><Path d={ROAD_CUTOUT} /></ClipPath></Defs>
        <Rect width={360} height={H} fill={colors.surface} />
        <AnimatedGroup animatedProps={groupProps}>
          {/* Graphite in both looks: it continues the native splash. */}
          <AnimatedPath animatedProps={inkProps} fill={colors.graphite} />
          <G clipPath="url(#launch-road)"><AnimatedPath animatedProps={roadProps} fill={colors.surface} /></G>
          <AnimatedCircle cx={352} cy={268} animatedProps={headProps} fill={colors.surface} />
          <AnimatedGroup animatedProps={finalProps}>
            <Path d={MARK_BODY} fill={colors.ink} fillRule="evenodd" />
            <Path d={MARK_ROAD} fill={colors.ink} />
          </AnimatedGroup>
        </AnimatedGroup>
      </Svg>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({ root: { ...StyleSheet.absoluteFill, backgroundColor: colors.surface } }));
