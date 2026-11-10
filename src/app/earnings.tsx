// Earnings for drivers: this month's total and each finished trip, week by week.
//
// Cash pilot: passengers pay the driver in the car and posting is free, so this is
// simply the cash collected from passengers who rode. A no-show paid nothing and is
// not counted. When card payments come, my_earnings() switches to what was charged
// and a payout line can join this screen.

import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Body, Label, ListRow, Screen, Title, ltr, useFont } from '@/components/ui';
import { byWeek, monthRange, totals, type EarningRow } from '@/lib/earnings';
import { formatDay, shortTime } from '@/lib/format';
import { routeName } from '@/lib/places';
import { useT } from '@/lib/session';
import { tripsKey } from '@/lib/stats';
import { supabase } from '@/lib/supabase';
import { colors, space } from '@/theme/tokens';

export default function Earnings() {
  const { t, lang } = useT();
  const { f } = useFont();
  const [rows, setRows] = useState<EarningRow[] | null>(null);
  const [error, setError] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const { from, to } = monthRange(new Date());
      supabase
        .rpc('my_earnings', {
          p_from: from.toISOString(),
          p_to: to.toISOString(),
        })
        .then(({ data, error: err }) => {
          setError(!!err);
          setRows((data as EarningRow[] | null) ?? []);
        });
    }, []),
  );

  const month = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB', { month: 'long' }).format(new Date());
  const sum = totals(rows ?? []);

  return (
    <Screen back scroll>
      <Title>{t('earningsTitle')}</Title>

      <View style={{ gap: 2 }}>
        <Body muted small>
          {lang === 'ar' ? `${t('earningsOf')} ${month}` : `${month} ${t('earningsOf')}`}
        </Body>
        <Text style={[styles.big, { fontFamily: f.bold }]}>{ltr(`${sum.amount}₪`)}</Text>
        <Body muted small>
          {t('fromWord')} {ltr(sum.trips)} {t(tripsKey(sum.trips))}
        </Body>
      </View>

      {rows === null ? null : rows.length === 0 ? (
        <Body muted>{error ? t('somethingWrong') : t('noEarningsYet')}</Body>
      ) : (
        byWeek(rows).map((week) => (
          <View key={week.weekStart.toISOString()} style={{ gap: space.xs }}>
            <View style={styles.weekHead}>
              <Label>{`${t('weekOf')} ${formatDay(week.weekStart, lang)}`}</Label>
              <Body muted small>
                {ltr(`${week.amount}₪`)}
              </Body>
            </View>
            {week.rows.map((r, i) => {
              const d = new Date(r.departs_at);
              const who = [`${ltr(r.riders)} ${t(r.riders === 1 ? 'ridersOne' : 'ridersMany')}`];
              if (r.no_shows > 0) who.push(`${ltr(r.no_shows)} ${t('noShowsWord')}`);
              return (
                <ListRow
                  key={r.trip_id}
                  last={i === week.rows.length - 1}
                  icon="car"
                  title={routeName(r.origin, r.destination, lang)}
                  subtitle={`${formatDay(d, lang)} ${ltr(shortTime(d))} · ${who.join(', ')}`}
                  trailing={<Text style={[styles.amount, { fontFamily: f.bold }]}>{ltr(`+${Number(r.earned_ils)}₪`)}</Text>}
                />
              );
            })}
          </View>
        ))
      )}

      <Body muted small>
        {t('earningsCashNote')}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  big: { fontSize: 44, lineHeight: 52, color: colors.ink },
  weekHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amount: { fontSize: 16, color: colors.ink },
});
