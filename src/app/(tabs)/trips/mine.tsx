// My trips: Upcoming (seats you booked), As driver (trips you drive), and Past
// (finished trips on both sides, with the rating you gave).

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { TripRow } from '@/components/trip-row';
import { Body, Choice, Screen, TabHeader, ltr } from '@/components/ui';
import type { StringKey } from '@/i18n/strings';
import { useBookingChanges } from '@/lib/live';
import { useSession, useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import type { City } from '@/lib/trip-form';

type Trip = {
  id: string;
  origin: City;
  destination: City;
  departs_at: string;
  seats_total: number;
  price_ils: number;
  finished_at: string | null;
};
type DriverTrip = Trip & { bookings: { status: string }[] };
type Booking = { id: string; status: string; trips: Trip };
type Tab = 'upcoming' | 'driver' | 'past';
// One past row, from either side.
type Past = { key: string; trip: Trip; detail: string; rateBooking?: string; asDriver: boolean };

// Trips that left in the last few hours stay in Upcoming until they finish (trip day).
const LOOKBACK_MS = 5 * 60 * 60 * 1000;
const TRIP_COLS = 'id, origin, destination, departs_at, seats_total, price_ils, finished_at';

export default function MyTrips() {
  const { t } = useT();
  const { session } = useSession();
  const [tab, setTab] = useState<Tab>('upcoming');
  const [trips, setTrips] = useState<DriverTrip[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [past, setPast] = useState<Past[] | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    const me = session.user.id;
    const since = new Date(Date.now() - LOOKBACK_MS).toISOString();
    const [driveRes, seatRes, pastSeats, pastDrives, mine] = await Promise.all([
      supabase
        .from('trips')
        .select(`${TRIP_COLS}, bookings(status)`)
        .eq('driver_id', me)
        .is('cancelled_at', null)
        .is('finished_at', null)
        .gte('departs_at', since)
        .order('departs_at'),
      supabase
        .from('bookings')
        .select(`id, status, trips!inner(${TRIP_COLS})`)
        .eq('passenger_id', me)
        .is('trips.finished_at', null)
        .gte('trips.departs_at', since),
      supabase
        .from('bookings')
        .select(`id, status, trips!inner(${TRIP_COLS})`)
        .eq('passenger_id', me)
        .in('status', ['completed', 'no_show'])
        .limit(30),
      supabase
        .from('trips')
        .select(`${TRIP_COLS}, bookings(status)`)
        .eq('driver_id', me)
        .not('finished_at', 'is', null)
        .order('departs_at', { ascending: false })
        .limit(30),
      supabase.from('ratings').select('booking_id, stars').eq('rater_id', me),
    ]);

    setTrips((driveRes.data as DriverTrip[] | null) ?? []);
    const seats = (seatRes.data as unknown as Booking[] | null) ?? [];
    seats.sort((a, b) => a.trips.departs_at.localeCompare(b.trips.departs_at));
    setBookings(seats);

    const given = new Map(((mine.data as { booking_id: string; stars: number }[] | null) ?? []).map((r) => [r.booking_id, r.stars]));
    const rows: Past[] = [];
    for (const b of (pastSeats.data as unknown as Booking[] | null) ?? []) {
      const stars = given.get(b.id);
      rows.push({
        key: b.id,
        trip: b.trips,
        asDriver: false,
        detail: b.status === 'no_show' ? t('status_no_show') : stars ? `${t('youRated')} ${ltr(stars)}★` : t('status_completed'),
        rateBooking: b.status === 'completed' && !stars ? b.id : undefined,
      });
    }
    for (const trip of (pastDrives.data as DriverTrip[] | null) ?? []) {
      const riders = trip.bookings.filter((b) => b.status === 'completed').length;
      rows.push({ key: trip.id, trip, asDriver: true, detail: `${t('tabAsDriver')} · ${ltr(riders)} ${t(riders === 1 ? 'ridersOne' : 'ridersMany')}` });
    }
    rows.sort((a, b) => b.trip.departs_at.localeCompare(a.trip.departs_at));
    setPast(rows);
  }, [session, t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useBookingChanges(load);

  return (
    <Screen scroll tab>
      <TabHeader title={t('tabTrips')} />
      <Choice<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'upcoming', label: t('tabUpcoming') },
          { value: 'past', label: t('tabPast') },
          { value: 'driver', label: t('tabAsDriver') },
        ]}
      />

      {tab === 'upcoming' ? (
        <>
          {bookings.length === 0 ? <Body muted>{t('noBookings')}</Body> : null}
          {bookings.map((b) => (
            <TripRow
              key={b.id}
              origin={b.trips.origin}
              destination={b.trips.destination}
              departsAt={b.trips.departs_at}
              priceIls={b.trips.price_ils}
              signal={b.status === 'requested' ? t('status_requested') : undefined}
              detail={b.status === 'requested' ? undefined : t(`status_${b.status}` as StringKey)}
              onPress={() => router.push({ pathname: '/trips/[id]', params: { id: b.trips.id } })}
            />
          ))}
        </>
      ) : null}

      {tab === 'driver' ? (
        <>
          {trips.length === 0 ? <Body muted>{t('noDrives')}</Body> : null}
          {trips.map((trip) => {
            const pending = trip.bookings.filter((b) => b.status === 'requested').length;
            return (
              <TripRow
                key={trip.id}
                origin={trip.origin}
                destination={trip.destination}
                departsAt={trip.departs_at}
                priceIls={trip.price_ils}
                detail={`${trip.seats_total} ${t('seatsCount')}`}
                signal={pending > 0 ? `${pending} ${t('pendingRequests')}` : undefined}
                onPress={() => router.push({ pathname: '/trips/requests/[id]', params: { id: trip.id } })}
              />
            );
          })}
        </>
      ) : null}

      {tab === 'past' ? (
        <>
          {past && past.length === 0 ? <Body muted>{t('noPastTrips')}</Body> : null}
          {past?.map((p) => (
            <TripRow
              key={p.key}
              origin={p.trip.origin}
              destination={p.trip.destination}
              departsAt={p.trip.departs_at}
              priceIls={p.trip.price_ils}
              detail={p.detail}
              signal={p.rateBooking ? t('rateTrip') : undefined}
              onPress={() =>
                p.rateBooking
                  ? router.push({ pathname: '/trips/rate/[bookingId]', params: { bookingId: p.rateBooking } })
                  : p.asDriver
                    ? router.push({ pathname: '/trips/requests/[id]', params: { id: p.trip.id } })
                    : router.push({ pathname: '/trips/[id]', params: { id: p.trip.id } })
              }
            />
          ))}
        </>
      ) : null}
    </Screen>
  );
}
