// One sliding pill for every "pick one" row (segmented controls, day chips, the
// part-of-day tabs). Instead of the old pill vanishing and a new one appearing,
// a single pill glides from the old option to the new one and stretches to the
// new option's width. Each label changes colour as the pill passes under it.
//
// How it works: every option reports where it sits (onLayout), the pill is one
// absolutely placed view behind them, and Reanimated springs its x and width on
// the UI thread, so the movement stays smooth even while JS is busy.

import { useCallback, useEffect, useRef } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import {
  interpolateColor,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

type Box = { x: number; y: number; w: number; h: number };

/** Quick and smooth: a hint of settle at the end, no visible bounce. */
const GLIDE = { mass: 1, stiffness: 340, damping: 32 } as const;

export type PillSlide = {
  /** Put on the row that holds the options and the pill (must be the pill's parent). */
  onTrackLayout: (e: LayoutChangeEvent) => void;
  /** Put on option i. */
  onItemLayout: (i: number) => (e: LayoutChangeEvent) => void;
  /** The pill's left edge and width on screen (physical, so RTL works too). */
  left: SharedValue<number>;
  width: SharedValue<number>;
  /** The pill's offset as a transform, and its row-relative top and height. */
  tx: SharedValue<number>;
  top: SharedValue<number>;
  height: SharedValue<number>;
  visible: SharedValue<number>;
  boxes: SharedValue<Box[]>;
};

/**
 * `selected` is the chosen option's index (-1 for none). `rtl` must match the
 * row's layout direction: the pill is placed from the row's start edge.
 */
export function usePillSlide(selected: number, rtl: boolean): PillSlide {
  const boxes = useSharedValue<Box[]>([]);
  const trackW = useSharedValue(0);
  const sel = useSharedValue(selected);
  const tx = useSharedValue(0);
  const width = useSharedValue(0);
  const top = useSharedValue(0);
  const height = useSharedValue(0);
  const visible = useSharedValue(0);
  const known = useRef<Box[]>([]);

  useEffect(() => {
    sel.value = selected;
  }, [selected, sel]);

  const onTrackLayout = useCallback((e: LayoutChangeEvent) => {
    trackW.value = e.nativeEvent.layout.width;
  }, [trackW]);

  const onItemLayout = useCallback(
    (i: number) => (e: LayoutChangeEvent) => {
      const { x, y, width: w, height: h } = e.nativeEvent.layout;
      known.current[i] = { x, y, w, h };
      boxes.value = [...known.current];
    },
    [boxes],
  );

  useAnimatedReaction(
    () => ({ s: sel.value, b: boxes.value[sel.value], tw: trackW.value }),
    ({ s, b, tw }) => {
      if (s < 0) {
        visible.value = withTiming(0, { duration: 150 });
        return;
      }
      if (!b || !tw) return;
      // The pill sits at the row's start edge; in RTL that's the right side.
      const to = rtl ? b.x + b.w - tw : b.x;
      top.value = b.y;
      height.value = b.h;
      if (visible.value === 0) {
        // First paint (or coming back from "nothing picked"): appear in place.
        tx.value = to;
        width.value = b.w;
        visible.value = withTiming(1, { duration: 150 });
      } else {
        tx.value = withSpring(to, GLIDE);
        width.value = withSpring(b.w, GLIDE);
      }
    },
    [rtl],
  );

  const left = useDerivedValue(() => (rtl ? trackW.value + tx.value - width.value : tx.value));

  return { onTrackLayout, onItemLayout, left, width, tx, top, height, visible, boxes };
}

/** The pill's fixed part: placed from the row's start edge, behind the options. */
export const pillBase = { position: 'absolute', start: 0 } as const;

/** The pill's moving part; use together with `pillBase`. */
export function usePillStyle(p: PillSlide, mode: 'fill' | 'underline' = 'fill', line = 2) {
  return useAnimatedStyle(() => ({
    top: mode === 'fill' ? p.top.value : p.top.value + p.height.value - line,
    height: mode === 'fill' ? p.height.value : line,
    width: p.width.value,
    opacity: p.visible.value,
    transform: [{ translateX: p.tx.value }],
  }));
}

/** How much of option i the pill covers right now, 0 to 1. */
export function useCovered(p: PillSlide, i: number) {
  return useDerivedValue(() => {
    const b = p.boxes.value[i];
    if (!b || b.w === 0) return 0;
    const l = p.left.value;
    const r = l + p.width.value;
    const overlap = Math.min(b.x + b.w, r) - Math.max(b.x, l);
    return Math.max(0, Math.min(1, overlap / b.w)) * p.visible.value;
  });
}

/** A colour that fades from `off` to `on` as the pill covers option i. */
export function usePillColor(p: PillSlide, i: number, off: string, on: string) {
  const covered = useCovered(p, i);
  return useAnimatedStyle(() => ({ color: interpolateColor(covered.value, [0, 1], [off, on]) }));
}

/** Same, for an outline that should melt into the pill. */
export function usePillBorder(p: PillSlide, i: number, off: string, on: string) {
  const covered = useCovered(p, i);
  return useAnimatedStyle(() => ({ borderColor: interpolateColor(covered.value, [0, 1], [off, on]) }));
}
