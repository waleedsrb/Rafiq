// Driver posts a trip: route, day (or weekly days), time, seats, price.

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { RouteCard } from '@/components/route-card';
import { Body, Button, Chip, ChipRow, Choice, Field, Label, ListRow, Screen, Stepper, Title, ltr } from '@/components/ui';
import { formatChipDay, formatDay, formatLongDay, shortTime } from '@/lib/format';
import { isVerifiedWoman, useSession, useT } from '@/lib/session';
import { goBack } from '@/lib/nav';
import { askForPush } from '@/lib/push';
import { WEEK, WORK_WEEK, toDbTime, toggleDay, weekdayName } from '@/lib/recurring';
import { supabase } from '@/lib/supabase';
import { SEATS_MAX, SEATS_MIN, SUGGESTED_PRICE, departureFrom, parsePrice, parseTime, type City } from '@/lib/trip-form';
import { colors, fonts, space } from '@/theme/tokens';

type Route = `${City}>${City}`;

export default function NewTrip() {
  const { t, lang } = useT();
  const { session, profile } = useSession();
  const canWomenOnly = isVerifiedWoman(profile);

  const [route, setRoute] = useState<Route>('ramallah>nablus');
  const [day, setDay] = useState(0);
  const [repeat, setRepeat] = useState<'once' | 'weekly'>('once');
  const [weekdays, setWeekdays] = useState<number[]>(WORK_WEEK);
  const [time, setTime] = useState('');
  const [seats, setSeats] = useState(3);
  const [price, setPrice] = useState(String(SUGGESTED_PRICE));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [womenOnly, setWomenOnly] = useState(false);
  // After 3 late cancels in 30 days, posting pauses for a week (see my_driving_record()).
  const [pausedUntil, setPausedUntil] = useState<Date | null>(null);

  // No car yet? Add it first. Car not checked yet? Send the driver check first.
  // (The database would refuse the trip anyway: see require_car().)
  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      supabase
        .from('driver_details')
        .select('verified_at')
        .eq('driver_id', session.user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (!data) router.push('/car');
          else if (!data.verified_at) router.replace({ pathname: '/verify', params: { kind: 'driver' } });
        });
      supabase.rpc('my_driving_record').then(({ data }) => {
        const until = (data as { paused_until: string | null }[] | null)?.[0]?.paused_until;
        setPausedUntil(until ? new Date(until) : null);
      });
    }, [session]),
  );

  // Today plus the next 6 days. Drivers post a week ahead at most for now.
  const days = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      const label = i === 0 ? t('today') : i === 1 ? t('tomorrow') : formatChipDay(d, lang);
      return { value: i, label };
    });
  }, [t, lang]);

  const [origin, destination] = route.split('>') as [City, City];

  // Riders who asked to be alerted on this route: the first day someone is waiting.
  const [demand, setDemand] = useState<{ on_date: string; waiting: number } | null>(null);
  useEffect(() => {
    let gone = false;
    supabase.rpc('alert_demand', { p_origin: origin, p_destination: destination }).then(({ data }) => {
      if (!gone) setDemand(((data as { on_date: string; waiting: number }[] | null) ?? [])[0] ?? null);
    });
    return () => {
      gone = true;
    };
  }, [origin, destination]);

  async function publish() {
    const priceIls = parsePrice(price);
    let insert;
    if (repeat === 'weekly') {
      // A weekly pattern: the server posts the real trips for the coming week, and keeps doing so.
      const tm = parseTime(time);
      if (!tm) return setError(t('timeInvalid'));
      if (priceIls === null) return setError(t('priceInvalid'));
      if (!session) return;
      insert = () =>
        supabase.from('trip_series').insert({
          driver_id: session.user.id,
          origin,
          destination,
          weekdays,
          depart_time: toDbTime(tm.h, tm.m), // a wall-clock time in Palestine
          seats_total: seats,
          price_ils: priceIls,
          women_only: canWomenOnly && womenOnly,
        });
    } else {
      const departsAt = departureFrom(day, time, new Date());
      if (!departsAt) return setError(t('timeInvalid'));
      if (priceIls === null) return setError(t('priceInvalid'));
      if (!session) return;
      insert = () =>
        supabase.from('trips').insert({
          driver_id: session.user.id,
          origin,
          destination,
          departs_at: departsAt.toISOString(), // stored in UTC, shown in local time
          seats_total: seats,
          price_ils: priceIls,
          women_only: canWomenOnly && womenOnly,
        });
    }

    setSaving(true);
    setError(null);
    const { error: err } = await insert();
    setSaving(false);
    if (err) {
      if (err.message.includes('Posting is paused')) {
        const { data } = await supabase.rpc('my_driving_record');
        const until = (data as { paused_until: string | null }[] | null)?.[0]?.paused_until;
        return setPausedUntil(until ? new Date(until) : null);
      }
      return setError(err.message.includes('not approved') ? t('driverCheckNeeded') : t('somethingWrong'));
    }
    // Now is when notifications make sense: "tell me when someone asks for a seat".
    await askForPush();
    goBack();
  }

  return (
    <Screen back scroll footer={<Button label={t('publishTrip')} onPress={publish} loading={saving} disabled={!time || !price || !!pausedUntil} />}>
      <Title>{t('postTrip')}</Title>

      {pausedUntil ? (
        <Body error>
          {t('postingPausedUntil')} {formatLongDay(pausedUntil, lang)} {ltr(shortTime(pausedUntil))} {t('postingPausedWhy')}
        </Body>
      ) : null}

      <RouteCard origin={origin} destination={destination} onSwap={() => setRoute(`${destination}>${origin}` as Route)} />

      {demand ? (
        <ListRow
          last
          icon="users"
          title={`${t('demandWaiting')}: ${ltr(demand.waiting)} · ${formatDay(new Date(`${demand.on_date}T12:00:00`), lang)}`}
          subtitle={t('demandHint')}
        />
      ) : null}

      <Choice
        value={repeat}
        onChange={setRepeat}
        options={[
          { value: 'once', label: t('tripOnce') },
          { value: 'weekly', label: t('tripWeekly') },
        ]}
      />

      {repeat === 'once' ? (
        <View style={{ gap: space.sm }}>
          <Label>{t('dayLabel')}</Label>
          <ChipRow value={day} onChange={setDay} options={days} />
        </View>
      ) : (
        <View style={{ gap: space.sm }}>
          <Label>{t('repeatDaysLabel')}</Label>
          <View style={styles.weekdays}>
            {WEEK.map((d) => (
              <Chip
                key={d}
                label={weekdayName(d, lang)}
                selected={weekdays.includes(d)}
                onPress={() => setWeekdays((cur) => toggleDay(cur, d))}
              />
            ))}
          </View>
          <Body muted small>
            {t('repeatHint')}
          </Body>
        </View>
      )}

      <Field
        label={t('departureTime')}
        ltr
        value={time}
        onChangeText={(v) => {
          setTime(v);
          setError(null);
        }}
        placeholder="07:30"
        keyboardType="numbers-and-punctuation"
        maxLength={5}
      />

      <View>
        <ListRow
          icon="users"
          title={t('seatsLabel')}
          trailing={<Stepper value={seats} min={SEATS_MIN} max={SEATS_MAX} onChange={setSeats} />}
        />
        <ListRow
          last={!canWomenOnly}
          icon="currency"
          title={t('seatPrice')}
          subtitle={`${t('suggestedPrice')} ${ltr(`${SUGGESTED_PRICE}₪`)}`}
          trailing={
            <View style={styles.priceBox}>
              <TextInput
                value={price}
                onChangeText={(v) => {
                  setPrice(v);
                  setError(null);
                }}
                keyboardType="decimal-pad"
                maxLength={6}
                style={styles.priceInput}
                accessibilityLabel={t('seatPrice')}
              />
              <Text style={styles.priceUnit}>₪</Text>
            </View>
          }
        />
        {canWomenOnly ? (
          <ListRow
            last
            icon="shieldCheck"
            title={t('womenOnly')}
            subtitle={t('womenOnlyHint')}
            trailing={<Switch value={womenOnly} onValueChange={setWomenOnly} accessibilityLabel={t('womenOnly')} />}
          />
        ) : null}
      </View>

      {error ? <Body error>{error}</Body> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  weekdays: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  priceBox: {
    flexDirection: 'row',
    direction: 'ltr',
    alignItems: 'center',
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    gap: 2,
  },
  priceInput: {
    fontFamily: fonts.en.bold,
    fontSize: 18,
    color: colors.ink,
    minWidth: 32,
    textAlign: 'right',
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', width: 40 } as object) : null),
  },
  priceUnit: { fontFamily: fonts.en.bold, fontSize: 18, color: colors.ink },
});
