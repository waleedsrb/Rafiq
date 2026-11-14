// A frosted blur that turns solid when the phone asks for less transparency.
//
// Some people switch on Settings > Accessibility > Display & Text Size > Reduce
// Transparency because see-through glass makes text hard to read. Apple asks apps
// to draw solid surfaces for them instead. Every blur in Rafiq goes through here,
// and every Liquid Glass spot checks `solid` from useTheme() before drawing glass.

import { BlurView } from 'expo-blur';
import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';

import { useTheme } from '@/theme/theme';

export function Frost({
  intensity,
  tint,
  style,
  solidColor,
}: {
  intensity: number;
  tint: 'light' | 'dark';
  style?: StyleProp<ViewStyle>;
  /** The opaque colour to draw instead. Defaults to the page colour (porcelain or graphite). */
  solidColor?: string;
}) {
  const { c, solid } = useTheme();
  if (solid) return <View pointerEvents="none" style={[style, { backgroundColor: solidColor ?? c.surface }]} />;
  return <BlurView intensity={intensity} tint={tint} style={style} />;
}
