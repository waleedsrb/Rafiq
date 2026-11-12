// My trips: Upcoming (seats you booked), As driver (trips you drive), and Past
// (finished trips on both sides, with the rating you gave).

import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SkeletonTripRows } from '@/components/skeleton';
import { TripRow } from '@/components/trip-row';
import { Body, Button, Choice, GlassButton, TabScreen, ltr } from '@/components/ui';
import type { StringKey } from '@/i18n/strings';
import { useBookingChanges } from '@/lib/live';
import { prefetch } from '@/lib/cache';
import { driverTripQuery, myTripsQuery, tripCardQuery, type MyTrips } from '@/lib/queries';
import { useSession, useT } from '@/lib/session';
import { openTrip } from '@/lib/trip-layer';
import { useCached } from '@/lib/use-cached';
import { space } from '@/theme/tokens';

type Trip = MyTrips['seats'][number]['trips'];
type Tab = 'upcoming' | 'driver' | 'past';
// One past row, from either side.
type Past = { key: string; trip: Trip; detail: string; rateBooking?: string; asDriver: boolean };

export default function MyTrips() {
  const { t } = useT();
  const { session } = useSession();
  const [tab, setTab] = useState<Tab>('upcoming');
  // From the cache (src/lib/cache.ts): the list you saw last time draws at once, and is
  // asked for again each time the tab comes into view. The tabs prefetch it at start.
  const res = useCached(session ? myTripsQuery(session.user.id) : null);
  const data = res.data;
  useBookingChanges(() => void res.refresh());
  const loading = data === undefined && !res.failed;
  const trips = data?.drives ?? [];
  const bookings = data?.seats ?? [];

  // Trips open filled in: the next few load in the background, and any trip starts
  // loading as your finger lands on it (a tap takes long enough to win the race).
  const me = session?.user.id;
  const seatCard = (tripId: string) => me && prefetch(tripCardQuery(tripId, me));
  const driveCard = (tripId: string) => prefetch(driverTripQuery(tripId));
  useEffect(() => {
    if (!data || !me) return;
    data.seats.slice(0, 3).forEach((b) => prefetch(tripCardQuery(b.trips.id, me), 30_000));
    data.drives.slice(0, 3).forEach((d) => prefetch(driverTripQuery(d.id), 30_000));
  }, [data, me]);

  const past = useMemo<Past[] | null>(() => {
    if (!data) return null;
    const rows: Past[] = [];
    for (const b of data.pastSeats) {
      const stars = data.given[b.id];
      rows.push({
        key: b.id,
        trip: b.trips,
        asDriver: false,
        detail:
          b.status === 'no_show' || b.status === 'not_confirmed' || b.status === 'disputed'
            ? t(`status_${b.status}`)
            : stars
              ? `${t('youRated')} ${ltr(stars)}★`
              : t('status_completed'),
        rateBooking: b.status === 'completed' && !stars ? b.id : undefined,
      });
    }
    for (const trip of data.pastDrives) {
      const riders = trip.bookings.filter((b) => b.status === 'completed').length;
      // A trip nobody started in the app, and nobody confirmed afterwards.
      const unconfirmed = riders === 0 && trip.bookings.some((b) => b.status === 'not_confirmed');
      rows.push({
        key: trip.id,
        trip,
        asDriver: true,
        detail: `${t('tabAsDriver')} · ${unconfirmed ? t('status_not_confirmed') : `${ltr(riders)} ${t(riders === 1 ? 'ridersOne' : 'ridersMany')}`}`,
      });
    }
    rows.sort((a, b) => b.trip.departs_at.localeCompare(a.trip.departs_at));
    return rows;
  }, [data, t]);

  return (
    <TabScreen
      title={t('tabTrips')}
      // Posting is always one tap away, however many trips you already drive.
      action={<GlassButton icon="plus" label={t('postTrip')} onPress={() => router.push('/trips/new')} />}
    >
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
          {loading ? <SkeletonTripRows /> : bookings.length === 0 ? <Body muted>{t('noBookings')}</Body> : null}
          {bookings.map((b) => (
            <TripRow
              key={b.id}
              origin={b.trips.origin}
              destination={b.trips.destination}
              departsAt={b.trips.departs_at}
              priceIls={b.trips.price_ils}
              signal={b.status === 'requested' || b.status === 'queued' ? t(`status_${b.status}` as StringKey) : undefined}
              detail={b.status === 'requested' || b.status === 'queued' ? undefined : t(`status_${b.status}` as StringKey)}
              onPressIn={() => seatCard(b.trips.id)}
              onPress={(from) => openTrip(b.trips.id, from)}
            />
          ))}
        </>
      ) : null}

      {tab === 'driver' ? (
        <>
          {loading ? <SkeletonTripRows /> : trips.length === 0 ? <Body muted>{t('noDrives')}</Body> : null}
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
                onPressIn={() => driveCard(trip.id)}
                onPress={() => router.push({ pathname: '/trips/requests/[id]', params: { id: trip.id } })}
              />
            );
          })}
          <View style={styles.post}>
            <Button
              variant="secondary"
              icon="plus"
              label={t(trips.length === 0 ? 'postTrip' : 'postAnotherTrip')}
              onPress={() => router.push('/trips/new')}
            />
          </View>
        </>
      ) : null}

      {tab === 'past' ? (
        <>
          {loading ? <SkeletonTripRows /> : past && past.length === 0 ? <Body muted>{t('noPastTrips')}</Body> : null}
          {past?.map((p) => (
            <TripRow
              key={p.key}
              origin={p.trip.origin}
              destination={p.trip.destination}
              departsAt={p.trip.departs_at}
              priceIls={p.trip.price_ils}
              detail={p.detail}
              signal={p.rateBooking ? t('rateTrip') : undefined}
              onPressIn={() => (p.asDriver ? !p.rateBooking && driveCard(p.trip.id) : seatCard(p.trip.id))}
              onPress={(from) =>
                p.asDriver
                  ? p.rateBooking
                    ? router.push({ pathname: '/trips/rate/[bookingId]', params: { bookingId: p.rateBooking } })
                    : router.push({ pathname: '/trips/requests/[id]', params: { id: p.trip.id } })
                  : // A passenger rates inside the trip card (Rate is its main button).
                    openTrip(p.trip.id, from)
              }
            />
          ))}
        </>
      ) : null}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  post: { marginTop: space.md },
});
