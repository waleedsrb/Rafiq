// One glass material for the whole app, so every glass surface behaves the same way.
//
// - iOS 26+: Apple's own Liquid Glass (GlassView). It bends and tints what is behind it and
//   reacts to touch. It must sit still: native glass turns into a grey slab while its size
//   animates, and it stops rendering under a see-through parent. Pass `native={false}` while
//   a surface moves or resizes, and the frosted stand-in takes over until it settles.
// - Older iOS and Android: a frosted blur with a light wash that imitates it.
// - Reduce Transparency (Settings > Accessibility > Display & Text Size): a solid surface,
//   no blur, as Apple's own apps do. isLiquidGlassAvailable() can't tell us this, so we ask
//   the system ourselves and follow it live.

import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from '@/theme/tokens';

export const LIQUID_GLASS = isLiquidGlassAvailable();

// One subscription for the whole app, shared by every glass surface on screen.
let reduceTransparency = false;
const listeners = new Set<() => void>();
let started = false;
function subscribe(onChange: () => void) {
  listeners.add(onChange);
  if (!started) {
    started = true;
    const set = (v: boolean) => {
      if (v === reduceTransparency) return;
      reduceTransparency = v;
      listeners.forEach((l) => l());
    };
    AccessibilityInfo.isReduceTransparencyEnabled().then(set).catch(() => {});
    AccessibilityInfo.addEventListener('reduceTransparencyChanged', set);
  }
  return () => {
    listeners.delete(onChange);
  };
}

/** True while the phone's Reduce Transparency setting is on (iOS; always false on Android). */
export function useReduceTransparency() {
  return useSyncExternalStore(subscribe, () => reduceTransparency);
}

export function Glass({
  radius = 0,
  native = true,
  interactive,
  tint,
  veil,
  dark,
  blur = 40,
  style,
}: {
  radius?: number;
  /** false while the surface moves or resizes: the frosted stand-in shows instead. */
  native?: boolean;
  /** Native glass reacts to the finger (buttons, the collapsed trip bar). */
  interactive?: boolean;
  /** Colour mixed into the native glass. */
  tint?: string;
  /** A thin wash on top of the glass, for surfaces that hold a lot of text over a busy map. */
  veil?: string;
  dark?: boolean;
  /** Blur strength of the stand-in. */
  blur?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const solid = useReduceTransparency();
  const shape = [StyleSheet.absoluteFill, { borderRadius: radius }, style];

  if (solid) {
    return <View pointerEvents="none" style={[shape, { backgroundColor: dark ? colors.glassSolidDark : colors.surface }]} />;
  }
  if (LIQUID_GLASS && native) {
    return (
      <>
        <GlassView
          pointerEvents={interactive ? undefined : 'none'}
          style={shape}
          glassEffectStyle="regular"
          tintColor={tint}
          colorScheme={dark ? 'dark' : 'light'}
          isInteractive={interactive}
        />
        {veil ? <View pointerEvents="none" style={[shape, { backgroundColor: veil }]} /> : null}
      </>
    );
  }
  return (
    <View pointerEvents="none" style={[shape, { overflow: 'hidden' }]}>
      <BlurView intensity={blur} tint={dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: dark ? colors.glassFillDark : colors.glassFill }]} />
    </View>
  );
}
