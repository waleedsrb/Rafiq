// Driver: see who asked for a seat on one of your trips, and accept or decline.
// The database decides whether a change is allowed (guard_booking): only the
// driver may accept, and an accept fails if the car would be overbooked.

import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ContactCard } from '@/components/contact-card';
import { TripRow } from '@/components/trip-row';
import { Body, Button, Label, Screen, Title } from '@/components/ui';
import type { StringKey } from '@/i18n/strings';
import { useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import type { City } from '@/lib/trip-form';
import { colors, fonts, space } from '@/theme/tokens';

type Trip = { id: string; origin: City; destination: City; departs_at: string; price_ils: number };
type Request = {
  id: string;
  status: string;
  seats: number;
  profiles: { full_name: string }; // the passenger
};

export default function TripRequests() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useT();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const [seatsLeft, setSeatsLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // booking id being updated
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const [tripRes, reqRes, seatsRes] = await Promise.all([
      supabase.from('trips').select('id, origin, destination, departs_at, price_ils').eq('id', id).single(),
      supabase
        .from('bookings')
        .select('id, status, seats, profiles!bookings_passenger_id_fkey(full_name)')
        .eq('trip_id', id)
        .order('created_at'),
      supabase.rpc('seats_left', { p_trip_id: id }),
    ]);
    setTrip((tripRes.data as Trip | null) ?? null);
    setRequests((reqRes.data as unknown as Request[] | null) ?? []);
    setSeatsLeft((seatsRes.data as number | null) ?? null);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(bookingId: string, status: 'accepted' | 'declined') {
    setBusy(bookingId);
    setError(null);
    const { error: err } = await supabase.from('bookings').update({ status }).eq('id', bookingId);
    setBusy(null);
    if (err) {
      // The database's own message tells us which rule stopped it.
      setError(err.message.includes('Not enough seats') ? t('noSeatsLeft') : t('somethingWrong'));
    }
    await load();
  }

  if (!trip) return <Screen>{null}</Screen>;
  const f = fonts[lang];

  return (
    <Screen scroll>
      <Title>{t('requestsTitle')}</Title>
      <TripRow
        origin={trip.origin}
        destination={trip.destination}
        departsAt={trip.departs_at}
        priceIls={trip.price_ils}
        detail={seatsLeft !== null ? `${seatsLeft} ${t('seatsLeft')}` : undefined}
      />

      <Label>{t('requestsTitle')}</Label>
      {requests.length === 0 ? <Body muted>{t('noRequests')}</Body> : null}
      {requests.map((r) => (
        <View key={r.id} style={styles.request}>
          <View style={styles.who}>
            <Text style={[styles.name, { fontFamily: f.medium }]}>{r.profiles.full_name.split(' ')[0]}</Text>
            <Text
              style={[
                styles.status,
                { fontFamily: f.regular },
                r.status === 'requested' && { color: colors.clay },
              ]}
            >
              {t(`status_${r.status}` as StringKey)}
            </Text>
          </View>
          {r.status === 'accepted' ? <ContactCard bookingId={r.id} /> : null}
          {r.status === 'requested' ? (
            <View style={styles.actions}>
              <View style={styles.action}>
                <Button
                  variant="plain"
                  label={t('decline')}
                  onPress={() => decide(r.id, 'declined')}
                  disabled={busy !== null}
                />
              </View>
              <View style={styles.action}>
                <Button
                  label={t('accept')}
                  onPress={() => decide(r.id, 'accepted')}
                  loading={busy === r.id}
                  disabled={busy !== null && busy !== r.id}
                />
              </View>
            </View>
          ) : null}
        </View>
      ))}
      {error ? <Body error>{error}</Body> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  request: {
    paddingVertical: space.md,
    gap: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: colors.hairline,
  },
  who: { gap: 2 },
  name: { fontSize: 17, color: colors.ink },
  status: { fontSize: 14, color: colors.inkSecondary },
  actions: { flexDirection: 'row', gap: space.sm },
  action: { flex: 1 },
});
