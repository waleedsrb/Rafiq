// Trip details for a passenger, with "Request a seat" or the status of their request.

import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { ContactCard } from '@/components/contact-card';
import { TripRow } from '@/components/trip-row';
import { Body, Button, Label, Screen, Title } from '@/components/ui';
import type { StringKey } from '@/i18n/strings';
import { useBookingChanges } from '@/lib/live';
import { askForPush } from '@/lib/push';
import { useSession, useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import type { City } from '@/lib/trip-form';

type Trip = {
  id: string;
  driver_id: string;
  origin: City;
  destination: City;
  departs_at: string;
  price_ils: number;
  profiles: { full_name: string }; // the driver, joined through trips.driver_id
};

export default function TripDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useT();
  const { session } = useSession();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [seatsLeft, setSeatsLeft] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!session || !id) return;
    const [tripRes, seatsRes, bookingRes] = await Promise.all([
      supabase
        .from('trips')
        .select('id, driver_id, origin, destination, departs_at, price_ils, profiles!trips_driver_id_fkey(full_name)')
        .eq('id', id)
        .single(),
      supabase.rpc('seats_left', { p_trip_id: id }),
      supabase.from('bookings').select('id, status').eq('trip_id', id).eq('passenger_id', session.user.id).maybeSingle(),
    ]);
    setTrip((tripRes.data as unknown as Trip | null) ?? null);
    setSeatsLeft((seatsRes.data as number | null) ?? null);
    setStatus(bookingRes.data?.status ?? null);
    setBookingId(bookingRes.data?.id ?? null);
  }, [id, session]);

  useEffect(() => {
    load();
  }, [load]);

  // When the driver accepts, the status and contact card appear right away.
  useBookingChanges(load, id ? `trip_id=eq.${id}` : undefined);

  async function request() {
    if (!session || !trip) return;
    setSending(true);
    setError(null);
    // The database sets status = 'requested' and logs the event (see guard_booking).
    const { error: err } = await supabase.from('bookings').insert({ trip_id: trip.id, passenger_id: session.user.id });
    setSending(false);
    if (err) return setError(t('somethingWrong'));
    // Now is when notifications make sense: "tell me when the driver answers".
    await askForPush();
    await load();
  }

  if (!trip) return <Screen>{null}</Screen>;

  const driverFirstName = trip.profiles.full_name.split(' ')[0];
  const canRequest = status === null && (seatsLeft ?? 0) > 0 && trip.driver_id !== session?.user.id;

  return (
    <Screen
      footer={canRequest ? <Button label={t('requestSeat')} onPress={request} loading={sending} /> : undefined}
    >
      <Title>
        {t(trip.origin)} {lang === 'ar' ? '←' : '→'} {t(trip.destination)}
      </Title>
      <TripRow
        origin={trip.origin}
        destination={trip.destination}
        departsAt={trip.departs_at}
        priceIls={trip.price_ils}
        detail={seatsLeft !== null ? (seatsLeft > 0 ? `${seatsLeft} ${t('seatsLeft')}` : t('full')) : undefined}
      />
      <Label>{t('driverLabel')}</Label>
      <Body>{driverFirstName}</Body>

      {status ? <Body>{t(`status_${status}` as StringKey)}</Body> : null}
      {status === 'accepted' && bookingId ? <ContactCard bookingId={bookingId} /> : null}
      {status === 'requested' ? <Body muted>{t('contactHidden')}</Body> : null}
      {!status && canRequest ? (
        <Body muted>{t('requestHint')}</Body>
      ) : null}
      {error ? <Body error>{error}</Body> : null}
    </Screen>
  );
}
