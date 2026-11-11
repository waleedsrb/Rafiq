// Slide to confirm: a knob you drag across a capsule. Used to end a trip in drive mode,
// where a tap could happen by accident (a bump in the road, a phone in a holder).
// Let go before the end and it slides back. Screen readers get a plain button instead.

import { useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { useFont } from '@/components/ui';
import { successFeel, tapFeel } from '@/lib/haptics';
import { inkWash, palettes } from '@/theme/palettes';

const KNOB = 52;
const PAD = 4;
const DONE_AT = 0.85; // let go past this much of the way and it counts

export function SlideToConfirm({
  label,
  onConfirm,
  loading,
  dark,
}: {
  label: string;
  onConfirm: () => void;
  loading?: boolean;
  dark?: boolean;
}) {
  const { f, rtl } = useFont();
  const [width, setWidth] = useState(0);
  const [reader, setReader] = useState(false);
  const x = useSharedValue(0);
  const startX = useSharedValue(0);
  const travel = Math.max(1, width - KNOB - 2 * PAD);
  const dir = rtl ? -1 : 1; // in Arabic the knob slides from right to left

  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled().then(setReader).catch(() => {});
  }, []);
  // After it's done (or failed), the knob goes home.
  useEffect(() => {
    if (!loading) x.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = () => {
    successFeel();
    onConfirm();
  };
  const pan = usePanGesture({
    enabled: !loading && width > 0,
    activeOffsetX: [-6, 6],
    onActivate: () => {
      'worklet';
      startX.value = x.value;
      runOnJS(tapFeel)();
    },
    onUpdate: (e: { translationX: number }) => {
      'worklet';
      x.value = Math.min(travel, Math.max(0, startX.value + e.translationX * dir));
    },
    onDeactivate: () => {
      'worklet';
      if (x.value >= travel * DONE_AT) {
        x.value = withTiming(travel, { duration: 120 });
        runOnJS(done)();
      } else {
        x.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) });
      }
    },
  });

  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * dir }] }));
  const fade = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, x.value / (travel * 0.6)) }));

  const p = palettes[dark ? 'dark' : 'light'];
  const ink = p.ink;
  const onInk = p.onInk;
  const track = inkWash(p, 0.08);

  if (reader) {
    return (
      <Pressable accessibilityRole="button" onPress={done} style={[styles.track, { backgroundColor: ink, justifyContent: 'center' }]}>
        <Text style={[styles.label, { fontFamily: f.medium, color: onInk }]}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <View
      style={[styles.track, { backgroundColor: track }]}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessibilityLabel={label}
    >
      <Animated.Text style={[styles.label, { fontFamily: f.medium, color: ink }, fade]} numberOfLines={1}>
        {label}
      </Animated.Text>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.knob, rtl ? { right: PAD } : { left: PAD }, { backgroundColor: ink }, knob]}>
          {loading ? <ActivityIndicator color={onInk} /> : <Icon name={rtl ? 'arrowLeft' : 'arrowRight'} size={22} color={onInk} />}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: KNOB + 2 * PAD, borderRadius: 999, justifyContent: 'center', overflow: 'hidden' },
  label: { textAlign: 'center', fontSize: 17, paddingHorizontal: KNOB + 12 },
  knob: { position: 'absolute', top: PAD, width: KNOB, height: KNOB, borderRadius: KNOB / 2, alignItems: 'center', justifyContent: 'center' },
});
