// Home: your upcoming trips as a driver, and a button to post one.
// PR 4 adds the passenger side (find and book a seat).

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Body, Button, Label, Screen, Title } from '@/components/ui';
import { formatDay, formatTime } from '@/lib/format';
import { useSession, useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import type { City } from '@/lib/trip-form';
import { colors, fonts, space } from '@/theme/tokens';

type Trip = {
  id: string;
  origin: City;
  destination: City;
  departs_at: string;
  seats_total: number;
  price_ils: number;
};

export default function Home() {
  const { t, lang } = useT();
  const { profile, session } = useSession();
  const [trips, setTrips] = useState<Trip[]>([]);
  const firstName = profile?.full_name.split(' ')[0] ?? '';

  // Reload every time Home comes back into view (e.g. after posting a trip).
  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      supabase
        .from('trips')
        .select('id, origin, destination, departs_at, seats_total, price_ils')
        .eq('driver_id', session.user.id)
        .gte('departs_at', new Date().toISOString())
        .order('departs_at')
        .then(({ data }) => setTrips((data as Trip[] | null) ?? []));
    }, [session]),
  );

  const arrow = lang === 'ar' ? '←' : '→';
  const f = fonts[lang];

  return (
    <Screen
      scroll
      footer={
        <>
          <Button label={t('postTrip')} onPress={() => router.push('/trips/new')} />
          <Button variant="plain" label={t('signOut')} onPress={() => supabase.auth.signOut()} />
        </>
      }
    >
      <Title>
        {t('welcome')} {firstName}
      </Title>
      <Body muted>{t('homeSoon')}</Body>

      <Label>{t('myTrips')}</Label>
      {trips.length === 0 ? <Body muted>{t('noTrips')}</Body> : null}
      {trips.map((trip) => {
        const d = new Date(trip.departs_at);
        return (
          <View key={trip.id} style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={[styles.route, { fontFamily: f.medium }]}>
                {t(trip.origin)} {arrow} {t(trip.destination)}
              </Text>
              <Text style={[styles.meta, { fontFamily: f.regular }]}>
                {formatDay(d, lang)} · {formatTime(d, lang)} · {trip.seats_total} {t('seatsCount')}
              </Text>
            </View>
            <Text style={[styles.price, { fontFamily: fonts.en.medium }]}>₪{trip.price_ils}</Text>
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: colors.hairline,
  },
  rowMain: { flex: 1, gap: 2 },
  route: { fontSize: 17, color: colors.ink },
  meta: { fontSize: 14, color: colors.inkSecondary },
  price: { fontSize: 17, color: colors.ink },
});
