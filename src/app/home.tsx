// Home: your bookings as a passenger, your trips as a driver, and the two main actions.

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { TripRow } from '@/components/trip-row';
import { Body, Button, Label, Screen, Title } from '@/components/ui';
import type { StringKey } from '@/i18n/strings';
import { forgetPush } from '@/lib/push';
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

type Booking = {
  id: string;
  status: string;
  trips: Trip; // joined through bookings.trip_id
};

export default function Home() {
  const { t } = useT();
  const { profile, session } = useSession();
  const [trips, setTrips] = useState<DriverTrip[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  // Only drivers who already added a car see "Your car" (to edit it).
  // Everyone else is asked for a car only when they tap "Post a trip".
  const [hasCar, setHasCar] = useState(false);
  const firstName = profile?.full_name.split(' ')[0] ?? '';

  // Reload every time Home comes back into view (e.g. after posting or booking).
  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      const now = new Date().toISOString();
      supabase
        .from('trips')
        .select('id, origin, destination, departs_at, seats_total, price_ils, bookings(status)')
        .eq('driver_id', session.user.id)
        .gte('departs_at', now)
        .order('departs_at')
        .then(({ data }) => setTrips((data as DriverTrip[] | null) ?? []));
      supabase
        .from('bookings')
        .select('id, status, trips!inner(id, origin, destination, departs_at, seats_total, price_ils)')
        .eq('passenger_id', session.user.id)
        .gte('trips.departs_at', now)
        .then(({ data }) => setBookings((data as unknown as Booking[] | null) ?? []));
      supabase
        .from('driver_details')
        .select('driver_id')
        .eq('driver_id', session.user.id)
        .maybeSingle()
        .then(({ data }) => setHasCar(!!data));
    }, [session]),
  );

  return (
    <Screen
      scroll
      footer={
        <>
          <Button label={t('findSeat')} onPress={() => router.push('/trips/search')} />
          <Button variant="plain" label={t('postTrip')} onPress={() => router.push('/trips/new')} />
        </>
      }
    >
      <Title>
        {t('welcome')} {firstName}
      </Title>

      {bookings.length > 0 ? <Label>{t('myBookings')}</Label> : null}
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

      <Label>{t('myTrips')}</Label>
      {trips.length === 0 ? <Body muted>{t('noTrips')}</Body> : null}
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

      {hasCar ? <Button variant="plain" label={t('yourCar')} onPress={() => router.push('/car')} /> : null}
      <Button variant="plain" label={t('signOut')} onPress={async () => {
          await forgetPush();
          await supabase.auth.signOut();
        }} />
    </Screen>
  );
}
