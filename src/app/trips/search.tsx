// Passenger: pick a direction and a day, see trips with free seats.

import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import { TripRow } from '@/components/trip-row';
import { Body, ChipRow, Label, Screen, Title } from '@/components/ui';
import { formatDay } from '@/lib/format';
import { useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import type { City } from '@/lib/trip-form';

type Route = `${City}>${City}`;

type Result = {
  id: string;
  departs_at: string;
  seats_total: number;
  seats_left: number;
  price_ils: number;
  driver_first_name: string;
};

export default function Search() {
  const { t, lang } = useT();
  const [route, setRoute] = useState<Route>('ramallah>nablus');
  const [day, setDay] = useState(0);
  const [results, setResults] = useState<Result[] | null>(null);

  const [origin, destination] = route.split('>') as [City, City];
  const arrow = lang === 'ar' ? '←' : '→';

  const days = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      const label = i === 0 ? t('today') : i === 1 ? t('tomorrow') : formatDay(d, lang);
      return { value: i, label };
    });
  }, [t, lang]);

  useEffect(() => {
    // The chosen day, from local midnight to the next midnight.
    const from = new Date();
    from.setDate(from.getDate() + day);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);

    let cancelled = false; // ignore answers that arrive after the person changed their pick
    setResults(null);
    supabase
      .rpc('search_trips', {
        p_origin: origin,
        p_destination: destination,
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      })
      .then(({ data }) => {
        if (!cancelled) setResults((data as Result[] | null) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [origin, destination, day]);

  return (
    <Screen scroll>
      <Title>{t('findSeatTitle')}</Title>

      <ChipRow
        value={route}
        onChange={setRoute}
        options={[
          { value: 'ramallah>nablus', label: `${t('ramallah')} ${arrow} ${t('nablus')}` },
          { value: 'nablus>ramallah', label: `${t('nablus')} ${arrow} ${t('ramallah')}` },
        ]}
      />
      <Label>{t('dayLabel')}</Label>
      <ChipRow value={day} onChange={setDay} options={days} />

      {results?.length === 0 ? <Body muted>{t('noResults')}</Body> : null}
      {results?.map((r) => (
        <TripRow
          key={r.id}
          origin={origin}
          destination={destination}
          departsAt={r.departs_at}
          priceIls={r.price_ils}
          detail={`${r.driver_first_name} · ${r.seats_left > 0 ? `${r.seats_left} ${t('seatsLeft')}` : t('full')}`}
          onPress={() => router.push({ pathname: '/trips/[id]', params: { id: r.id } })}
        />
      ))}
    </Screen>
  );
}
