// Draws Rafiq's pop-ups (see src/lib/dialog.ts). Mounted in the root layout, and again inside
// any full-screen layer of ours (the trip card), which then draws them instead.
//
// One pattern for every pop-up that asks you to act (design system C5):
// - Sheet (the default): docked to the bottom edge with 28pt top corners and a
//   grabber. Drag it down, or flick it, to close. Tapping the veil or Back closes too.
// - Centre card: only for a dangerous yes/no (placementOf in dialog.ts), so it
//   can't be flicked away by accident.
// Both share the same calm motion from tokens.motion: ease-out in, ease-in out,
// no spring, no bounce. Inside: tone icon, title, short text, then full-width
// capsule buttons (main action on top, quiet one under it). Clay appears only
// for warnings and dangerous actions.

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  answerDialog,
  cancelDialog,
  currentDialog,
  placementOf,
  popDialogLayer,
  pushDialogLayer,
  setDialogOnScreen,
  subscribeDialogLayers,
  subscribeDialogs,
  topDialogLayer,
  type DialogEntry,
  type DialogTone,
} from '@/lib/dialog';
import { selectFeel, tapFeel, warnFeel } from '@/lib/haptics';
import { useT } from '@/lib/session';
import { useScreenCorners } from '@/theme/screen-corners';
import { colors, motion, radii, sizes, space } from '@/theme/tokens';

import { Icon, type IconName } from './icon';
import { useFont } from './ui';

const TONES: Record<DialogTone, { icon: IconName; fg: string; bg: string; button: string; pressed: string }> = {
  neutral: { icon: 'info', fg: colors.ink, bg: colors.sunken, button: colors.ink, pressed: colors.inkPressed },
  success: { icon: 'check', fg: colors.statusOpen, bg: colors.statusOpenSoft, button: colors.ink, pressed: colors.inkPressed },
  warning: { icon: 'warning', fg: colors.clay, bg: colors.claySoft, button: colors.clay, pressed: colors.clayPressed },
  danger: { icon: 'warning', fg: colors.clay, bg: colors.claySoft, button: colors.clay, pressed: colors.clayPressed },
};

// The same two curves for every pop-up.
const IN = { duration: motion.inMs, easing: Easing.out(Easing.cubic) };
const OUT = { duration: motion.outMs, easing: Easing.in(Easing.cubic) };

export function DialogHost({ layer = 0 }: { layer?: number }) {
  // Only the newest layer draws (see pushDialogLayer): the root one, or the trip card's.
  const top = useSyncExternalStore(subscribeDialogLayers, topDialogLayer, topDialogLayer);
  const queued = useSyncExternalStore(subscribeDialogs, currentDialog, currentDialog);
  const current = top === layer ? queued : null;
  // `shown` is what we draw. It outlives `current` while the pop-up animates away,
  // so it can leave smoothly and tell us when it has really gone.
  const [shown, setShown] = useState<DialogEntry | null>(null);
  // The native Modal layer is up. On iOS it lingers until onDismiss, and nothing
  // native (camera, photo library) may open before that.
  const [layerUp, setLayerUp] = useState(false);
  const [closing, setClosing] = useState(false);

  const insets = useSafeAreaInsets();
  const corners = useScreenCorners();
  const { height: screenH } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const { f, direction } = useFont();
  const { t } = useT();

  // 0 = off screen, 1 = in place. `drag` is how far the finger has pulled the sheet down.
  const progress = useSharedValue(0);
  const drag = useSharedValue(0);
  const sheetH = useSharedValue(screenH);

  // Open the next pop-up once the previous layer has fully gone.
  useEffect(() => {
    if (current && !shown && !layerUp) {
      drag.value = 0;
      progress.value = 0;
      sheetH.value = screenH; // start fully below the screen until the sheet measures itself
      setShown(current);
      setLayerUp(true);
      setDialogOnScreen(true);
      progress.value = withTiming(1, reduceMotion ? { duration: 120 } : IN);
    }
  }, [current, shown, layerUp]); // eslint-disable-line react-hooks/exhaustive-deps

  const finishClose = useCallback(() => {
    setShown(null);
    setClosing(false);
  }, []);

  // The pop-up was answered (or cancelled): ease it away.
  useEffect(() => {
    if (shown && current?.id !== shown.id && !closing) {
      setClosing(true);
      progress.value = withTiming(0, reduceMotion ? { duration: 100 } : OUT, (done) => {
        if (done) runOnJS(finishClose)();
      });
    }
  }, [current, shown, closing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Once the Modal is hidden: iOS reports through onDismiss; elsewhere it goes at once.
  useEffect(() => {
    if (shown || !layerUp || Platform.OS === 'ios') return;
    const frame = requestAnimationFrame(() => {
      setLayerUp(false);
      setDialogOnScreen(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [shown, layerUp]);

  const onDismiss = () => {
    setLayerUp(false);
    setDialogOnScreen(false);
  };

  // A warning you can feel, once per pop-up.
  useEffect(() => {
    if (shown && (shown.spec.tone === 'warning' || shown.spec.tone === 'danger')) warnFeel();
  }, [shown?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const entryId = shown?.id ?? 0;
  const cancel = useCallback(() => cancelDialog(entryId), [entryId]);

  const place = shown ? placementOf(shown.spec) : 'sheet';
  const isSheet = place === 'sheet';

  // Drag down to close. Upward pulls barely move (a little give, no bounce).
  const pan = usePanGesture({
    enabled: isSheet && !closing,
    activeOffsetY: [-12, 12],
    failOffsetX: [-24, 24],
    onUpdate: (e) => {
      'worklet';
      drag.value = e.translationY > 0 ? e.translationY : e.translationY / 8;
    },
    onDeactivate: (e) => {
      'worklet';
      const far = e.translationY > sheetH.value * motion.dismissShare;
      const fast = e.velocityY > motion.dismissVelocity;
      if (far || fast) runOnJS(cancelDialog)(entryId);
      else drag.value = withTiming(0, IN);
    },
  });

  const veilStyle = useAnimatedStyle(() => ({
    opacity: progress.value * interpolate(drag.value, [0, sheetH.value], [1, 0.2], 'clamp'),
  }));

  const sheetStyle = useAnimatedStyle(() => {
    const travel = reduceMotion ? 0 : sheetH.value + 24;
    return {
      opacity: reduceMotion ? progress.value : 1,
      transform: [{ translateY: (1 - progress.value) * travel + drag.value }],
    };
  });

  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: reduceMotion ? 1 : interpolate(progress.value, [0, 1], [0.96, 1]) }],
  }));

  if (!layerUp) return null;
  if (!shown) {
    // The pop-up has eased away; hide the Modal and keep it mounted until iOS confirms it has gone.
    return <Modal transparent visible={false} animationType="none" onDismiss={onDismiss} />;
  }

  const { spec } = shown;
  const tone = TONES[spec.tone ?? 'neutral'];
  const list = spec.layout === 'list';
  const answer = (value: unknown) => {
    if (!closing) answerDialog(shown.id, value);
  };

  const content = (
    <>
      {!list ? (
        <View style={[styles.toneCircle, { backgroundColor: tone.bg }, !isSheet && styles.toneCircleCenter]}>
          <Icon name={tone.icon} size={24} color={tone.fg} />
        </View>
      ) : null}

      <View style={styles.texts}>
        <Text
          accessibilityRole="header"
          style={[styles.title, { fontFamily: f.bold, textAlign: isSheet ? undefined : 'center' }]}
        >
          {spec.title}
        </Text>
        {spec.body ? (
          <Text style={[styles.body, { fontFamily: f.regular, textAlign: isSheet ? undefined : 'center' }]}>{spec.body}</Text>
        ) : null}
      </View>

      {list ? (
        <View>
          {spec.actions.map((a, i) => (
            <Pressable
              key={a.label}
              accessibilityRole="button"
              onPress={() => {
                selectFeel();
                answer(a.value);
              }}
              style={({ pressed }) => [styles.row, i > 0 && styles.rowLine, pressed && { opacity: 0.6 }]}
            >
              {a.icon ? (
                <View style={styles.rowIcon}>
                  <Icon name={a.icon as IconName} size={20} />
                </View>
              ) : null}
              <Text style={[styles.rowText, { fontFamily: f.medium }]}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.buttons}>
        {!list
          ? spec.actions.map((a) =>
              a.style === 'plain' ? (
                <QuietButton key={a.label} label={a.label} font={f.medium} onPress={() => answer(a.value)} />
              ) : (
                <Pressable
                  key={a.label}
                  accessibilityRole="button"
                  onPress={() => {
                    tapFeel();
                    answer(a.value);
                  }}
                  style={({ pressed }) => [
                    styles.button,
                    { backgroundColor: pressed ? tone.pressed : tone.button },
                    pressed && { transform: [{ scale: 0.98 }] },
                  ]}
                >
                  <Text style={[styles.buttonText, { fontFamily: f.medium }]}>{a.label}</Text>
                </Pressable>
              ),
            )
          : null}
        {spec.cancelLabel ? <QuietButton label={spec.cancelLabel} font={f.medium} onPress={cancel} /> : null}
      </View>
    </>
  );

  return (
    <Modal
      transparent
      visible
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={cancel}
      onDismiss={onDismiss}
    >
      {/* A Modal is its own native window, so gestures need their own root inside it. */}
      <GestureHandlerRootView style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, veilStyle]}>
          <Pressable accessibilityRole="button" accessibilityLabel={spec.cancelLabel ?? t('cancel')} onPress={cancel} style={styles.veil} />
        </Animated.View>

        {isSheet ? (
          <View pointerEvents="box-none" style={[styles.dock, { paddingHorizontal: corners.inset }]}>
            <GestureDetector gesture={pan}>
              <Animated.View
                accessibilityViewIsModal
                accessibilityRole="alert"
                onAccessibilityEscape={cancel}
                onLayout={(e) => {
                  sheetH.value = e.nativeEvent.layout.height;
                }}
                style={[
                  styles.surface,
                  styles.sheet,
                  // Floats a few points in from the sides and bottom (iOS 26 sheets), with all four
                  // corners concentric with the screen's. Its buttons keep the same gap below as
                  // beside them, clear of the home indicator.
                  {
                    direction,
                    marginBottom: corners.inset,
                    borderRadius: corners.card,
                    paddingBottom: Math.max(space.lg, insets.bottom - corners.inset),
                  },
                  sheetStyle,
                ]}
              >
                <View style={styles.grabber} />
                {content}
              </Animated.View>
            </GestureDetector>
          </View>
        ) : (
          <View pointerEvents="box-none" style={styles.middle}>
            <Animated.View
              accessibilityViewIsModal
              accessibilityRole="alert"
              onAccessibilityEscape={cancel}
              style={[styles.surface, styles.card, { direction }, cardStyle]}
            >
              {content}
            </Animated.View>
          </View>
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}

function QuietButton({ label, font, onPress }: { label: string; font: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.quiet, pressed && { opacity: 0.6 }]}
    >
      <Text style={[styles.quietText, { fontFamily: font }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  veil: { flex: 1, backgroundColor: colors.veil },
  dock: { flex: 1, justifyContent: 'flex-end' },
  middle: { flex: 1, justifyContent: 'center', paddingHorizontal: space.screen },
  surface: {
    backgroundColor: colors.surface,
    paddingHorizontal: space.lg,
    gap: space.md,
    width: '100%',
    alignSelf: 'center',
  },
  sheet: {
    paddingTop: space.sm,
    maxWidth: 560,
  },
  card: {
    borderRadius: radii.sheet,
    paddingTop: space.lg,
    paddingBottom: space.md,
    maxWidth: 380,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.lineStrong,
    marginBottom: space.xs,
  },
  toneCircle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  toneCircleCenter: { alignSelf: 'center' },
  texts: { gap: space.xs + 2 },
  title: { fontSize: 20, lineHeight: 26, color: colors.ink, letterSpacing: -0.2 },
  body: { fontSize: 15, lineHeight: 22, color: colors.inkSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
  rowIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.sunken, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, fontSize: 16, color: colors.ink },
  buttons: { gap: space.xs, marginTop: space.xs },
  button: { height: sizes.button, borderRadius: radii.capsule, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 17, color: colors.onInk },
  quiet: { height: sizes.touch + 4, alignItems: 'center', justifyContent: 'center' },
  quietText: { fontSize: 16, color: colors.ink },
});

/**
 * Pop-ups for a full-screen layer of ours (a Modal: the trip card, the search). Put it
 * inside that layer; while it is mounted, pop-ups are drawn here instead of the root.
 */
export function DialogLayer() {
  const [layer, setLayer] = useState<number | null>(null);
  useEffect(() => {
    const id = pushDialogLayer();
    setLayer(id);
    return () => popDialogLayer(id);
  }, []);
  return layer === null ? null : <DialogHost layer={layer} />;
}
