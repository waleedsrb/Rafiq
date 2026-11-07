// The big time block at the top of a trip: a small status line, 7:30 with
// AM/PM and the day, then the route (and the driver).

import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Body, useFont } from '@/components/ui';
import { clock, formatLongDay } from '@/lib/format';
import { useT } from '@/lib/session';
import type { City } from '@/lib/trip-form';
import { colors, fonts, space } from '@/theme/tokens';

export function TripHero({
  label,
  departsAt,
  origin,
  destination,
  driver,
}: {
  label?: ReactNode;
  departsAt: string;
  origin: City;
  destination: City;
  driver?: string;
}) {
  const { t, lang } = useT();
  const { f, rtl } = useFont();
  const d = new Date(departsAt);
  const { time, pm } = clock(d);
  return (
    <View style={{ gap: space.xs }}>
      {label}
      <View style={styles.timeRow}>
        <Text style={styles.time}>{time}</Text>
        <Text style={[styles.part, { fontFamily: f.regular }]}>
          {pm ? t('pm') : t('am')} · {formatLongDay(d, lang)}
        </Text>
      </View>
      <Text style={[styles.route, { fontFamily: f.bold }]}>
        {t(origin)} {rtl ? '←' : '→'} {t(destination)}
      </Text>
      {driver ? <Body muted>{driver}</Body> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  timeRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, flexWrap: 'wrap' },
  time: { fontFamily: fonts.en.bold, fontSize: 56, lineHeight: 62, color: colors.ink, letterSpacing: -1.6 },
  part: { fontSize: 15, color: colors.inkSecondary },
  route: { fontSize: 22, lineHeight: 30, color: colors.ink },
});
