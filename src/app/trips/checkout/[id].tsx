// Checkout on a screen of its own, for old links. Trip details now asks for the seat
// inside its card (src/components/request-seat.tsx holds the shared steps).

import { router, useLocalSearchParams } from 'expo-router';

import { useRequestSeat } from '@/components/request-seat';
import { TripHero } from '@/components/trip-hero';
import { Screen, Title } from '@/components/ui';

export default function Checkout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const r = useRequestSeat(id, true, () => router.back());
  if (!r.ready || !r.trip) return <Screen back>{null}</Screen>;
  return (
    <Screen back scroll footer={r.footer}>
      <Title>{r.title}</Title>
      <TripHero departsAt={r.trip.departs_at} origin={r.trip.origin} destination={r.trip.destination} />
      {r.body}
    </Screen>
  );
}
