// Find a seat, design C1a "time first". There is no Search button: the next 30 days of trips
// for one direction load once, and picking a day only filters what is already here, so the
// list changes in place without waiting. No day picked (how it opens) = every trip in the
// next 30 days, earliest first, with a small heading starting each day (Waleed, Nov 11).
// Used by the search that grows out of Home's "Where to?" bar (search-morph.tsx)
// and by the stand-alone results screen that other screens link to.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type HostInstance, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition, useReducedMotion } from 'react-native-reanimated';

import { DayPills } from '@/components/day-pills';
import { Icon } from '@/components/icon';
import { StatsLine, useTripDriverStats } from '@/components/stats-line';
import { Body, Button, Chip, ltr, useFont } from '@/components/ui';
import { alertWindow } from '@/lib/alerts';
import { formatDay, shortTime } from '@/lib/format';
import { selectFeel } from '@/lib/haptics';
import { NABLUS, place, placeName, RAMALLAH } from '@/lib/places';
import { isVerifiedWoman, useSession, useT } from '@/lib/session';
import { carName } from '@/lib/names';
import { supabase } from '@/lib/supabase';
import type { City } from '@/lib/trip-form';
import { byDay, countByDay, dayIndex, filterTrips, leavingSoon, AHEAD_DAYS, searchDayStart } from '@/lib/trip-search';
import { openTripFrom, useOpenTrip, type Rect } from '@/lib/trip-layer';
import { prefetch } from '@/lib/cache';
import { tripCardQuery } from '@/lib/queries';
import { useMySeatsFor, useSeatCountsFor, type MySeatStatus } from '@/lib/live';
import { seatView, type SeatCounts, type SeatKind } from '@/lib/seat-line';
import { makeStyles, useTheme } from '@/theme/theme';
import { fonts, radii, shadows, sizes, space } from '@/theme/tokens';

export type Result = {
  id: string;
  departs_at: string;
  seats_total: number;
  seats_left: number;
  price_ils: number;
  driver_first_name: string;
  driver_last_initial: string;
  car_model: string | null;
  car_color: string | null;
  driver_verified: boolean;
  /** Only verified women get these from search_trips(). */
  women_only: boolean;
  /** Where this trip really starts and ends, and how far that is from what you searched (0 = the same town). */
  origin: City;
  destination: City;
  origin_km: number;
  destination_km: number;
};

export type SearchState = {
  origin: City;
  destination: City;
  /** 0 = today .. AHEAD_DAYS, or null for every day (nothing picked). */
  day: number | null;
  setOrigin: (c: City) => void;
  setDestination: (c: City) => void;
  swap: () => void;
  setDay: (d: number | null) => void;
  /** Verified women can narrow the list to women-only trips. */
  womenOnly: boolean;
  setWomenOnly: (on: boolean) => void;
  /** The whole week for this direction, earliest first (null until the first answer). */
  week: Result[] | null;
  loading: boolean;
  counts: number[];
};

/** Everything a search page needs: the question, and the week of answers for it. */
export function useTripSearch(start?: { origin?: City; destination?: City; day?: number | null }): SearchState {
  const { t, lang } = useT();
  const [route, setRoute] = useState<{ origin: City; destination: City }>(() => {
    const origin = place(start?.origin)?.id ?? RAMALLAH;
    const destination = place(start?.destination)?.id ?? (origin === NABLUS ? RAMALLAH : NABLUS);
    return { origin, destination: destination === origin ? (origin === NABLUS ? RAMALLAH : NABLUS) : destination };
  });
  const { origin, destination } = route;
  const [day, setDay] = useState<number | null>(start?.day ?? null);
  const [womenOnly, setWomenOnly] = useState(false);
  const [week, setWeek] = useState<Result[] | null>(null);
  const [loading, setLoading] = useState(true);
  const asked = useRef(0);

  useEffect(() => {
    const ask = ++asked.current;
    setLoading(true);
    const now = new Date();
    const from = searchDayStart(0, now);
    // One search for every day the calendar reaches, so the day dots and switching days are instant.
    const to = searchDayStart(AHEAD_DAYS + 1, now);
    supabase
      .rpc('search_trips', { p_origin: origin, p_destination: destination, p_from: from.toISOString(), p_to: to.toISOString() })
      .then(({ data }) => {
        // Ignore answers to a question the person has already changed (or left).
        if (ask !== asked.current) return;
        setWeek((data as Result[] | null) ?? []);
        setLoading(false);
      });
  }, [origin, destination]);
  useEffect(() => () => void asked.current++, []);

  const counts = useMemo(() => countByDay(week ?? [], new Date()), [week]);
  // Picking the town already at the other end flips the route instead of making it A -> A.
  const setOrigin = useCallback((c: City) => setRoute((r) => (c === r.destination ? { origin: c, destination: r.origin } : { ...r, origin: c })), []);
  const setDestination = useCallback((c: City) => setRoute((r) => (c === r.origin ? { origin: r.destination, destination: c } : { ...r, destination: c })), []);
  const swap = useCallback(() => setRoute((r) => ({ origin: r.destination, destination: r.origin })), []);
  return { origin, destination, day, setOrigin, setDestination, swap, setDay, womenOnly, setWomenOnly, week, loading, counts };
}

/** The day pills: one tap picks the day, the graphite pill glides there, and the list below
 *  changes in place; tapping it again goes back to every day. The calendar stays pinned at
 *  the end (the pills slide under its glass) and reaches further days. `inset`: the row's
 *  side margin, when it runs edge to edge. */
export function DayChips({ s, inset }: { s: SearchState; inset?: number }) {
  return (
    <DayPills
      day={s.day}
      onDay={s.setDay}
      onClear={() => s.setDay(null)}
      // Until the answer is here every day would look empty, so no dots or faded days yet.
      dots={s.week ? s.counts : undefined}
      padding={14}
      inset={inset}
    />
  );
}

/** The trips of the chosen day (or every day), and the women-only switch for verified women. */
function dayTrips(s: SearchState, now: Date) {
  const all = s.week ?? [];
  const ofDay = s.day === null ? byDay(all, now) : all.filter((r) => dayIndex(r.departs_at, now) === s.day);
  return { ofDay, shown: filterTrips(ofDay, s.womenOnly) };
}

/** "Today · Wed 11 Nov": the heading that starts each day in the every-day list. */
function DayHeading({ d, now }: { d: number; now: Date }) {
  const styles = useStyles();
  const { t, lang } = useT();
  const date = formatDay(searchDayStart(d, now), lang).replace('،', '');
  const text = d === 0 ? `${t('today')} · ${date}` : d === 1 ? `${t('tomorrow')} · ${date}` : date;
  return (
    <View style={styles.dayHead} accessibilityRole="header">
      <Body muted small>{text}</Body>
    </View>
  );
}

/**
 * "Alert me": no free seat in what you're looking at? Save the search and hear about the
 * next trip. Draws nothing while there is a seat to take. The results screen shows it in the
 * list; the search on Home docks it just above its bar at the bottom, in thumb reach.
 */
export function AlertMe({ s, docked, style }: { s: SearchState; docked?: boolean; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  const { t } = useT();
  const { session } = useSession();
  const reduced = useReducedMotion();
  const now = new Date();
  const { shown } = dayTrips(s, now);
  const [alert, setAlert] = useState<'idle' | 'saving' | 'saved' | 'tooMany' | 'error'>('idle');
  // An alert covers one day, so it needs a day picked (with every day shown, the empty
  // list says to pick one instead).
  const win = s.day === null ? null : alertWindow(searchDayStart(s.day, now), null, now);
  const canAlert = !!s.week && !s.loading && !!win && !shown.some((r) => r.seats_left > 0);
  useEffect(() => setAlert('idle'), [s.day, s.origin, s.destination]);

  async function saveAlert() {
    if (!session || !win) return;
    setAlert('saving');
    const { error } = await supabase.from('ride_alerts').insert({
      passenger_id: session.user.id,
      origin: s.origin,
      destination: s.destination,
      window_from: win.from.toISOString(),
      window_to: win.to.toISOString(),
    });
    // 23505 = the same alert already exists, which is what the person wanted anyway.
    if (!error || error.code === '23505') setAlert('saved');
    else setAlert(error.message.includes('10 alerts') ? 'tooMany' : 'error');
  }

  if (!canAlert) return null;
  return (
    <Animated.View entering={reduced ? undefined : FadeIn.duration(200)} style={[{ gap: space.sm }, style]}>
      {alert === 'saved' ? (
        <View style={docked && styles.dockNote}>
          <Body muted small>{t('alertSaved')}</Body>
        </View>
      ) : (
        <View style={docked && styles.dockButton}>
          <Button variant="secondary" icon="bell" label={t('alertMe')} onPress={saveAlert} loading={alert === 'saving'} />
        </View>
      )}
      {alert === 'tooMany' ? <Body error>{t('alertTooMany')}</Body> : null}
      {alert === 'error' ? <Body error>{t('somethingWrong')}</Body> : null}
    </Animated.View>
  );
}

/** The trips for the chosen day (or every day). `dockedAlert`: the owner shows <AlertMe> elsewhere. */
export function SearchResults({
  s,
  onOpenTrip,
  dockedAlert,
}: {
  s: SearchState;
  onOpenTrip?: (tripId: string, from?: Rect | null) => void;
  dockedAlert?: boolean;
}) {
  const { c: colors } = useTheme();
  const openInLayer = useOpenTrip();
  const { t } = useT();
  const { profile, session } = useSession();
  const reduced = useReducedMotion();
  const now = new Date();
  const { womenOnly, setWomenOnly } = s;

  const { ofDay, shown } = dayTrips(s, now);
  const driverStats = useTripDriverStats(ofDay.map((r) => r.id));
  // Confirmed and waiting seats, live, so every square shows who holds it.
  const seatCounts = useSeatCountsFor(ofDay.map((r) => r.id));
  // Trips I already asked for, wait in line on, or have a confirmed seat on.
  const mySeats = useMySeatsFor(
    ofDay.map((r) => r.id),
    session?.user.id,
  );

  // A trip grows out of its row, over the results (see trip-sheet.tsx).
  const open = onOpenTrip ?? openInLayer;
  // A new key per question replays the rows' entrance, so you see the list change.
  const answerKey = `${s.origin}-${s.destination}-${s.day}-${womenOnly}`;
  const everyDay = s.day === null;
  const dayOf = (r: Result) => dayIndex(r.departs_at, now);

  return (
    <View style={{ gap: space.md }}>
      {isVerifiedWoman(profile) ? (
        <View style={{ flexDirection: 'row' }}>
          <Chip
            icon="shieldCheck"
            label={t('womenOnly')}
            selected={womenOnly}
            onPress={() => {
              selectFeel();
              setWomenOnly(!womenOnly);
            }}
          />
        </View>
      ) : null}

      {s.week && !s.loading && shown.length === 0 ? (
        <Animated.View entering={reduced ? undefined : FadeIn.duration(200)}>
          <Body muted>{t(everyDay ? 'noResultsAnyDay' : 'noResults')}</Body>
        </Animated.View>
      ) : null}
      {dockedAlert ? null : <AlertMe s={s} />}

      {/* First load: a small spinner. After that the old list dims while the new one comes. */}
      {s.loading && !s.week ? <ActivityIndicator style={{ marginTop: space.md }} color={colors.inkSecondary} /> : null}
      <View style={{ marginTop: -space.sm, opacity: s.loading && s.week ? 0.45 : 1 }}>
        {shown.map((r, i) => (
          <Animated.View
            key={`${answerKey}-${r.id}`}
            entering={reduced ? undefined : FadeInDown.duration(260).delay(Math.min(i, 6) * 35)}
            layout={reduced ? undefined : LinearTransition.duration(220)}
          >
            {/* Every day: a heading starts each day. */}
            {everyDay && (i === 0 || dayOf(shown[i - 1]) !== dayOf(r)) ? <DayHeading d={dayOf(r)} now={now} /> : null}
            {/* Within a day, exact towns come first (search_trips orders them so); a quiet label starts the nearby ones. */}
            {isNearby(r) && (i === 0 || !isNearby(shown[i - 1]) || (everyDay && dayOf(shown[i - 1]) !== dayOf(r))) ? (
              <Body muted small>{t('nearbyTrips')}</Body>
            ) : null}
            <TimeFirstRow r={r} last={i === shown.length - 1 || (everyDay && dayOf(shown[i + 1]) !== dayOf(r))} soon={leavingSoon(r.departs_at, now)} stats={driverStats[r.id]} counts={seatCounts[r.id] ?? null} mine={mySeats[r.id] ?? null} onPressIn={() => session && prefetch(tripCardQuery(r.id, session.user.id))} onPress={(from) => open(r.id, from)} />
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

/** A trip from or to a town near the one you searched, not the town itself. */
const isNearby = (r: Result) => Number(r.origin_km) > 0 || Number(r.destination_km) > 0;

/** One trip: the time leads (that's what people choose by), then the driver, then seats and price. */
function TimeFirstRow({
  r,
  last,
  soon,
  stats,
  counts,
  mine,
  onPress,
  onPressIn,
}: {
  r: Result;
  last: boolean;
  soon: boolean;
  stats: Parameters<typeof StatsLine>[0]['stats'];
  counts: SeatCounts | null;
  /** My own booking on this trip, if any. */
  mine: MySeatStatus | null;
  /** Gets where the row is on screen, so the trip can grow out of it. */
  onPress: (from: Rect | null) => void;
  /** As the finger lands: the trip starts loading, so its card opens filled in. */
  onPressIn: () => void;
}) {
  const { c: colors } = useTheme();
  const styles = useStyles();
  const ref = useRef<HostInstance>(null);
  const { t, lang } = useT();
  const { f } = useFont();
  // Live counts when we have them; until then the free count from the search.
  const view = counts ? seatView(r.seats_total, counts) : null;
  const seatKinds: SeatKind[] = view?.seats ?? Array.from({ length: r.seats_total }, (_, i) => (i < r.seats_total - r.seats_left ? 'confirmed' : 'free'));
  const full = (view ? view.free : r.seats_left) <= 0;
  const name = r.driver_last_initial ? `${r.driver_first_name} ${r.driver_last_initial}.` : r.driver_first_name;
  // A nearby trip says where it really goes: "From Bitunia · 3 km".
  const where = [
    Number(r.origin_km) > 0 ? `${t('fromPlace').replace('{place}', placeName(r.origin, lang))} · ${r.origin_km} ${t('kmUnit')}` : null,
    Number(r.destination_km) > 0 ? `${t('toPlace').replace('{place}', placeName(r.destination, lang))} · ${r.destination_km} ${t('kmUnit')}` : null,
  ];
  const sub = [...where, r.women_only ? t('womenOnly') : null, carName(r.car_model, r.car_color, lang)].filter(Boolean).join(' · ');
  const seatsText = full ? t('full') : `${view ? view.free : r.seats_left} ${t('seatsFree')}`;
  return (
    <Pressable
      testID="trip-row"
      accessibilityRole="button"
      accessibilityLabel={`${shortTime(new Date(r.departs_at))}, ${name}, ${seatsText}, ${r.price_ils}₪`}
      ref={ref}
      onPressIn={onPressIn}
      onPress={() => openTripFrom(ref.current, '', (_id, from) => onPress(from ?? null))}
      style={({ pressed }) => [styles.row, !last && styles.rowLine, pressed && { opacity: 0.6 }]}
    >
      <Text style={[styles.time, full && { color: colors.inkSecondary }]}>{shortTime(new Date(r.departs_at))}</Text>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, { fontFamily: f.medium }, full && { color: colors.inkSecondary }]} numberOfLines={1}>
            {name}
          </Text>
          {r.driver_verified ? (
            <View accessible accessibilityLabel={t('verifiedDriver')}>
              <Icon name="sealCheck" size={15} color={colors.statusOpen} />
            </View>
          ) : null}
        </View>
        <Text style={[styles.meta, { fontFamily: f.regular }]} numberOfLines={1}>
          {sub}
          {soon ? <Text style={{ color: colors.statusOpen, fontFamily: f.medium }}>{sub ? ' · ' : ''}{t('leavingSoon')}</Text> : null}
        </Text>
        {mine ? (
          <View style={styles.mineRow}>
            <Icon name={mine === 'accepted' ? 'check' : 'clock'} size={13} color={mine === 'accepted' ? colors.statusOpen : colors.clay} />
            <Text style={[styles.meta, { fontFamily: f.medium, color: mine === 'accepted' ? colors.statusOpen : colors.clay }]} numberOfLines={1}>
              {t(mine === 'accepted' ? 'seatIsConfirmed' : mine === 'queued' ? 'youAreInLine' : 'status_requested')}
            </Text>
          </View>
        ) : null}
        <StatsLine stats={stats} showReliability={false} />
      </View>
      <View style={styles.end}>
        <SeatSquares seats={seatKinds} />
        <Text style={styles.price}>{ltr(`${r.price_ils}₪`)}</Text>
      </View>
    </Pressable>
  );
}

/** One square per seat: confirmed dark, waiting for the driver clay, free light. */
function SeatSquares({ seats }: { seats: SeatKind[] }) {
  const styles = useStyles();
  return (
    <View style={styles.seats}>
      {seats.slice(0, 8).map((k, i) => (
        <View key={i} style={[styles.seat, k === 'waiting' && styles.seatWaiting, k === 'free' && styles.seatFree]} />
      ))}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  // Docked over the list, so it needs its own porcelain behind the outline.
  dockButton: { borderRadius: radii.capsule, backgroundColor: colors.surface, ...shadows.float },
  dockNote: {
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radii.capsule,
    backgroundColor: colors.surface,
    ...shadows.float,
  },
  dayHead: { paddingTop: space.md, paddingBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  time: { fontFamily: fonts.en.bold, fontSize: 24, color: colors.ink, minWidth: 66 },
  mineRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 15, lineHeight: 21, color: colors.ink, flexShrink: 1 },
  meta: { fontSize: 13, lineHeight: 18, color: colors.inkSecondary },
  end: { alignItems: 'flex-end', gap: 6 },
  price: { fontFamily: fonts.en.medium, fontSize: 13, color: colors.inkSecondary },
  seats: { flexDirection: 'row', gap: 3, direction: 'ltr' },
  seat: { width: 9, height: 9, borderRadius: 2.5, backgroundColor: colors.ink },
  seatWaiting: { backgroundColor: colors.clay },
  seatFree: { backgroundColor: colors.lineStrong, opacity: 0.45 },
}));
