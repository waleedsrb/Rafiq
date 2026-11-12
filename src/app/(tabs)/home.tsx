// Home: one block at the top that answers "what's next for me?", then "where to?",
// the checkpoints on your route, and one quiet row for the other role.
// Which block shows is decided in src/lib/home-state.ts (pickHero). Every block that
// belongs to a trip opens that trip's own screen (heroLink), so Home never repeats a page.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View, type HostInstance } from 'react-native';

import {
  CancelledBlock,
  DriveBlock,
  IdleDriver,
  IdlePassenger,
  RateBlock,
  RequestBlock,
  SeatBlock,
  type DriveInfo,
  type RequestInfo,
  type Route,
  type SeatInfo,
} from '@/components/home-hero';
import { Icon } from '@/components/icon';
import { RouteCheckpoints } from '@/components/route-checkpoints';
import { SearchMorph, type Rect } from '@/components/search-morph';
import { useTripSearch } from '@/components/trip-search';
import { Body, GlassButton, ListRow, TabScreen, useFont } from '@/components/ui';
import { formatLongDay } from '@/lib/format';
import { tapFeel } from '@/lib/haptics';
import {
  heroLink,
  pickHero,
  usualTime,
  type CancelledHero,
  type DriveHero,
  type RateHero,
  type RequestHero,
  type RiderAnswer,
  type SeatHero,
} from '@/lib/home-state';
import { useBookingChanges } from '@/lib/live';
import { useUnreadCount } from '@/lib/notifications';
import { NABLUS, RAMALLAH } from '@/lib/places';
import { useSession, useT } from '@/lib/session';
import type { Stats } from '@/lib/stats';
import { supabase } from '@/lib/supabase';
import type { City } from '@/lib/trip-form';
import { makeStyles, useTheme } from '@/theme/theme';
import { radii, shadows, sizes, space } from '@/theme/tokens';

const LATER_KEY = 'rafiq.home.later';
// A trip that left a few hours ago is still "next" until it finishes (trip day).
const LOOKBACK_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type TripCols = {
  id: string;
  origin: City;
  destination: City;
  departs_at: string;
  started_at: string | null;
  driver: { display_name: string } | null;
};
type SeatRow = {
  id: string;
  status: 'requested' | 'accepted';
  created_at: string;
  respond_by: string | null;
  here_at: string | null;
  boarded_at: string | null;
  rider_answer: RiderAnswer | null;
  trips: TripCols;
};
type DriveRow = {
  id: string;
  origin: City;
  destination: City;
  departs_at: string;
  started_at: string | null;
  seats_total: number;
  no_go_reason: string | null;
  bookings: {
    id: string;
    status: string;
    seats: number;
    created_at: string;
    respond_by: string | null;
    boarded_at: string | null;
    passenger_id: string;
    passenger: { display_name: string; avatar_path: string | null } | null;
  }[];
};
type Ended = { id: string; trips: { id: string; departs_at: string; finished_at: string | null; driver: { display_name: string } | null } };

type Loaded = {
  seats: (SeatHero & { info: SeatInfo })[];
  drives: (DriveHero & { info: DriveInfo })[];
  requests: (RequestHero & { info: RequestInfo })[];
  cancelled: (CancelledHero & { driver: string | null }) | null;
  rate: (RateHero & { driver: string | null }) | null;
  route: Route | null;
  driving: { route: Route; time: string } | null;
  prefersDriving: boolean;
  stats: Stats | null;
};

function toDrive(trip: DriveRow): DriveHero & { info: DriveInfo } {
  const accepted = trip.bookings.filter((b) => b.status === 'accepted');
  const pending = trip.bookings.filter((b) => b.status === 'requested' && b.respond_by);
  const booked = accepted.reduce((n, b) => n + b.seats, 0);
  return {
    tripId: trip.id,
    departsAt: trip.departs_at,
    startedAt: trip.started_at,
    riders: accepted.length,
    noGoReason: trip.no_go_reason,
    info: {
      tripId: trip.id,
      departsAt: trip.departs_at,
      startedAt: trip.started_at,
      origin: trip.origin,
      destination: trip.destination,
      seatsTotal: trip.seats_total,
      booked,
      asked: pending.reduce((n, b) => n + b.seats, 0),
      riders: accepted.filter((b) => b.boarded_at).reduce((n, b) => n + b.seats, 0),
      people: accepted.length,
      inCar: accepted.filter((b) => b.boarded_at).length,
    },
  };
}

/** Every request waiting on your trips that haven't started, with what the hero row needs. */
function toRequests(trip: DriveRow): (RequestHero & { info: RequestInfo })[] {
  if (trip.started_at) return [];
  const left = trip.seats_total - trip.bookings.filter((b) => b.status === 'accepted').reduce((n, b) => n + b.seats, 0);
  return trip.bookings
    .filter((b) => b.status === 'requested' && b.respond_by)
    .map((b) => ({
      bookingId: b.id,
      tripId: trip.id,
      respondBy: b.respond_by!,
      createdAt: b.created_at,
      fits: b.seats <= left,
      info: {
        bookingId: b.id,
        name: b.passenger?.display_name ?? '',
        avatarPath: b.passenger?.avatar_path ?? null,
        seed: b.passenger_id,
        seats: b.seats,
        createdAt: b.created_at,
        respondBy: b.respond_by!,
        fits: b.seats <= left,
      },
    }));
}

export default function Home() {
  const { c: colors } = useTheme();
  const styles = useStyles();
  const { t, lang } = useT();
  const { f, rtl } = useFont();
  const { unread } = useUnreadCount();
  const { profile, session } = useSession();
  const [data, setData] = useState<Loaded | null>(null);
  const [later, setLater] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => new Date());
  const firstName = profile?.full_name.split(' ')[0] ?? '';

  // The search that grows out of the "Where to?" bar. It starts on your usual route.
  const barRef = useRef<HostInstance>(null);
  const [search, setSearch] = useState<{ from: Rect; parked: boolean; closing: boolean } | null>(null);
  const searchState = useTripSearch();
  // Where the bar is gets measured as the finger lands, so by the time it lifts (the tap)
  // the search can start at once instead of waiting a frame for the measurement.
  const barRect = useRef<Rect | null>(null);
  const measureBar = (then?: (r: Rect) => void) =>
    barRef.current?.measureInWindow((x, y, width, height) => {
      barRect.current = { x, y, width, height };
      then?.(barRect.current);
    });
  const openSearch = () => {
    const open = (from: Rect) => setSearch({ from, parked: false, closing: false });
    tapFeel();
    if (barRect.current) open(barRect.current);
    else measureBar(open);
  };
  // Start from your usual direction once we know it. The week loads now, while you're
  // still on Home, so the trips are already there when the bar opens.
  const usualOrigin = data?.route?.origin;
  const usualDestination = data?.route?.destination;
  const { setOrigin, setDestination } = searchState;
  useEffect(() => {
    if (usualOrigin && usualDestination && !search) {
      setOrigin(usualOrigin);
      setDestination(usualDestination);
    }
  }, [usualOrigin, usualDestination]); // eslint-disable-line react-hooks/exhaustive-deps
  // A page opened from inside the search (the ID check from a trip card): the search steps
  // aside while it's up, and is back as you left it when you return.
  useFocusEffect(
    useCallback(() => {
      setSearch((v) => (v?.parked ? { ...v, parked: false } : v));
      return () => setSearch((v) => (v && !v.parked ? { ...v, parked: true } : v));
    }, []),
  );

  useEffect(() => {
    AsyncStorage.getItem(LATER_KEY)
      .then((v) => setLater(new Set(v ? (JSON.parse(v) as string[]) : [])))
      .catch(() => {});
  }, []);
  const putOff = useCallback((bookingId: string) => {
    setLater((prev) => {
      const next = new Set(prev).add(bookingId);
      AsyncStorage.setItem(LATER_KEY, JSON.stringify([...next].slice(-50))).catch(() => {});
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    if (!session) return;
    const me = session.user.id;
    const since = new Date(Date.now() - LOOKBACK_MS).toISOString();
    const dayAgo = new Date(Date.now() - DAY_MS).toISOString();
    const nowIso = new Date().toISOString();
    const tripCols = 'id, origin, destination, departs_at, started_at, driver:profiles(display_name)';

    const [seats, drives, cancelled, ended, ratings, lastSeat, lastDrive, car] = await Promise.all([
      // Your next seat (asked for or confirmed).
      supabase
        .from('bookings')
        .select(`id, status, created_at, respond_by, here_at, boarded_at, rider_answer, trips!inner(${tripCols})`)
        .eq('passenger_id', me)
        .in('status', ['requested', 'accepted'])
        .gte('trips.departs_at', since)
        .is('trips.cancelled_at', null)
        .is('trips.finished_at', null),
      // Trips you drive that haven't finished.
      supabase
        .from('trips')
        .select(
          'id, origin, destination, departs_at, started_at, seats_total, no_go_reason, bookings(id, status, seats, created_at, respond_by, boarded_at, passenger_id, passenger:profiles!bookings_passenger_id_fkey(display_name, avatar_path))',
        )
        .eq('driver_id', me)
        .is('cancelled_at', null)
        .is('finished_at', null)
        .gte('departs_at', since)
        .order('departs_at'),
      // A seat whose driver cancelled in the last day, for a trip that hasn't left yet.
      supabase
        .from('bookings')
        .select(`id, trips!inner(id, departs_at, cancelled_at, finished_at, driver:profiles(display_name))`)
        .eq('passenger_id', me)
        .eq('status', 'cancelled')
        .not('trips.cancelled_at', 'is', null)
        .gte('trips.cancelled_at', dayAgo)
        .gte('trips.departs_at', nowIso)
        .limit(1),
      // A trip you finished in the last day, to rate.
      supabase
        .from('bookings')
        .select(`id, trips!inner(id, departs_at, finished_at, driver:profiles(display_name))`)
        .eq('passenger_id', me)
        .eq('status', 'completed')
        .gte('trips.finished_at', dayAgo)
        .limit(5),
      supabase.from('ratings').select('booking_id').eq('rater_id', me),
      // Your usual route and role: whatever you did last.
      supabase
        .from('bookings')
        .select('created_at, trips!inner(origin, destination)')
        .eq('passenger_id', me)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('trips')
        .select('created_at, origin, destination, departs_at')
        .eq('driver_id', me)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('driver_details').select('verified_at').eq('driver_id', me).maybeSingle(),
    ]);

    const seatList = (seats.data as unknown as SeatRow[] | null) ?? [];
    const driveRows = (drives.data as unknown as DriveRow[] | null) ?? [];
    const rated = new Set(((ratings.data as { booking_id: string }[] | null) ?? []).map((r) => r.booking_id));
    const c = ((cancelled.data as unknown as Ended[] | null) ?? [])[0];
    const r = ((ended.data as unknown as Ended[] | null) ?? []).find((b) => !rated.has(b.id) && b.trips.finished_at);

    const ls = lastSeat.data as unknown as { created_at: string; trips: Route } | null;
    const ld = lastDrive.data as { created_at: string; origin: City; destination: City; departs_at: string } | null;
    const canDrive = !!(car.data as { verified_at: string | null } | null)?.verified_at;
    const prefersDriving = canDrive && !!ld && (!ls || ld.created_at > ls.created_at);

    let stats: Stats | null = null;
    if (prefersDriving) {
      const { data: st } = await supabase.rpc('person_stats', { p_person: me });
      stats = ((st as Stats[] | null) ?? [])[0] ?? null;
    }

    setData({
      seats: seatList.map((s) => ({
        bookingId: s.id,
        tripId: s.trips.id,
        status: s.status,
        departsAt: s.trips.departs_at,
        startedAt: s.trips.started_at,
        hereAt: s.here_at,
        boardedAt: s.boarded_at,
        riderAnswer: s.rider_answer,
        info: {
          bookingId: s.id,
          status: s.status,
          departsAt: s.trips.departs_at,
          startedAt: s.trips.started_at,
          createdAt: s.created_at,
          respondBy: s.respond_by,
          origin: s.trips.origin,
          destination: s.trips.destination,
          driver: s.trips.driver?.display_name ?? null,
          hereAt: s.here_at,
          boardedAt: s.boarded_at,
        },
      })),
      drives: driveRows.map(toDrive),
      requests: driveRows.flatMap(toRequests),
      cancelled: c ? { bookingId: c.id, tripId: c.trips.id, departsAt: c.trips.departs_at, driver: c.trips.driver?.display_name ?? null } : null,
      rate: r ? { bookingId: r.id, finishedAt: r.trips.finished_at!, driver: r.trips.driver?.display_name ?? null } : null,
      route: ls ? { origin: ls.trips.origin, destination: ls.trips.destination } : ld ? { origin: ld.origin, destination: ld.destination } : null,
      driving: ld && canDrive ? { route: { origin: ld.origin, destination: ld.destination }, time: usualTime(ld.departs_at) } : null,
      prefersDriving,
      stats,
    });
    setNow(new Date());
  }, [session]);

  // Reload when Home comes back into view and whenever one of your bookings changes.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useBookingChanges(load);

  const hero = useMemo(
    () =>
      data
        ? pickHero(
            {
              seats: data.seats,
              drives: data.drives,
              requests: data.requests,
              cancelled: data.cancelled,
              rate: data.rate,
              dismissed: later,
              prefersDriving: data.prefersDriving && !!data.driving,
            },
            now,
          )
        : null,
    [data, later, now],
  );

  // Tick once a second while a countdown or "leaves in" is on screen.
  const ticking = !!hero && (hero.kind === 'seat' || hero.kind === 'drive' || hero.kind === 'request');
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [ticking]);

  const greeting = now.getHours() < 12 ? t('greetingMorning') : t('greetingEvening');
  const link = hero ? heroLink(hero) : null;
  const open = () => link && router.push(link);

  let block = null;
  if (hero && data) {
    const seatInfo = hero.kind === 'seat' ? data.seats.find((x) => x.bookingId === hero.seat.bookingId)?.info : undefined;
    const driveInfo =
      hero.kind === 'drive' || hero.kind === 'request'
        ? data.drives.find((x) => x.tripId === (hero.kind === 'drive' ? hero.drive.tripId : hero.request.tripId))?.info
        : undefined;
    if (hero.kind === 'seat' && seatInfo) block = <SeatBlock key={seatInfo.bookingId} seat={seatInfo} phase={hero.phase} now={now} onChanged={load} />;
    else if (hero.kind === 'drive') {
      if (driveInfo) block = <DriveBlock key={driveInfo.tripId} drive={driveInfo} phase={hero.phase} now={now} onChanged={load} />;
    } else if (hero.kind === 'request') {
      const r = data.requests.find((x) => x.bookingId === hero.request.bookingId)?.info;
      if (r && driveInfo) block = <RequestBlock key={r.bookingId} request={r} drive={driveInfo} count={hero.count} now={now} onChanged={load} />;
    } else if (hero.kind === 'cancelled' && data.cancelled)
      block = <CancelledBlock departsAt={data.cancelled.departsAt} driver={data.cancelled.driver} onOpen={open} onLater={() => putOff(data.cancelled!.bookingId)} />;
    else if (hero.kind === 'rate' && data.rate)
      block = <RateBlock driver={data.rate.driver} onOpen={open} onLater={() => putOff(data.rate!.bookingId)} />;
    else if (hero.kind === 'idleDriver' && data.driving) block = <IdleDriver route={data.driving.route} time={data.driving.time} stats={data.stats} />;
    else block = <IdlePassenger route={data.route} verified={!!profile?.id_verified_at} />;
  }

  // The route whose checkpoints we show: the trip on top, else your usual route.
  const heroTrip =
    hero?.kind === 'seat'
      ? data?.seats.find((x) => x.bookingId === hero.seat.bookingId)?.info
      : hero?.kind === 'drive' || hero?.kind === 'request'
        ? data?.drives.find((x) => x.tripId === (hero.kind === 'drive' ? hero.drive.tripId : hero.request.tripId))?.info
        : undefined;
  const heroRoute: { origin: City; destination: City } =
    heroTrip || (hero?.kind === 'idleDriver' && data?.driving?.route) || data?.route || { origin: RAMALLAH, destination: NABLUS };

  // The quiet row under the search: the other role, or (already driving) one more trip.
  const quiet =
    hero?.kind === 'idleDriver'
      ? 'seat'
      : hero?.kind === 'drive' || hero?.kind === 'request'
        ? hero.kind === 'drive' && hero.phase === 'onTheRoad'
          ? null
          : 'another'
        : hero
          ? 'post'
          : null;

  return (
    <TabScreen
      title={t('tabHome')}
      pinned
      kicker={
        <Body muted small>
          {formatLongDay(now, lang)}
        </Body>
      }
      largeTitle={
        <Text testID="home-greeting" style={[styles.greeting, { fontFamily: f.bold }]}>
          {greeting}
          {rtl ? '، ' : ', '}
          {firstName}
        </Text>
      }
      // The bell opens the inbox; it fills in clay when something arrived you haven't seen.
      action={
        <GlassButton
          icon={unread > 0 ? 'bellFill' : 'bell'}
          iconColor={unread > 0 ? colors.clay : undefined}
          label={unread > 0 ? `${t('notificationsTitle')} · ${t('unread')}` : t('notificationsTitle')}
          onPress={() => router.push('/notifications')}
        />
      }
    >
      {link ? (
        <Pressable accessibilityRole="button" onPress={open} style={({ pressed }) => [styles.hero, pressed && { opacity: 0.7 }]}>
          <View style={styles.openCue}>
            <Icon name={rtl ? 'caretLeft' : 'caretRight'} size={14} />
          </View>
          {block}
        </Pressable>
      ) : (
        <View style={styles.hero}>{block}</View>
      )}

      {/* Tapping the bar grows it into the search right here (search-morph.tsx). */}
      <Pressable
        ref={barRef}
        accessibilityRole="button"
        onPressIn={() => {
          barRect.current = null; // never start from an old spot
          measureBar();
        }}
        onPress={openSearch}
        style={[styles.whereTo, search && { opacity: 0 }]}
      >
        <Icon name="search" />
        <Text style={[styles.whereToText, { fontFamily: f.bold }]}>{t('findSeatTitle')}</Text>
        <View style={styles.dayPill}>
          <Icon name="clock" size={14} />
          <Text style={[styles.dayPillText, { fontFamily: f.medium }]}>{t('today')}</Text>
        </View>
      </Pressable>

      {data ? <RouteCheckpoints origin={heroRoute.origin} destination={heroRoute.destination} reportedOnly limit={3} /> : null}

      {quiet === 'post' ? (
        <ListRow last icon="plus" title={t('homeDriving')} subtitle={t('homeDrivingSub')} onPress={() => router.push('/trips/new')} />
      ) : quiet === 'another' ? (
        <ListRow last icon="plus" title={t('postAnotherTrip')} subtitle={t('postAnotherSub')} onPress={() => router.push('/trips/new')} />
      ) : quiet === 'seat' && data?.driving ? (
        <ListRow
          last
          icon="ticket"
          title={t('homeNeedSeat')}
          subtitle={t('homeNeedSeatSub')}
          onPress={() => router.push({ pathname: '/trips/results', params: { ...data.driving!.route, day: '0' } })}
        />
      ) : null}

      {search ? (
        <SearchMorph
          from={search.from}
          s={searchState}
          hidden={search.parked}
          closing={search.closing}
          onRequestClose={() => setSearch((v) => (v ? { ...v, closing: true } : v))}
          onClosed={() => setSearch(null)}
        />
      ) : null}
    </TabScreen>
  );
}

const useStyles = makeStyles((colors) => ({
  greeting: { fontSize: 22, lineHeight: 30, color: colors.ink },
  hero: { marginTop: space.md, minHeight: 120 },
  // A small round arrow at the top end: this block opens a screen of its own.
  openCue: {
    position: 'absolute',
    top: 0,
    end: 0,
    zIndex: 1,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.sunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
}));
