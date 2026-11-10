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
import { useSyncExternalStore, type ReactNode } from 'react';
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

/**
 * The one glass look. Every surface uses the same style and the same tint, so a button, the
 * search bar, the trip card and drive mode all read as one material at one see-through level.
 * Tune the look here (GLASS_STYLE) and in tokens.ts (glassTint, glassTintDark), nowhere else.
 */
export const GLASS_STYLE = 'clear' as const;

export function Glass({
  radius = 0,
  native = true,
  interactive,
  dark,
  blur = 40,
  style,
  children,
}: {
  radius?: number;
  /** false while the surface moves or resizes: the frosted stand-in shows instead. */
  native?: boolean;
  /** Native glass reacts to the finger: it lifts and stretches as you press and drag. */
  interactive?: boolean;
  dark?: boolean;
  /** Blur strength of the stand-in. */
  blur?: number;
  style?: StyleProp<ViewStyle>;
  /** Content drawn inside the glass (it then stretches with the glass when touched). */
  children?: ReactNode;
}) {
  const solid = useReduceTransparency();
  // Native glass draws its own corners (borderRadius on the glass itself). It must never sit
  // inside a clipping (overflow hidden), shadowed or see-through parent: UIKit then quietly
  // draws a plain blur instead, which is why the trip card looked frosted.
  const shape = [StyleSheet.absoluteFill, { borderRadius: radius }, style];

  if (solid) {
    return (
      <View pointerEvents="box-none" style={[shape, { backgroundColor: dark ? colors.glassSolidDark : colors.surface }]}>
        {children}
      </View>
    );
  }
  if (LIQUID_GLASS && native) {
    return (
      <GlassView
        pointerEvents={interactive || children ? 'auto' : 'none'}
        style={shape}
        glassEffectStyle={GLASS_STYLE}
        tintColor={dark ? colors.glassTintDark : colors.glassTint}
        colorScheme={dark ? 'dark' : 'light'}
        isInteractive={interactive}
      >
        {children}
      </GlassView>
    );
  }
  return (
    <View pointerEvents="box-none" style={[shape, { overflow: 'hidden' }]}>
      <BlurView pointerEvents="none" intensity={blur} tint={dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: dark ? colors.glassFillDark : colors.glassFill }]} />
      {children}
    </View>
  );
}
