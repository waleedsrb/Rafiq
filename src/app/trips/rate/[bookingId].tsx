// Rate on a screen of its own: the driver rates each passenger from here.
// Passengers rate inside the trip card (same steps, src/components/rate-trip.tsx).

import { router, useLocalSearchParams } from 'expo-router';

import { useRateTrip } from '@/components/rate-trip';
import { Body, Screen, Title } from '@/components/ui';

export default function RateTrip() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/home'));
  const r = useRateTrip(bookingId, true, leave);
  if (!r.ready) return <Screen back>{null}</Screen>;
  return (
    <Screen back scroll footer={r.footer}>
      {r.kicker ? (
        <Body muted small>
          {r.kicker}
        </Body>
      ) : null}
      <Title>{r.title}</Title>
      {r.body}
    </Screen>
  );
}
