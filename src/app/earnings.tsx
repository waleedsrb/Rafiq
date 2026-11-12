// Earnings for drivers: this month's total and each finished trip, week by week.
//
// Cash pilot: passengers pay the driver in the car and posting is free, so this is
// simply the cash collected from passengers who rode. A no-show paid nothing and is
// not counted. When card payments come, my_earnings() switches to what was charged
// and a payout line can join this screen.

import { Text, View } from 'react-native';

import { Skeleton, SkeletonGroup, SkeletonList } from '@/components/skeleton';
import { Body, Label, ListRow, Screen, Title, ltr, useFont } from '@/components/ui';
import { byWeek, totals } from '@/lib/earnings';
import { formatDay, shortTime } from '@/lib/format';
import { routeName } from '@/lib/places';
import { earningsQuery } from '@/lib/queries';
import { useSession, useT } from '@/lib/session';
import { tripsKey } from '@/lib/stats';
import { useCached } from '@/lib/use-cached';
import { makeStyles } from '@/theme/theme';
import { space } from '@/theme/tokens';

export default function Earnings() {
  const styles = useStyles();
  const { t, lang } = useT();
  const { f } = useFont();
  const { session } = useSession();
  // Account starts loading this as soon as it knows you drive, so it's usually here already.
  const res = useCached(session ? earningsQuery(session.user.id) : null);
  const rows = res.data ?? null;
  const error = res.failed;

  const month = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB', { month: 'long' }).format(new Date());
  const sum = totals(rows ?? []);

  return (
    <Screen back scroll>
      <Title>{t('earningsTitle')}</Title>

      <View style={{ gap: 2 }}>
        <Body muted small>
          {lang === 'ar' ? `${t('earningsOf')} ${month}` : `${month} ${t('earningsOf')}`}
        </Body>
        {rows ? (
          <>
            <Text style={[styles.big, { fontFamily: f.bold }]}>{ltr(`${sum.amount}₪`)}</Text>
            <Body muted small>
              {t('fromWord')} {ltr(sum.trips)} {t(tripsKey(sum.trips))}
            </Body>
          </>
        ) : (
          // Never a "0₪" that turns into the real amount a moment later.
          <SkeletonGroup style={{ gap: 2 }}>
            <Skeleton width={120} height={40} radius={10} style={{ marginVertical: 6 }} />
            <Skeleton width={90} height={12} style={{ marginVertical: 3 }} />
          </SkeletonGroup>
        )}
      </View>

      {rows === null ? (
        error ? <Body muted>{t('somethingWrong')}</Body> : <SkeletonList rows={3} />
      ) : rows.length === 0 ? (
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

const useStyles = makeStyles((colors) => ({
  big: { fontSize: 44, lineHeight: 52, color: colors.ink },
  weekHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amount: { fontSize: 16, color: colors.ink },
}));
