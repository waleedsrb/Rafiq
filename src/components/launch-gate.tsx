import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { LAUNCH_FADE } from '@/components/launch-timing';
import { RoadReveal } from '@/components/road-reveal';
import { markLaunchSeen, readLaunchMode, type LaunchMode } from '@/lib/launch-state';
import { useT } from '@/lib/session';
import { makeStyles } from '@/theme/theme';

/** Mounted once above the navigator, never in response to AppState or a route. */
export function LaunchGate({ loading, children }: { loading: boolean; children: ReactNode }) {
  const styles = useStyles();
  const { t } = useT();
  const reduced = useReducedMotion();
  const [mode, setMode] = useState<LaunchMode | null>(null);
  const [animationDone, setAnimationDone] = useState(false);
  const revealed = animationDone && !loading;
  const [visible, setVisible] = useState(true);
  const opacity = useSharedValue(1);

  useEffect(() => {
    let mounted = true;
    readLaunchMode(AsyncStorage).then((next) => { if (mounted) setMode(next); });
    return () => { mounted = false; };
  }, []);

  const complete = useCallback(() => {
    setAnimationDone(true);
    void markLaunchSeen(AsyncStorage);
  }, []);
  const painted = useCallback(() => {
    SplashScreen.setOptions({ fade: !reduced, duration: reduced ? 0 : 400 });
    void SplashScreen.hideAsync();
  }, [reduced]);

  useEffect(() => {
    if (!animationDone || loading) return;
    const duration = reduced ? 0 : LAUNCH_FADE;
    opacity.set(withTiming(0, { duration }));
    const timer = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(timer);
  }, [animationDone, loading, opacity, reduced]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View style={styles.root}>
      {/* Keep navigation/session work mounted, but hide its layout and focus targets. */}
      <View style={[styles.content, !revealed && styles.concealed]} pointerEvents={visible ? 'none' : 'auto'} accessibilityElementsHidden={visible} importantForAccessibility={visible ? 'no-hide-descendants' : 'auto'}>
        {children}
      </View>
      {visible ? (
        <Animated.View testID="launch-overlay" style={[StyleSheet.absoluteFill, styles.cover, fadeStyle]}>
          {mode ? <RoadReveal mode={mode} reduced={reduced} label={t('appName')} onComplete={complete} onLayout={painted} /> : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  // Graphite in both looks, like the native splash it takes over from.
  root: { flex: 1, backgroundColor: colors.graphite },
  content: { flex: 1 },
  concealed: { display: 'none' },
  cover: { backgroundColor: colors.graphite },
}));
