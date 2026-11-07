// My trips: every seat you booked and every trip you drive, soonest first.

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { TripRow } from '@/components/trip-row';
import { Body, Screen, SectionTitle, Title } from '@/components/ui';
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
};
type DriverTrip = Trip & { bookings: { status: string }[] };
type Booking = { id: string; status: string; trips: Trip & { finished_at: string | null } };

const LOOKBACK_MS = 5 * 60 * 60 * 1000;

export default function MyTrips() {
  const { t } = useT();
  const { session } = useSession();
  const [trips, setTrips] = useState<DriverTrip[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);

  const load = useCallback(() => {
    if (!session) return;
    // Trips that left in the last few hours stay here until they finish (trip day).
    const now = new Date(Date.now() - LOOKBACK_MS).toISOString();
    supabase
      .from('trips')
      .select('id, origin, destination, departs_at, seats_total, price_ils, bookings(status)')
      .is('finished_at', null)
      .eq('driver_id', session.user.id)
      .is('cancelled_at', null)
      .gte('departs_at', now)
      .order('departs_at')
      .then(({ data }) => setTrips((data as DriverTrip[] | null) ?? []));
    supabase
      .from('bookings')
      .select('id, status, trips!inner(id, origin, destination, departs_at, seats_total, price_ils, finished_at)')
      .eq('passenger_id', session.user.id)
      .gte('trips.departs_at', now)
      .then(({ data }) => {
        // A finished trip stays only as "Completed", so you can open it and rate.
        const list = ((data as unknown as Booking[] | null) ?? []).filter((b) => !b.trips.finished_at || b.status === 'completed');
        list.sort((a, b) => a.trips.departs_at.localeCompare(b.trips.departs_at));
        setBookings(list);
      });
  }, [session]);

  useFocusEffect(load);
  useBookingChanges(load);


  return (
    <Screen scroll tab contentStyle={{ paddingTop: 72 }}>
      <Title>{t('tabTrips')}</Title>

      <SectionTitle>{t('asPassenger')}</SectionTitle>
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

      {trips.length > 0 ? <SectionTitle>{t('asDriver')}</SectionTitle> : null}
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
    </Screen>
  );
}
