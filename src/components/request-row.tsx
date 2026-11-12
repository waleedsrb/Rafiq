// One ride request on the driver's trip card, in a single row (option A, Nov 10):
// the time left drains as a ring around the rider's photo, then a small ✕ (decline)
// and an Accept capsule. Tapping the row opens the rider's profile.
//
// The ring starts at 12 o'clock and runs clockwise; in Arabic it runs the other way,
// the same way the reading direction flips.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { StatsLine } from '@/components/stats-line';
import { ltr, useFont } from '@/components/ui';
import type { Stats } from '@/lib/stats';
import { useT } from '@/lib/session';
import { makeStyles, useTheme } from '@/theme/theme';
import { fonts, space } from '@/theme/tokens';

const AVATAR = 44;
const RING = 54;
const STROKE = 3;
const R = (RING - STROKE) / 2;
const C = 2 * Math.PI * R;

export function RequestRow({
  name,
  seats,
  avatarPath,
  seed,
  stats,
  remaining,
  progress,
  onOpen,
  onAccept,
  onDecline,
  accepting,
  disabled,
}: {
  name: string;
  seats: number;
  avatarPath: string | null;
  seed: string;
  stats?: Stats;
  /** Time left to answer, already formatted ("1:53:22"); null when there is no deadline. */
  remaining: string | null;
  /** 1 = just asked, 0 = time is up. */
  progress: number;
  onOpen: () => void;
  onAccept: () => void;
  onDecline: () => void;
  accepting: boolean;
  disabled: boolean;
}) {
  const { c: colors } = useTheme();
  const styles = useStyles();
  const { t } = useT();
  const { f, rtl } = useFont();
  const left = Math.max(0, Math.min(1, progress));
  const first = name.split(' ')[0];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${seats} ${t('seatOne')}${remaining ? `, ${t('answerWithin')} ${remaining}` : ''}`}
      onPress={onOpen}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
    >
      <View style={styles.ring}>
        {remaining ? (
          <Svg
            width={RING}
            height={RING}
            style={[StyleSheet.absoluteFill, { transform: rtl ? [{ scaleX: -1 }, { rotate: '-90deg' }] : [{ rotate: '-90deg' }] }]}
          >
            <Circle cx={RING / 2} cy={RING / 2} r={R} stroke={colors.claySoft} strokeWidth={STROKE} fill="none" />
            <Circle
              cx={RING / 2}
              cy={RING / 2}
              r={R}
              stroke={colors.clay}
              strokeWidth={STROKE}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${C} ${C}`}
              strokeDashoffset={C * (1 - left)}
            />
          </Svg>
        ) : null}
        <Avatar path={avatarPath} name={name} seed={seed} size={AVATAR} />
        {remaining ? (
          <View style={styles.left}>
            <Text style={[styles.leftText, { fontFamily: fonts.en.bold }]}>{ltr(remaining)}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.who}>
        <Text numberOfLines={1} style={[styles.name, { fontFamily: f.medium }]}>
          {name}
          <Text style={[styles.seats, { fontFamily: f.regular }]}>
            {'  ·  '}
            {ltr(seats)} {t('seatOne')}
          </Text>
        </Text>
        <StatsLine stats={stats} showBadge={false} />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('declineSorry')} ${first}`}
        onPress={onDecline}
        disabled={disabled}
        hitSlop={4}
        style={({ pressed }) => [styles.decline, (pressed || disabled) && { opacity: 0.5 }]}
      >
        <Icon name="x" size={16} color={colors.ink} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('acceptName').replace('{name}', first)}
        onPress={onAccept}
        disabled={disabled}
        hitSlop={4}
        style={({ pressed }) => [styles.accept, pressed && { backgroundColor: colors.inkPressed }, disabled && !accepting && { opacity: 0.5 }]}
      >
        <Text style={[styles.acceptText, { fontFamily: f.medium }]}>{accepting ? '…' : t('accept')}</Text>
      </Pressable>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: space.sm },
  ring: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  left: {
    position: 'absolute',
    bottom: -8,
    alignSelf: 'center',
    paddingHorizontal: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.claySoft,
    backgroundColor: colors.surface,
  },
  leftText: { fontSize: 11, lineHeight: 15, color: colors.clay, fontVariant: ['tabular-nums'] },
  who: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 16, color: colors.ink },
  seats: { fontSize: 14, color: colors.inkSecondary },
  // 40pt circles plus 4pt hitSlop on each side keep the 48pt tap target.
  decline: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accept: {
    height: 40,
    minWidth: 76,
    paddingHorizontal: space.md,
    borderRadius: 20,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptText: { fontSize: 15, color: colors.onInk },
}));
