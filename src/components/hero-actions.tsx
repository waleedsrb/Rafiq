// The one row of quick actions at the bottom of the Home hero (Nov 11, "Hero quick actions").
//
// Rules, so the row never wraps and no text spills onto a second line:
//   - The row is a fixed 40pt high: at most one 40pt circle (call, or a photo) and two capsules.
//   - Capsules share the width equally. Labels are one line; if a language runs long, the
//     text shrinks to 85% and then ends with "…". Labels are written to fit (en ≤ 14, ar ≤ 12).
//   - Three or more answers never open a menu: the caption becomes the follow-up question
//     (with Back at its end) and the same row shows the answers. The card keeps its size.
//   - After an answer the row says what was saved, with Undo for 5 seconds, instead of an
//     "Are you sure?" pop-up. The answer is sent when the 5 seconds end (or when you leave Home).
//   - Every capsule carries the full sentence for screen readers.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ltr, useFont } from '@/components/ui';
import { tapFeel } from '@/lib/haptics';
import { useT } from '@/lib/session';
import { makeStyles, useTheme } from '@/theme/theme';

export const UNDO_SECONDS = 5;
const ROW = 40;

export function ActionRow({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <View style={styles.row}>{children}</View>;
}

/** A 40pt capsule. `hug` keeps it to its label (Accept, Undo); otherwise capsules share the row. */
export function Capsule({
  label,
  a11y,
  onPress,
  variant = 'outline',
  hug,
  icon,
  disabled,
  testID,
}: {
  label: string;
  /** The full sentence a screen reader says, when the label is shortened. */
  a11y?: string;
  onPress: () => void;
  variant?: 'solid' | 'outline' | 'quiet';
  hug?: boolean;
  icon?: IconName;
  disabled?: boolean;
  /** A stable name for the end-to-end tests (e2e/). */
  testID?: string;
}) {
  const { c: colors } = useTheme();
  const styles = useStyles();
  const { f } = useFont();
  const solid = variant === 'solid';
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      onPress={() => {
        tapFeel();
        onPress();
      }}
      disabled={disabled}
      hitSlop={4}
      style={({ pressed }) => [
        styles.capsule,
        hug ? styles.hug : styles.share,
        solid && styles.solid,
        variant === 'quiet' && styles.quiet,
        pressed && (solid ? { backgroundColor: colors.inkPressed } : { opacity: 0.6 }),
        disabled && { opacity: 0.5 },
      ]}
    >
      {icon ? <Icon name={icon} size={16} color={solid ? colors.onInk : colors.ink} /> : null}
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
        style={[styles.label, { fontFamily: f.medium }, solid && { color: colors.onInk }, variant === 'quiet' && { color: colors.inkSecondary }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** The dark 40pt circle with a phone, as on the pickup rows. */
export function CallCircle({ label, onPress }: { label: string; onPress: () => void }) {
  const { c: colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.call, pressed && { backgroundColor: colors.inkPressed }]}
    >
      <Icon name="phone" size={18} color={colors.onInk} />
    </Pressable>
  );
}

/** A quiet "✓ done" line in the row's place, same height, so nothing below moves. */
export function DoneLine({ label }: { label: string }) {
  const styles = useStyles();
  const { f } = useFont();
  return (
    <View style={styles.row} accessible accessibilityLabel={label}>
      <Icon name="check" size={16} />
      <Text numberOfLines={1} style={[styles.done, { fontFamily: f.medium }]}>
        {label}
      </Text>
    </View>
  );
}

type Pending = { label: string; send: () => PromiseLike<unknown>; left: number };

/**
 * Hold an answer for 5 seconds so it can be undone, then send it.
 * `onSent(ok)` runs after sending (reload Home, or show an error).
 */
export function useUndoable(onSent: (ok: boolean) => void) {
  const [pending, setPending] = useState<Pending | null>(null);
  const ref = useRef<Pending | null>(null);
  ref.current = pending;
  const sentCb = useRef(onSent);
  sentCb.current = onSent;

  const send = useCallback(async (p: Pending) => {
    setPending(null);
    ref.current = null;
    let ok = true;
    try {
      const res = (await p.send()) as { error?: unknown } | undefined;
      ok = !res?.error;
    } catch {
      ok = false;
    }
    sentCb.current(ok);
  }, []);

  useEffect(() => {
    if (!pending) return;
    if (pending.left <= 0) {
      send(pending);
      return;
    }
    const timer = setTimeout(() => setPending((p) => (p ? { ...p, left: p.left - 1 } : p)), 1000);
    return () => clearTimeout(timer);
  }, [pending, send]);

  // Leaving Home within the 5 seconds still sends the answer.
  useEffect(
    () => () => {
      if (ref.current) {
        ref.current.send();
        ref.current = null;
      }
    },
    [],
  );

  const run = useCallback((label: string, fn: () => PromiseLike<unknown>) => setPending({ label, send: fn, left: UNDO_SECONDS }), []);
  const undo = useCallback(() => setPending(null), []);
  return { pending, run, undo };
}

/** What the row shows while an answer can still be undone. */
export function UndoRow({ label, left, onUndo }: { label: string; left: number; onUndo: () => void }) {
  const styles = useStyles();
  const { t } = useT();
  const { f } = useFont();
  return (
    <View style={styles.row}>
      <Icon name="check" size={16} />
      <Text numberOfLines={1} style={[styles.done, { fontFamily: f.medium }]} accessibilityLiveRegion="polite">
        {label}
      </Text>
      <Capsule hug label={`${t('notificationUndo')} · ${ltr(left)}`} a11y={t('notificationUndo')} onPress={onUndo} />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  row: { height: ROW, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  capsule: {
    height: ROW,
    borderRadius: ROW / 2,
    borderWidth: 1.5,
    borderColor: colors.ink,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  share: { flex: 1, flexBasis: 0, minWidth: 0 },
  hug: { flexShrink: 0, paddingHorizontal: 18 },
  solid: { backgroundColor: colors.ink, borderColor: colors.ink },
  quiet: { borderColor: colors.hairline },
  label: { fontSize: 15, color: colors.ink, flexShrink: 1 },
  call: { width: ROW, height: ROW, borderRadius: ROW / 2, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  done: { flex: 1, fontSize: 14, color: colors.ink },
}));
