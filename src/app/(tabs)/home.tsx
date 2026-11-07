// Home: what's next for you, the main actions, and "where to?".
// Lists of all your bookings and trips live in My trips (the second tab).

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { STATUS_LOOK, type Overview } from '@/components/checkpoint-badge';
import { Icon } from '@/components/icon';
import { SeatDots } from '@/components/seat-dots';
import { TripHero } from '@/components/trip-hero';
import {
  Body,
  Countdown,
  IconCircle,
  ListRow,
  QuickAction,
  Screen,
  SectionTitle,
  ltr,
  useFont,
} from '@/components/ui';
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

/** A place you rode to before: one row per direction, newest first. */
type Recent = { origin: City; destination: City; departs_at: string };

type DriveBooking = {
  id: string;
  status: string;
  seats: number;
  created_at: string;
  respond_by: string | null;
  passenger: { full_name: string } | null;
};
type NextDrive = {
  id: string;
  origin: City;
  destination: City;
  departs_at: string;
  seats_total: number;
  bookings: DriveBooking[];
};

export default function Home() {
  const { t, lang } = useT();
  const { f, rtl } = useFont();
  const { profile, session } = useSession();
  const [next, setNext] = useState<NextBooking | null>(null);
  const [waiting, setWaiting] = useState<{ count: number; tripId: string } | null>(null);
  const [drive, setDrive] = useState<NextDrive | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [checkpoints, setCheckpoints] = useState<Overview[]>([]);
  const [now, setNow] = useState(() => new Date());
  const firstName = profile?.full_name.split(' ')[0] ?? '';

  const load = useCallback(() => {
    if (!session) return;
    const nowIso = new Date().toISOString();
    // A trip that left a few hours ago is still "next" until it finishes (trip day).
    const sinceIso = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    // Your next seat (asked for or confirmed).
    supabase
      .from('bookings')
      .select('id, status, created_at, respond_by, trips!inner(id, origin, destination, departs_at, cancelled_at, driver:profiles(full_name))')
      .eq('passenger_id', session.user.id)
      .in('status', ['requested', 'accepted'])
      .gte('trips.departs_at', sinceIso)
      .is('trips.cancelled_at', null)
      .is('trips.finished_at', null)
      .then(({ data }) => {
        const list = (data as unknown as NextBooking[] | null) ?? [];
        list.sort((a, b) => a.trips.departs_at.localeCompare(b.trips.departs_at));
        setNext(list[0] ?? null);
      });
    // As a driver: seat requests you still need to answer.
    supabase
      .from('trips')
      .select(
        'id, origin, destination, departs_at, seats_total, bookings(id, status, seats, created_at, respond_by, passenger:profiles!bookings_passenger_id_fkey(full_name))',
      )
      .eq('driver_id', session.user.id)
      .is('cancelled_at', null)
      .is('finished_at', null)
      .gte('departs_at', sinceIso)
      .order('departs_at')
      .then(({ data }) => {
        const trips = (data as unknown as NextDrive[] | null) ?? [];
        setDrive(trips[0] ?? null);
        let count = 0;
        let tripId = '';
        for (const trip of trips) {
          const n = trip.bookings.filter((b) => b.status === 'requested').length;
          if (n > 0 && !tripId) tripId = trip.id;
          count += n;
        }
        setWaiting(count > 0 ? { count, tripId } : null);
      });
    // Places you rode to before, so a repeat trip is one tap.
    supabase
      .from('bookings')
      .select('trips!inner(origin, destination, departs_at)')
      .eq('passenger_id', session.user.id)
      .in('status', ['accepted', 'completed'])
      .lt('trips.departs_at', nowIso)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        const rows = ((data as unknown as { trips: Recent }[] | null) ?? []).map((r) => r.trips);
        rows.sort((a, b) => b.departs_at.localeCompare(a.departs_at));
        const seen = new Set<string>();
        setRecent(
          rows.filter((r) => {
            const key = `${r.origin}-${r.destination}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          }).slice(0, 2),
        );
      });
    // The checkpoint strip under "Where to?".
    supabase.rpc('checkpoint_overview').then(({ data }) => setCheckpoints((data as Overview[] | null) ?? []));
  }, [session]);

  // Reload when Home comes back into view and whenever one of your bookings changes.
  useFocusEffect(load);
  useBookingChanges(load);

  // Tick once a second while a countdown is on screen.
  // Show whichever comes first: the seat you booked or the trip you drive.
  const showDrive = !!drive && (!next || drive.departs_at < next.trips.departs_at);
  const counting = showDrive ? !!waiting : next?.status === 'requested' && !!next.respond_by;
  useEffect(() => {
    if (!counting) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [counting]);

  const greeting = now.getHours() < 12 ? t('greetingMorning') : t('greetingEvening');

  return (
    <Screen
      scroll
      tab
      // No avatar button: Account is already a tab, so it would be a second way to the same place.
      contentStyle={{ paddingTop: 72 }}
    >
      {showDrive && drive ? (
        <NextDriveHero trip={drive} now={now} />
      ) : next ? (
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
        <QuickAction icon="barricade" label={t('tabCheckpoints')} onPress={() => router.navigate('/checkpoints')} />
        <QuickAction icon="ticket" label={t('tabTrips')} onPress={() => router.navigate('/trips/mine')} />
      </View>

      <Pressable accessibilityRole="button" onPress={() => router.push('/trips/search')} style={styles.whereTo}>
        <Icon name="search" />
        <Text style={[styles.whereToText, { fontFamily: f.bold }]}>{t('findSeatTitle')}</Text>
        <View style={styles.dayPill}>
          <Icon name="clock" size={14} />
          <Text style={[styles.dayPillText, { fontFamily: f.medium }]}>{t('today')}</Text>
        </View>
      </Pressable>

      {recent.length > 0 ? (
        <View>
          {recent.map((r, i) => (
            <ListRow
              key={`${r.origin}-${r.destination}`}
              last={i === recent.length - 1}
              icon="clock"
              title={t(r.destination)}
              subtitle={`${t('fromCity')} ${t(r.origin)} · ${t('lastTrip')} ${formatLongDay(new Date(r.departs_at), lang)}`}
              onPress={() =>
                router.push({ pathname: '/trips/results', params: { origin: r.origin, destination: r.destination, day: '0' } })
              }
            />
          ))}
        </View>
      ) : null}

      <CheckpointStrip rows={checkpoints} />

      {waiting && !showDrive ? (
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

      {showDrive && drive ? <Passengers trip={drive} /> : null}
    </Screen>
  );
}

/** One line under "Where to?": the checkpoints with a recent report, as dot + name + status word. */
function CheckpointStrip({ rows }: { rows: Overview[] }) {
  const { t, lang } = useT();
  const { f } = useFont();
  // Closed first, then crowded, then open: the strip is for what could change your plans.
  const order = { closed: 0, crowded: 1, open: 2 } as const;
  const shown = rows
    .filter((r) => r.status)
    .sort((a, b) => order[a.status!] - order[b.status!])
    .slice(0, 2);
  if (shown.length === 0) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('tabCheckpoints')}
      onPress={() => router.navigate('/checkpoints')}
      style={({ pressed }) => [styles.strip, pressed && { opacity: 0.6 }]}
    >
      <Text style={[styles.stripLabel, { fontFamily: f.medium }]}>{t('tabCheckpoints')}</Text>
      {shown.map((r) => {
        const look = STATUS_LOOK[r.status!];
        return (
          <View key={r.id} style={styles.stripItem}>
            <View style={[styles.stripDot, { backgroundColor: r.status === 'crowded' ? colors.statusCrowdedDot : look.color }]} />
            <Text style={[styles.stripName, { fontFamily: f.medium }]}>
              {lang === 'ar' ? r.name_ar : r.name_en} <Text style={{ color: look.color }}>{t(look.word)}</Text>
            </Text>
          </View>
        );
      })}
    </Pressable>
  );
}

/** Your next trip as a driver: time, route, seats, and the newest request waiting for you. */
function NextDriveHero({ trip, now }: { trip: NextDrive; now: Date }) {
  const { t } = useT();
  const accepted = trip.bookings.filter((b) => b.status === 'accepted');
  const pending = trip.bookings
    .filter((b) => b.status === 'requested' && b.respond_by)
    .sort((a, b) => a.respond_by!.localeCompare(b.respond_by!));
  const booked = accepted.reduce((n, b) => n + b.seats, 0);
  const asked = pending.reduce((n, b) => n + b.seats, 0);
  const first = pending[0];

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/trips/requests/[id]', params: { id: trip.id } })}
      style={({ pressed }) => [{ gap: space.sm }, pressed && { opacity: 0.7 }]}
    >
      <TripHero
        label={<Body muted small>{t('yourNextDrive')}</Body>}
        departsAt={trip.departs_at}
        origin={trip.origin}
        destination={trip.destination}
      />
      <SeatDots total={trip.seats_total} booked={booked} pending={Math.min(asked, trip.seats_total - booked)} />
      {first ? (
        <Countdown
          label={`${t('newRequestFrom')} ${first.passenger ? shortName(first.passenger.full_name) : ''} · ${t('answerWithin')}`}
          remaining={formatCountdown(new Date(first.respond_by!).getTime() - now.getTime())}
          progress={(() => {
            const start = new Date(first.created_at).getTime();
            const end = new Date(first.respond_by!).getTime();
            return end > start ? (end - now.getTime()) / (end - start) : 0;
          })()}
        />
      ) : null}
          </Pressable>
  );
}

/** Who rides with you on your next trip. */
function Passengers({ trip }: { trip: NextDrive }) {
  const { t } = useT();
  const riders = trip.bookings.filter((b) => b.status === 'accepted' && b.passenger);
  if (riders.length === 0) return null;
  return (
    <View>
      <SectionTitle>{t('passengers')}</SectionTitle>
      {riders.map((b, i) => {
        const name = shortName(b.passenger!.full_name);
        return (
          <ListRow
            key={b.id}
            last={i === riders.length - 1}
            leading={<IconCircle letter={name.charAt(0)} />}
            title={name}
            subtitle={`${ltr(b.seats)} ${t('seatOne')}`}
            onPress={() => router.push({ pathname: '/trips/requests/[id]', params: { id: trip.id } })}
          />
        );
      })}
    </View>
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
  strip: { flexDirection: 'row', alignItems: 'center', gap: 18, minHeight: 40, flexWrap: 'wrap' },
  stripLabel: { fontSize: 12, letterSpacing: 0.2, color: colors.inkSecondary },
  stripItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stripDot: { width: 8, height: 8, borderRadius: 4 },
  stripName: { fontSize: 14, color: colors.ink },
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
