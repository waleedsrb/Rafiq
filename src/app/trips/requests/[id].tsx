// Driver: see who asked for a seat on one of your trips, and accept or decline.
// The database decides whether a change is allowed (guard_booking): only the
// driver may accept, and an accept fails if the car would be overbooked.

import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BookingContact } from '@/components/contact-card';
import { SeatDots } from '@/components/seat-dots';
import { TripHero } from '@/components/trip-hero';
import { Body, Button, Countdown, IconCircle, ListRow, Screen, SectionTitle, ltr } from '@/components/ui';
import type { StringKey } from '@/i18n/strings';
import { confirm } from '@/lib/confirm';
import { formatCountdown } from '@/lib/format';
import { useBookingChanges } from '@/lib/live';
import { shortName } from '@/lib/names';
import { useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import type { City } from '@/lib/trip-form';
import { colors, space } from '@/theme/tokens';

type Trip = {
  id: string;
  origin: City;
  destination: City;
  departs_at: string;
  price_ils: number;
  cancelled_at: string | null;
};
type Request = {
  id: string;
  status: string;
  seats: number;
  respond_by: string | null;
  created_at: string;
  profiles: { full_name: string }; // the passenger
};

export default function TripRequests() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useT();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const [seatsLeft, setSeatsLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // booking id being updated
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    if (!id) return;
    const [tripRes, reqRes, seatsRes] = await Promise.all([
      supabase.from('trips').select('id, origin, destination, departs_at, price_ils, cancelled_at').eq('id', id).single(),
      supabase
        .from('bookings')
        .select('id, status, seats, respond_by, created_at, profiles!bookings_passenger_id_fkey(full_name)')
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

  // Tick once a second while someone is waiting for your answer.
  const waiting = requests.some((r) => r.status === 'requested');
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [waiting]);

  // New requests appear without pulling to refresh.
  useBookingChanges(load, id ? `trip_id=eq.${id}` : undefined);

  async function decide(bookingId: string, status: 'accepted' | 'declined') {
    setBusy(bookingId);
    setError(null);
    const { error: err } = await supabase.from('bookings').update({ status }).eq('id', bookingId);
    setBusy(null);
    if (err) {
      // The database's own message tells us which rule stopped it.
      setError(
        err.message.includes('Not enough seats')
          ? t('noSeatsLeft')
          : err.message.includes('expired')
            ? t('status_expired')
            : t('somethingWrong'),
      );
    }
    await load();
  }

  async function cancelTrip() {
    if (!trip) return;
    const ok = await confirm(t('cancelTripTitle'), t('cancelTripBody'), t('yesCancel'), t('keep'));
    if (!ok) return;
    setBusy('trip');
    setError(null);
    const { error: err } = await supabase.rpc('cancel_trip', { p_trip_id: trip.id });
    setBusy(null);
    if (err) setError(t('somethingWrong'));
    await load();
  }

  if (!trip) return <Screen back>{null}</Screen>;
  const canCancelTrip = !trip.cancelled_at && new Date(trip.departs_at) > new Date();
  const booked = requests.filter((r) => r.status === 'accepted').reduce((n, r) => n + r.seats, 0);
  const pending = requests.filter((r) => r.status === 'requested').reduce((n, r) => n + r.seats, 0);
  const total = seatsLeft !== null ? seatsLeft + booked : booked;

  return (
    <Screen
      back
      scroll
      footer={
        canCancelTrip ? (
          <Button variant="plain" label={t('cancelTrip')} onPress={cancelTrip} loading={busy === 'trip'} />
        ) : undefined
      }
    >
      <TripHero
        label={<Body muted small>{t('requestsTitle')}</Body>}
        departsAt={trip.departs_at}
        origin={trip.origin}
        destination={trip.destination}
      />
      {total > 0 ? <SeatDots total={total} booked={booked} pending={Math.min(pending, total - booked)} /> : null}
      {booked > 0 && !trip.cancelled_at ? (
        <Body muted small>
          {t('youEarn')} {ltr(`${booked * Number(trip.price_ils)}₪`)}
        </Body>
      ) : null}
      {trip.cancelled_at ? <Body error>{t('tripCancelled')}</Body> : null}

      <SectionTitle>{t('passengers')}</SectionTitle>
      {requests.length === 0 ? <Body muted>{t('noRequests')}</Body> : null}
      {requests.map((r) => {
        const name = shortName(r.profiles.full_name);
        const seats = `${ltr(r.seats)} ${t('seatOne')}`;
        const statusText = r.status === 'requested' ? seats : `${seats} · ${t(`status_${r.status}` as StringKey)}`;
        return (
          <View key={r.id} style={styles.request}>
            {r.status === 'accepted' ? (
              <BookingContact bookingId={r.id} />
            ) : (
              <ListRow last leading={<IconCircle letter={name.charAt(0)} />} title={name} subtitle={statusText} />
            )}
            {r.status === 'requested' ? (
              <>
                {r.respond_by ? (
                  <Countdown
                    label={t('answerWithin')}
                    remaining={formatCountdown(new Date(r.respond_by).getTime() - now.getTime())}
                    progress={progressOf(r, now)}
                  />
                ) : null}
                <View style={styles.actions}>
                  <View style={styles.action}>
                    <Button
                      variant="secondary"
                      label={t('declineSorry')}
                      onPress={() => decide(r.id, 'declined')}
                      disabled={busy !== null}
                    />
                  </View>
                  <View style={styles.action}>
                    <Button
                      label={t('acceptRequest')}
                      onPress={() => decide(r.id, 'accepted')}
                      loading={busy === r.id}
                      disabled={busy !== null && busy !== r.id}
                    />
                  </View>
                </View>
                <Body muted small>
                  {t('unanswered')}
                </Body>
              </>
            ) : null}
          </View>
        );
      })}
      {error ? <Body error>{error}</Body> : null}
    </Screen>
  );
}

/** How much of the answer window is left, from 1 (just asked) to 0 (expired). */
function progressOf(r: Request, now: Date) {
  if (!r.respond_by) return 0;
  const start = new Date(r.created_at).getTime();
  const end = new Date(r.respond_by).getTime();
  return end > start ? (end - now.getTime()) / (end - start) : 0;
}

const styles = StyleSheet.create({
  request: {
    paddingBottom: space.md,
    gap: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  actions: { flexDirection: 'row', gap: space.sm },
  action: { flex: 1 },
});
