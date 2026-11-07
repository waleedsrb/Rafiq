// One trip in a list: route, day and time, an extra line, and the price.
// Hairline below, no card, as in the design system.

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDay, formatTime } from '@/lib/format';
import { useT } from '@/lib/session';
import type { City } from '@/lib/trip-form';
import { colors, fonts, space } from '@/theme/tokens';

export function TripRow({
  origin,
  destination,
  departsAt,
  priceIls,
  detail,
  signal,
  onPress,
}: {
  origin: City;
  destination: City;
  departsAt: string;
  priceIls: number;
  detail?: string;
  /** Clay text for "something needs you", e.g. a pending status. */
  signal?: string;
  onPress?: () => void;
}) {
  const { t, lang } = useT();
  const f = fonts[lang];
  const d = new Date(departsAt);
  const arrow = lang === 'ar' ? '←' : '→';

  return (
    <Pressable disabled={!onPress} onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
      <View style={styles.main}>
        <Text style={[styles.route, { fontFamily: f.medium }]}>
          {t(origin)} {arrow} {t(destination)}
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

const styles = StyleSheet.create({
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
});
