// One trip in a list: route, day and time, an extra line, and the price.
// Hairline below, no card, as in the design system.

import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View, type HostInstance } from 'react-native';

import { formatDay, formatTime } from '@/lib/format';
import { placeName } from '@/lib/places';
import { useT } from '@/lib/session';
import type { City } from '@/lib/trip-form';
import { openTripFrom, type Rect } from '@/lib/trip-layer';
import { makeStyles } from '@/theme/theme';
import { fonts, space } from '@/theme/tokens';

export function TripRow({
  origin,
  destination,
  departsAt,
  priceIls,
  detail,
  signal,
  onPress,
  onPressIn,
}: {
  origin: City;
  destination: City;
  departsAt: string;
  priceIls: number;
  detail?: string;
  /** Clay text for "something needs you", e.g. a pending status. */
  signal?: string;
  /** Gets where the row is on screen, so a trip can grow out of it. */
  onPress?: (from: Rect | null) => void;
  /** As the finger lands: start loading what the tap opens, so it opens filled in. */
  onPressIn?: () => void;
}) {
  const styles = useStyles();
  const ref = useRef<HostInstance>(null);
  const { t, lang } = useT();
  const f = fonts[lang];
  const d = new Date(departsAt);
  const arrow = lang === 'ar' ? '←' : '→';

  return (
    <Pressable
      ref={ref}
      disabled={!onPress}
      onPressIn={onPressIn}
      onPress={() => onPress && openTripFrom(ref.current, '', (_id, from) => onPress(from ?? null))}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
      <View style={styles.main}>
        <Text style={[styles.route, { fontFamily: f.medium }]}>
          {placeName(origin, lang)} {arrow} {placeName(destination, lang)}
        </Text>
        <Text style={[styles.meta, { fontFamily: f.regular }]}>
          {formatDay(d, lang)} · {formatTime(d, lang)}
          {detail ? ` · ${detail}` : ''}
        </Text>
        {signal ? <Text style={[styles.signal, { fontFamily: f.medium }]}>{signal}</Text> : null}
      </View>
      <Text style={[styles.price, { fontFamily: fonts.en.medium }]}>₪{priceIls}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: colors.hairline,
  },
  main: { flex: 1, gap: 2 },
  route: { fontSize: 17, color: colors.ink },
  meta: { fontSize: 14, color: colors.inkSecondary },
  signal: { fontSize: 14, color: colors.clay },
  price: { fontSize: 17, color: colors.ink },
}));
