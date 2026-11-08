// Draws Rafiq's pop-ups (see src/lib/dialog.ts). Mounted once, in the root layout.
//
// Look (design system C5): a porcelain sheet floating near the bottom with 28pt
// corners, a tone icon, title, short text, then full-width capsule buttons with
// the main action on top and the quiet one under it. The backdrop is a soft
// graphite veil. Clay appears only for warnings and dangerous actions.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  answerDialog,
  cancelDialog,
  currentDialog,
  setCloseWaiter,
  subscribeDialogs,
  type DialogEntry,
  type DialogTone,
} from '@/lib/dialog';
import { selectFeel, tapFeel, warnFeel } from '@/lib/haptics';
import { useT } from '@/lib/session';
import { colors, radii, sizes, space } from '@/theme/tokens';

import { Icon, type IconName } from './icon';
import { useFont } from './ui';

const TONES: Record<DialogTone, { icon: IconName; fg: string; bg: string; button: string; pressed: string }> = {
  neutral: { icon: 'info', fg: colors.ink, bg: colors.sunken, button: colors.ink, pressed: colors.inkPressed },
  success: { icon: 'check', fg: colors.statusOpen, bg: colors.statusOpenSoft, button: colors.ink, pressed: colors.inkPressed },
  warning: { icon: 'warning', fg: colors.clay, bg: colors.claySoft, button: colors.clay, pressed: colors.clayPressed },
  danger: { icon: 'warning', fg: colors.clay, bg: colors.claySoft, button: colors.clay, pressed: colors.clayPressed },
};

export function DialogHost() {
  const live = useSyncExternalStore(subscribeDialogs, currentDialog, currentDialog);

  // After an answer, keep the last pop-up mounted but hidden until iOS says the
  // modal is gone, and only then hand the answer back (see setCloseWaiter).
  const [shown, setShown] = useState<DialogEntry | null>(null);
  const waiting = useRef<(() => void)[]>([]);
  useEffect(() => {
    if (live) setShown(live);
  }, [live]);
  const closed = useCallback(() => {
    const done = waiting.current;
    waiting.current = [];
    setShown(null);
    done.forEach((d) => d());
  }, []);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    return setCloseWaiter((done) => {
      if (currentDialog()) return done(); // the next pop-up reuses the open modal
      waiting.current.push(done);
      setTimeout(closed, 700); // in case onDismiss never comes
    });
  }, [closed]);

  const entry = live ?? (Platform.OS === 'ios' ? shown : null);
  const insets = useSafeAreaInsets();
  const { f, rtl, direction } = useFont();
  const { t } = useT();

  const tone = TONES[entry?.spec.tone ?? 'neutral'];
  const list = entry?.spec.layout === 'list';
  const align = rtl ? ('right' as const) : ('left' as const);

  // A warning you can feel, once per pop-up.
  useEffect(() => {
    if (entry && (entry.spec.tone === 'warning' || entry.spec.tone === 'danger')) warnFeel();
  }, [entry?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!entry) return null;
  const { spec } = entry;
  const cancel = () => cancelDialog(entry.id);

  return (
    <Modal
      transparent
      visible={!!live}
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={cancel}
      onDismiss={closed}
    >
      <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)} style={StyleSheet.absoluteFill}>
        <Pressable accessibilityRole="button" accessibilityLabel={spec.cancelLabel ?? t('cancel')} onPress={cancel} style={styles.veil} />
      </Animated.View>

      <View pointerEvents="box-none" style={[styles.place, { paddingBottom: Math.max(insets.bottom, space.sm) + space.sm }]}>
        <Animated.View
          key={entry.id}
          entering={SlideInDown.springify().damping(22).stiffness(220)}
          exiting={SlideOutDown.duration(180)}
          accessibilityViewIsModal
          accessibilityRole="alert"
          style={[styles.sheet, { direction }]}
        >
          {!list ? (
            <View style={[styles.toneCircle, { backgroundColor: tone.bg }]}>
              <Icon name={tone.icon} size={24} color={tone.fg} />
            </View>
          ) : null}

          <View style={styles.texts}>
            <Text accessibilityRole="header" style={[styles.title, { fontFamily: f.bold, textAlign: align }]}>
              {spec.title}
            </Text>
            {spec.body ? <Text style={[styles.body, { fontFamily: f.regular, textAlign: align }]}>{spec.body}</Text> : null}
          </View>

          {list ? (
            <View>
              {spec.actions.map((a, i) => (
                <Pressable
                  key={a.label}
                  accessibilityRole="button"
                  onPress={() => {
                    selectFeel();
                    answerDialog(entry.id, a.value);
                  }}
                  style={({ pressed }) => [styles.row, i > 0 && styles.rowLine, pressed && { opacity: 0.6 }]}
                >
                  {a.icon ? (
                    <View style={styles.rowIcon}>
                      <Icon name={a.icon as IconName} size={20} />
                    </View>
                  ) : null}
                  <Text style={[styles.rowText, { fontFamily: f.medium, textAlign: align }]}>{a.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={styles.buttons}>
            {!list
              ? spec.actions.map((a) =>
                  a.style === 'plain' ? (
                    <QuietButton key={a.label} label={a.label} font={f.medium} onPress={() => answerDialog(entry.id, a.value)} />
                  ) : (
                    <Pressable
                      key={a.label}
                      accessibilityRole="button"
                      onPress={() => {
                        tapFeel();
                        answerDialog(entry.id, a.value);
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
        </Animated.View>
      </View>
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
  veil: { flex: 1, backgroundColor: colors.veil },
  place: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: space.sm },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radii.sheet,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.md,
    gap: space.md,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  toneCircle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
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
