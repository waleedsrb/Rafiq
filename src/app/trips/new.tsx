// Driver posts a trip: route, day, time, seats, price.

import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import { Body, Button, ChipRow, Field, Label, Screen, Stepper, Title } from '@/components/ui';
import { formatDay } from '@/lib/format';
import { useSession, useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { SEATS_MAX, SEATS_MIN, departureFrom, parsePrice, type City } from '@/lib/trip-form';

type Route = `${City}>${City}`;

export default function NewTrip() {
  const { t, lang } = useT();
  const { session } = useSession();

  const [route, setRoute] = useState<Route>('ramallah>nablus');
  const [day, setDay] = useState(0);
  const [time, setTime] = useState('');
  const [seats, setSeats] = useState(3);
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // No car yet? Add it first (the database would refuse the trip anyway).
  useEffect(() => {
    if (!session) return;
    supabase
      .from('driver_details')
      .select('driver_id')
      .eq('driver_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) router.replace('/car');
      });
  }, [session]);

  // Today plus the next 6 days. Drivers post a week ahead at most for now.
  const days = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      const label = i === 0 ? t('today') : i === 1 ? t('tomorrow') : formatDay(d, lang);
      return { value: i, label };
    });
  }, [t, lang]);

  // Arabic reads right to left, so the arrow points left toward the destination.
  const routeLabel = (from: City, to: City) => `${t(from)} ${lang === 'ar' ? '←' : '→'} ${t(to)}`;

  async function publish() {
    const departsAt = departureFrom(day, time, new Date());
    if (!departsAt) return setError(t('timeInvalid'));
    const priceIls = parsePrice(price);
    if (priceIls === null) return setError(t('priceInvalid'));
    if (!session) return;

    const [origin, destination] = route.split('>') as [City, City];
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from('trips').insert({
      driver_id: session.user.id,
      origin,
      destination,
      departs_at: departsAt.toISOString(), // stored in UTC, shown in local time
      seats_total: seats,
      price_ils: priceIls,
    });
    setSaving(false);
    if (err) return setError(t('somethingWrong'));
    router.back();
  }

  return (
    <Screen scroll footer={<Button label={t('publish')} onPress={publish} loading={saving} disabled={!time || !price} />}>
      <Title>{t('postTripTitle')}</Title>

      <Label>{t('routeLabel')}</Label>
      <ChipRow
        value={route}
        onChange={setRoute}
        options={[
          { value: 'ramallah>nablus', label: routeLabel('ramallah', 'nablus') },
          { value: 'nablus>ramallah', label: routeLabel('nablus', 'ramallah') },
        ]}
      />

      <Label>{t('dayLabel')}</Label>
      <ChipRow value={day} onChange={setDay} options={days} />

      <Label>{t('timeLabel')}</Label>
      <Field ltr value={time} onChangeText={(v) => { setTime(v); setError(null); }} placeholder="07:30" keyboardType="numbers-and-punctuation" maxLength={5} />

      <Label>{t('seatsLabel')}</Label>
      <Stepper value={seats} min={SEATS_MIN} max={SEATS_MAX} onChange={setSeats} />

      <Label>{t('priceLabel')}</Label>
      <Field ltr value={price} onChangeText={(v) => { setPrice(v); setError(null); }} placeholder="25" keyboardType="decimal-pad" maxLength={6} />

      {error ? <Body error>{error}</Body> : null}
    </Screen>
  );
}
