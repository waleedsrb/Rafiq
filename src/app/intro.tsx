// The approved road-first reveal: draw the paired contours, pause, then pull
// back into the exact mark. All motion is monotonic; reduced motion skips it.
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedProps, useAnimatedStyle, useFrameCallback, useReducedMotion, useSharedValue } from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, G, Path, Rect } from 'react-native-svg';
import type { GProps } from 'react-native-svg';

import { expandedInk, INTRO_END, progress, REVEAL_END, ROAD_CUTOUT, roadDrawing, sceneTransform, UI_START } from '@/components/intro-motion';
import { MARK_BODY, MARK_ROAD } from '@/components/rafiq-mark';
import { Button, useFont } from '@/components/ui';
import { useT } from '@/lib/session';
import { colors, space } from '@/theme/tokens';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedGroup = Animated.createAnimatedComponent(G);
const isWeb = Platform.OS === 'web';

export default function Intro() {
  const { t } = useT();
  const { f } = useFont();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const H = (360 * height) / width;
  const reduce = useReducedMotion();
  const time = useSharedValue(reduce ? INTRO_END : 0);
  const startedAt = useSharedValue(-1);
  const [collapsed, setCollapsed] = useState(reduce);
  const [ready, setReady] = useState(reduce);
  const [uiHeight, setUiHeight] = useState(270);
  // Keep the logo above the measured controls on compact screens and large text.
  const centerY = Math.max(110, Math.min(H * 0.414, H - (uiHeight + insets.bottom + 42) * 360 / width - 70));

  useFrameCallback((info) => {
    // Keep our own epoch: layout/status updates can re-register this callback,
    // and a busy frame must not slow down or restart the choreography.
    if (startedAt.get() < 0) startedAt.set(info.timestamp);
    if (time.get() < INTRO_END) time.set(Math.min(INTRO_END, info.timestamp - startedAt.get()));
  }, !reduce);

  useEffect(() => {
    if (reduce) return;
    const status = setTimeout(() => setCollapsed(true), REVEAL_END);
    const controls = setTimeout(() => setReady(true), UI_START + 550);
    return () => { clearTimeout(status); clearTimeout(controls); };
  }, [reduce]);

  const groupProps = useAnimatedProps<GProps>(() => {
    const { scale, x, y } = sceneTransform(time.value, centerY);
    // Native SVG groups consume a six-value matrix; web consumes an SVG attribute.
    return isWeb ? { transform: `matrix(${scale} 0 0 ${scale} ${x} ${y})` } : { matrix: [scale, 0, 0, scale, x, y] };
  });
  const inkProps = useAnimatedProps(() => ({ d: expandedInk(time.value), opacity: time.value < REVEAL_END ? 1 : 0 }));
  const roadProps = useAnimatedProps(() => ({ d: roadDrawing(time.value), opacity: time.value < REVEAL_END ? 1 : 0 }));
  const headProps = useAnimatedProps(() => ({ r: 96 * progress(time.value, 5100, 6000), opacity: time.value < REVEAL_END ? 1 : 0 }));
  const finalProps = useAnimatedProps(() => ({ opacity: time.value >= REVEAL_END ? 1 : 0 }));
  const uiStyle = useAnimatedStyle(() => {
    const p = progress(time.value, UI_START, UI_START + 550);
    return { opacity: p, transform: [{ translateY: 9 * (1 - p) }] };
  });

  return (
    <View style={styles.root}>
      <StatusBar style={collapsed ? 'dark' : 'light'} />
      <Svg width={width} height={height} viewBox={`0 0 360 ${H}`} style={StyleSheet.absoluteFill} accessibilityLabel={t('appName')}>
        <Defs><ClipPath id="intro-road"><Path d={ROAD_CUTOUT} /></ClipPath></Defs>
        <Rect width={360} height={H} fill={colors.surface} />
        <AnimatedGroup animatedProps={groupProps}>
          <AnimatedPath animatedProps={inkProps} fill={colors.ink} />
          <G clipPath="url(#intro-road)"><AnimatedPath animatedProps={roadProps} fill={colors.surface} /></G>
          <AnimatedCircle cx={352} cy={268} animatedProps={headProps} fill={colors.surface} />
          <AnimatedGroup animatedProps={finalProps}>
            <Path d={MARK_BODY} fill={colors.ink} fillRule="evenodd" />
            <Path d={MARK_ROAD} fill={colors.ink} />
          </AnimatedGroup>
        </AnimatedGroup>
      </Svg>

      <Animated.View onLayout={(event) => setUiHeight(event.nativeEvent.layout.height)} accessibilityElementsHidden={!ready} importantForAccessibility={ready ? 'auto' : 'no-hide-descendants'} style={[styles.ui, { bottom: insets.bottom + 16 }, uiStyle]} pointerEvents={ready ? 'auto' : 'none'}>
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
