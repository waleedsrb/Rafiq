// Results: trips for one direction and day, earliest first,
// with a part-of-day filter you can change without going back.

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RouteCard } from '@/components/route-card';
import { Body, Chip, IconCircle, ListRow, Screen, ltr } from '@/components/ui';
import { dayPart, formatLongDay, shortTime, type DayPart } from '@/lib/format';
import { useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import type { City } from '@/lib/trip-form';
import { colors, fonts, space } from '@/theme/tokens';

type Result = {
  id: string;
  departs_at: string;
  seats_total: number;
  seats_left: number;
  price_ils: number;
  driver_first_name: string;
  driver_last_initial: string;
  car_model: string | null;
};

const PARTS: DayPart[] = ['morning', 'afternoon', 'evening'];
const partLabel = { morning: 'partMorning', afternoon: 'partAfternoon', evening: 'partEvening' } as const;

export default function Results() {
  const { t, lang } = useT();
  const params = useLocalSearchParams<{ origin: City; destination: City; day: string; part?: DayPart }>();
  const origin: City = params.origin === 'nablus' ? 'nablus' : 'ramallah';
  const destination: City = origin === 'ramallah' ? 'nablus' : 'ramallah';
  const day = Number(params.day ?? 0) || 0;
  const [part, setPart] = useState<DayPart | null>(params.part && PARTS.includes(params.part) ? params.part : null);
  const [results, setResults] = useState<Result[] | null>(null);

  // The chosen day, from local midnight to the next midnight.
  const from = new Date();
  from.setDate(from.getDate() + day);
  from.setHours(0, 0, 0, 0);
  const fromIso = from.toISOString();

  useEffect(() => {
    const start = new Date(fromIso);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    let cancelled = false; // ignore answers that arrive after leaving the screen
    supabase
      .rpc('search_trips', { p_origin: origin, p_destination: destination, p_from: start.toISOString(), p_to: end.toISOString() })
      .then(({ data }) => {
        if (!cancelled) setResults((data as Result[] | null) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [origin, destination, fromIso]);

  const shown = (results ?? []).filter((r) => !part || dayPart(new Date(r.departs_at)) === part);

  return (
    <Screen back scroll>
      <RouteCard origin={origin} destination={destination} note={formatLongDay(from, lang)} />

      <View style={styles.chips}>
        {PARTS.map((p) => (
          <Chip key={p} label={t(partLabel[p])} selected={part === p} onPress={() => setPart(part === p ? null : p)} />
        ))}
      </View>

      {results ? (
        <Body muted small>
          {ltr(shown.length)} {t('tripsCount')} · {t('earliestFirst')}
        </Body>
      ) : null}
      {results && shown.length === 0 ? <Body muted>{t('noResults')}</Body> : null}

      <View>
        {shown.map((r, i) => {
          const name = r.driver_last_initial ? `${r.driver_first_name} ${r.driver_last_initial}.` : r.driver_first_name;
          const seats = r.seats_left > 0 ? `${ltr(r.seats_left)} ${t('seatsFree')}` : t('full');
          const meta = [r.car_model, seats, ltr(`${r.price_ils}₪`)].filter(Boolean).join(' · ');
          return (
            <ListRow
              key={r.id}
              last={i === shown.length - 1}
              leading={<IconCircle letter={r.driver_first_name.charAt(0)} />}
              title={name}
              subtitle={meta}
              trailing={<Text style={[styles.time, r.seats_left === 0 && { color: colors.inkSecondary }]}>{shortTime(new Date(r.departs_at))}</Text>}
              onPress={() => router.push({ pathname: '/trips/[id]', params: { id: r.id } })}
            />
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  time: { fontFamily: fonts.en.bold, fontSize: 24, color: colors.ink, minWidth: 64, textAlign: 'right' },
});
