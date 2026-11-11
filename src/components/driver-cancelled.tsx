// "Sorry, your trip was cancelled": what a passenger sees on Trip details when the
// driver cancels. It says how late it was, that no money is lost, whether it counts
// against the driver, and offers the other trips on the same route that day.

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Body, Button, IconCircle, Label, ListRow, ltr, useFont } from '@/components/ui';
import { noticeGiven } from '@/lib/earnings';
import { shortTime } from '@/lib/format';
import { useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { useOpenTrip } from '@/lib/trip-layer';
import type { City } from '@/lib/trip-form';
import { makeStyles, useTheme } from '@/theme/theme';
import { space } from '@/theme/tokens';

type Other = {
  id: string;
  departs_at: string;
  seats_left: number;
  price_ils: number;
  driver_first_name: string;
  driver_last_initial: string;
  car_model: string | null;
};

export function DriverCancelled({
  tripId,
  origin,
  destination,
  departsAt,
  cancelledAt,
  late,
  excused,
  refunded,
  onSearchAgain,
}: {
  tripId: string;
  origin: City;
  destination: City;
  departsAt: string;
  cancelledAt: string;
  late: boolean;
  excused: boolean;
  /** The amount given back to a card, or null when nothing was paid (cash pilot). */
  refunded: number | null;
  /** Inside the trip card: go back to the search instead of opening a results page. */
  onSearchAgain?: () => void;
}) {
  const { c: colors } = useTheme();
  const styles = useStyles();
  const { t } = useT();
  const openTrip = useOpenTrip();
  const { f } = useFont();
  const [others, setOthers] = useState<Other[] | null>(null);
  const departs = new Date(departsAt);

  useEffect(() => {
    const start = new Date(departs);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    supabase
      .rpc('search_trips', {
        p_origin: origin,
        p_destination: destination,
        p_from: start.toISOString(),
        p_to: end.toISOString(),
      })
      .then(({ data }) => setOthers(((data as Other[] | null) ?? []).filter((o) => o.id !== tripId && o.seats_left > 0)));
  }, [tripId, origin, destination, departsAt]);

  const notice = noticeGiven(new Date(cancelledAt), departs);
  const n = 'hours' in notice ? notice.hours : notice.minutes;
  const few = n >= 3 && n <= 10;
  const unit =
    'hours' in notice ? t(n === 1 ? 'hourWordOne' : few ? 'hoursWordFew' : 'hoursWord') : t(few ? 'minutesWordFew' : 'minutesWord');

  // Search again opens results for the same day (days from today).
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayStart = new Date(departs);
  dayStart.setHours(0, 0, 0, 0);
  const day = Math.max(0, Math.round((dayStart.getTime() - today.getTime()) / 86_400_000));

  return (
    <View style={{ gap: space.md }}>
      <View style={{ gap: 4 }}>
        <View style={styles.row}>
          <Icon name="warning" size={16} color={colors.clay} />
          <Text style={[styles.clay, { fontFamily: f.medium }]}>
            {t('cancelledHoursBefore').replace('{n}', `${ltr(n)} ${unit}`)}
          </Text>
        </View>
        <Text style={[styles.title, { fontFamily: f.bold }]}>{t('sorryCancelled')}</Text>
        <Body muted>{refunded === null ? t('cancelledCashNote') : t('cancelledRefund').replace('{amount}', ltr(`${refunded}₪`))}</Body>
        {excused ? (
          <Body muted small>
            {t('cancelExcused')}
          </Body>
        ) : late ? (
          <Body muted small>
            {t('cancelCounts')}
          </Body>
        ) : null}
      </View>

      {others === null ? null : (
        <View style={{ gap: space.xs }}>
          <Label>{t('otherTripsThatDay')}</Label>
          {others.length === 0 ? (
            <Body muted>{t('noOtherTrips')}</Body>
          ) : (
            others.map((o, i) => (
              <ListRow
                key={o.id}
                last={i === others.length - 1}
                leading={<IconCircle letter={o.driver_first_name.charAt(0)} />}
                title={[o.driver_first_name, o.driver_last_initial ? `${o.driver_last_initial}.` : ''].filter(Boolean).join(' ')}
                subtitle={[o.car_model, `${ltr(o.seats_left)} ${t('seatsFree')}`, ltr(`${o.price_ils}₪`)].filter(Boolean).join(' · ')}
                trailing={<Text style={[styles.time, { fontFamily: f.bold }]}>{ltr(shortTime(new Date(o.departs_at)))}</Text>}
                onPress={() => openTrip(o.id)}
              />
            ))
          )}
        </View>
      )}

      <Button
        variant="secondary"
        label={t('searchAgain')}
        icon="search"
        onPress={() =>
          onSearchAgain ? onSearchAgain() : router.push({
            pathname: '/trips/results',
            params: { origin, destination, day: String(day) },
          })
        }
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  clay: { fontSize: 14, color: colors.clay, flexShrink: 1 },
  title: { fontSize: 22, lineHeight: 28, color: colors.ink },
  time: { fontSize: 20, color: colors.ink },
}));
