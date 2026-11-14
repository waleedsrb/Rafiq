// From / To in one white card, with an optional button to flip the direction.

import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { useFont } from '@/components/ui';
import { placeName } from '@/lib/places';
import { useT } from '@/lib/session';
import type { City } from '@/lib/trip-form';
import { useOneLine } from '@/theme/text-size';
import { makeStyles, useTheme } from '@/theme/theme';
import { radii, space } from '@/theme/tokens';

/** From / To in one white card, with a button to flip the direction. */
export function RouteCard({
  origin,
  destination,
  onSwap,
  onPick,
  note,
}: {
  origin: City;
  destination: City;
  onSwap?: () => void;
  /** Tap a row to change that end (opens the place search). */
  onPick?: (end: 'origin' | 'destination') => void;
  /** Small grey text at the end of the first row, e.g. the date. */
  note?: string;
}) {
  const { c: colors } = useTheme();
  const styles = useStyles();
  const { t, lang } = useT();
  const { f, rtl } = useFont();
  const one = useOneLine();
  const row = (city: City, label: string, mark: 'start' | 'end') => {
    const inner = (
      <>
        <View style={mark === 'start' ? styles.markStart : styles.markEnd} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardLabel, { fontFamily: f.regular }]}>{label}</Text>
          <Text style={[styles.cardCity, { fontFamily: f.medium }]} numberOfLines={one}>{placeName(city, lang)}</Text>
        </View>
        {mark === 'start' && note ? <Text style={[styles.cardLabel, { fontFamily: f.regular }]}>{note}</Text> : null}
        {onPick ? <Icon name={rtl ? 'caretLeft' : 'caretRight'} size={16} color={colors.inkSecondary} /> : null}
      </>
    );
    if (!onPick) return <View style={styles.cardRow}>{inner}</View>;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} ${placeName(city, lang)}`}
        onPress={() => onPick(mark === 'start' ? 'origin' : 'destination')}
        style={({ pressed }) => [styles.cardRow, pressed && { opacity: 0.6 }]}
      >
        {inner}
      </Pressable>
    );
  };
  return (
    <View style={styles.card}>
      <View style={{ flex: 1 }}>
        {row(origin, t('fromLabel'), 'start')}
        <View style={styles.cardLine} />
        {row(destination, t('toLabel'), 'end')}
      </View>
      {onSwap ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t('swapDirection')} onPress={onSwap} hitSlop={4} style={styles.swap}>
          <Icon name="arrowsDownUp" size={20} />
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.card,
    borderRadius: radii.container,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: space.md,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60 },
  cardLine: { height: 1, backgroundColor: colors.hairline, marginStart: 26 },
  cardLabel: { fontSize: 12, color: colors.inkSecondary },
  cardCity: { fontSize: 17, color: colors.ink },
  markStart: { width: 12, height: 12, borderRadius: 6, borderWidth: 2.5, borderColor: colors.ink },
  markEnd: { width: 12, height: 12, borderRadius: 2, backgroundColor: colors.ink },
  swap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.sunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
