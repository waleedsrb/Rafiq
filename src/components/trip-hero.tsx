// The big time block at the top of a trip: a small status line, 7:30 with
// AM/PM and the day, then the route (and the driver).

import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Body, useFont } from '@/components/ui';
import { clock, formatLongDay } from '@/lib/format';
import { placeName } from '@/lib/places';
import { useT } from '@/lib/session';
import type { City } from '@/lib/trip-form';
import { makeStyles } from '@/theme/theme';
import { fonts, space } from '@/theme/tokens';

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
  const styles = useStyles();
  const { t, lang } = useT();
  const { f, rtl } = useFont();
  const d = new Date(departsAt);
  const { time, pm } = clock(d);
  return (
    <View style={{ gap: space.xs }}>
      {label}
      <View style={styles.timeRow}>
        <Text style={styles.time}>{time}</Text>
        {/* One line beside the time: a wider time (12:00) shrinks the day a little instead of
            pushing it onto its own line. */}
        <Text style={[styles.part, { fontFamily: f.regular }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
          {pm ? t('pm') : t('am')} · {formatLongDay(d, lang)}
        </Text>
      </View>
      <Text style={[styles.route, { fontFamily: f.bold }]}>
        {placeName(origin, lang)} {rtl ? '←' : '→'} {placeName(destination, lang)}
      </Text>
      {driver ? <Body muted>{driver}</Body> : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  timeRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  time: { fontFamily: fonts.en.bold, fontSize: 56, lineHeight: 62, color: colors.ink, letterSpacing: -1.6 },
  part: { fontSize: 15, color: colors.inkSecondary, flexShrink: 1 },
  route: { fontSize: 22, lineHeight: 30, color: colors.ink },
}));
