// Home: what's next for you, the main actions, and "where to?".
// Lists of all your bookings and trips live in My trips (the second tab).

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Body, Countdown, Dock, GlassButton, ListRow, QuickAction, Screen, TopBar, useFont } from '@/components/ui';
import { clock, formatCountdown, formatLongDay } from '@/lib/format';
import { useBookingChanges } from '@/lib/live';
import { shortName } from '@/lib/names';
import { useSession, useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import type { City } from '@/lib/trip-form';
import { colors, fonts, radii, shadows, sizes, space } from '@/theme/tokens';

type NextBooking = {
  id: string;
  status: 'requested' | 'accepted';
  created_at: string;
  respond_by: string | null;
  trips: {
    id: string;
    origin: City;
    destination: City;
    departs_at: string;
    driver: { full_name: string } | null;
  };
};

export default function Home() {
  const { t, lang } = useT();
  const { f, rtl } = useFont();
  const { profile, session } = useSession();
  const [next, setNext] = useState<NextBooking | null>(null);
  const [waiting, setWaiting] = useState<{ count: number; tripId: string } | null>(null);
  const [now, setNow] = useState(() => new Date());
  const firstName = profile?.full_name.split(' ')[0] ?? '';

  const load = useCallback(() => {
    if (!session) return;
    const nowIso = new Date().toISOString();
    // Your next seat (asked for or confirmed).
    supabase
      .from('bookings')
      .select('id, status, created_at, respond_by, trips!inner(id, origin, destination, departs_at, cancelled_at, driver:profiles(full_name))')
      .eq('passenger_id', session.user.id)
      .in('status', ['requested', 'accepted'])
      .gte('trips.departs_at', nowIso)
      .is('trips.cancelled_at', null)
      .then(({ data }) => {
        const list = (data as unknown as NextBooking[] | null) ?? [];
        list.sort((a, b) => a.trips.departs_at.localeCompare(b.trips.departs_at));
        setNext(list[0] ?? null);
      });
    // As a driver: seat requests you still need to answer.
    supabase
      .from('trips')
      .select('id, departs_at, bookings(status)')
      .eq('driver_id', session.user.id)
      .is('cancelled_at', null)
      .gte('departs_at', nowIso)
      .order('departs_at')
      .then(({ data }) => {
        const trips = (data as { id: string; bookings: { status: string }[] }[] | null) ?? [];
        let count = 0;
        let tripId = '';
        for (const trip of trips) {
          const n = trip.bookings.filter((b) => b.status === 'requested').length;
          if (n > 0 && !tripId) tripId = trip.id;
          count += n;
        }
        setWaiting(count > 0 ? { count, tripId } : null);
      });
  }, [session]);

  // Reload when Home comes back into view and whenever one of your bookings changes.
  useFocusEffect(load);
  useBookingChanges(load);

  // Tick once a second while a countdown is on screen.
  const counting = next?.status === 'requested' && !!next.respond_by;
  useEffect(() => {
    if (!counting) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [counting]);

  const greeting = now.getHours() < 12 ? t('greetingMorning') : t('greetingEvening');

  return (
    <Screen
      scroll
      top={
        <TopBar
          start={
            <GlassButton label={t('accountTitle')} onPress={() => router.replace('/account')}>
              <Text style={[styles.avatarLetter, { fontFamily: f.bold }]}>{firstName.charAt(0)}</Text>
            </GlassButton>
          }
        />
      }
      overlay={<Dock current="home" tripsDot={!!waiting} />}
    >
      {next ? (
        <NextTrip booking={next} now={now} />
      ) : (
        <View style={{ gap: space.xs }}>
          <Body muted small>
            {formatLongDay(now, lang)}
          </Body>
          <Text style={[styles.greeting, { fontFamily: f.bold }]}>
            {greeting}
            {rtl ? '، ' : ', '}
            {firstName}.
          </Text>
        </View>
      )}

      <View style={styles.quickRow}>
        <QuickAction icon="search" label={t('quickSearch')} onPress={() => router.push('/trips/search')} />
        <QuickAction icon="plus" label={t('postTrip')} onPress={() => router.push('/trips/new')} />
        <QuickAction icon="ticket" label={t('tabTrips')} onPress={() => router.replace('/trips/mine')} />
      </View>

      <Pressable accessibilityRole="button" onPress={() => router.push('/trips/search')} style={styles.whereTo}>
        <Icon name="search" />
        <Text style={[styles.whereToText, { fontFamily: f.bold }]}>{t('findSeatTitle')}</Text>
        <View style={styles.dayPill}>
          <Icon name="clock" size={14} />
          <Text style={[styles.dayPillText, { fontFamily: f.medium }]}>{t('today')}</Text>
        </View>
      </Pressable>

      {waiting ? (
        <ListRow
          last
          icon="bell"
          title={t('requestsWaiting')}
          trailing={
            <View style={styles.badge}>
              <Text style={[styles.badgeText, { fontFamily: fonts.en.bold }]}>{waiting.count}</Text>
            </View>
          }
          onPress={() => router.push({ pathname: '/trips/requests/[id]', params: { id: waiting.tripId } })}
        />
      ) : null}
    </Screen>
  );
}

/** The big "your next trip" block: time, route, driver, and where the request stands. */
function NextTrip({ booking, now }: { booking: NextBooking; now: Date }) {
  const { t, lang } = useT();
  const { f, rtl } = useFont();
  const departs = new Date(booking.trips.departs_at);
  const { time, pm } = clock(departs);
  const arrow = rtl ? '←' : '→';
  const driver = booking.trips.driver ? shortName(booking.trips.driver.full_name) : '';

  let countdown = null;
  if (booking.status === 'requested' && booking.respond_by) {
    const start = new Date(booking.created_at).getTime();
    const end = new Date(booking.respond_by).getTime();
    const left = end - now.getTime();
    countdown = (
      <Countdown
        label={t('waitingForDriver')}
        remaining={formatCountdown(left)}
        progress={end > start ? left / (end - start) : 0}
      />
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/trips/[id]', params: { id: booking.trips.id } })}
      style={({ pressed }) => [{ gap: space.sm }, pressed && { opacity: 0.7 }]}
    >
      <Body muted small>
        {t('yourNextTrip')} · {formatLongDay(departs, lang)}
      </Body>
      <View style={styles.timeRow}>
        <Text style={styles.heroTime}>{time}</Text>
        <Text style={[styles.heroPart, { fontFamily: f.regular }]}>{pm ? t('pm') : t('am')}</Text>
      </View>
      <View style={styles.routeRow}>
        <Body>
          {t(booking.trips.origin)} {arrow} {t(booking.trips.destination)}
          {driver ? ` · ${driver}` : ''}
        </Body>
      </View>
      {countdown ?? (
        <View style={styles.confirmed}>
          <Icon name="check" size={16} />
          <Text style={[styles.confirmedText, { fontFamily: f.medium }]}>{t('seatConfirmed')}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatarLetter: { fontSize: 16, color: colors.ink },
  greeting: { fontSize: 34, lineHeight: 42, color: colors.ink, letterSpacing: -0.5 },
  timeRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  heroTime: { fontFamily: fonts.en.bold, fontSize: 56, lineHeight: 62, color: colors.ink, letterSpacing: -1.6 },
  heroPart: { fontSize: 16, color: colors.inkSecondary },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  confirmed: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  confirmedText: { fontSize: 14, color: colors.ink },
  quickRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.md, paddingHorizontal: space.sm },
  whereTo: {
    height: sizes.button,
    borderRadius: radii.capsule,
    backgroundColor: colors.sunken,
    flexDirection: 'row',
    alignItems: 'center',
    paddingStart: 18,
    paddingEnd: 8,
    gap: 10,
    marginTop: space.md,
  },
  whereToText: { flex: 1, fontSize: 18, color: colors.ink },
  dayPill: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    ...shadows.float,
    shadowOpacity: 0.05,
  },
  dayPillText: { fontSize: 13, color: colors.ink },
  badge: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 7,
    borderRadius: 12,
    backgroundColor: colors.clay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 13, color: colors.onInk },
});
