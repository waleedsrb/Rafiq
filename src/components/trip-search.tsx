// Find a seat, design C1a "time first". There is no Search button: the next 30 days of trips
// for one direction load once, and changing the day or the part of the day only filters
// what is already here, so the list changes in place without waiting.
// Used by the search that grows out of Home's "Where to?" bar (search-morph.tsx)
// and by the stand-alone results screen that other screens link to.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type HostInstance, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition, useReducedMotion } from 'react-native-reanimated';

import { DayPills } from '@/components/day-pills';
import { Icon } from '@/components/icon';
import { StatsLine, useTripDriverStats } from '@/components/stats-line';
import { pillBase, usePillColor, usePillSlide, usePillStyle, type PillSlide } from '@/components/pill-slide';
import { Body, Button, Chip, ltr, useFont } from '@/components/ui';
import { alertWindow } from '@/lib/alerts';
import { shortTime, type DayPart } from '@/lib/format';
import { selectFeel } from '@/lib/haptics';
import { NABLUS, place, placeName, RAMALLAH } from '@/lib/places';
import { isVerifiedWoman, useSession, useT } from '@/lib/session';
import { carName } from '@/lib/names';
import { supabase } from '@/lib/supabase';
import type { City } from '@/lib/trip-form';
import { countByDay, dayIndex, filterTrips, leavingSoon, PARTS, AHEAD_DAYS, searchDayStart } from '@/lib/trip-search';
import { openTripFrom, useOpenTrip, type Rect } from '@/lib/trip-layer';
import { colors, fonts, radii, shadows, sizes, space } from '@/theme/tokens';

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

const partLabel = { morning: 'partMorning', afternoon: 'partAfternoon', evening: 'partEvening' } as const;

export type SearchState = {
  origin: City;
  destination: City;
  day: number;
  part: DayPart | null;
  setOrigin: (c: City) => void;
  setDestination: (c: City) => void;
  swap: () => void;
  setDay: (d: number) => void;
  setPart: (p: DayPart | null) => void;
  /** Verified women can narrow the list to women-only trips. */
  womenOnly: boolean;
  setWomenOnly: (on: boolean) => void;
  /** The whole week for this direction, earliest first (null until the first answer). */
  week: Result[] | null;
  loading: boolean;
  counts: number[];
};

/** Everything a search page needs: the question, and the week of answers for it. */
export function useTripSearch(start?: { origin?: City; destination?: City; day?: number; part?: DayPart | null }): SearchState {
  const { t, lang } = useT();
  const [route, setRoute] = useState<{ origin: City; destination: City }>(() => {
    const origin = place(start?.origin)?.id ?? RAMALLAH;
    const destination = place(start?.destination)?.id ?? (origin === NABLUS ? RAMALLAH : NABLUS);
    return { origin, destination: destination === origin ? (origin === NABLUS ? RAMALLAH : NABLUS) : destination };
  });
  const { origin, destination } = route;
  const [day, setDay] = useState(start?.day ?? 0);
  const [part, setPart] = useState<DayPart | null>(start?.part ?? null);
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
  return { origin, destination, day, part, setOrigin, setDestination, swap, setDay, setPart, womenOnly, setWomenOnly, week, loading, counts };
}

/** The day pills: one tap picks the day, the graphite pill glides there, and the list below
 *  changes in place. The calendar at the end reaches further days; dots mark days with trips. */
export function DayChips({ s }: { s: SearchState }) {
  return <DayPills day={s.day} onDay={s.setDay} dots={s.counts} padding={14} />;
}

/** The trips of the chosen day, part of the day and (for verified women) women-only switch. */
function dayTrips(s: SearchState, now: Date) {
  const ofDay = (s.week ?? []).filter((r) => dayIndex(r.departs_at, now) === s.day);
  return { ofDay, shown: filterTrips(ofDay, s.part, s.womenOnly) };
}

/**
 * "Alert me": no free seat in what you're looking at? Save the search and hear about the
 * next trip. Draws nothing while there is a seat to take. The results screen shows it in the
 * list; the search on Home docks it just above its bar at the bottom, in thumb reach.
 */
export function AlertMe({ s, docked, style }: { s: SearchState; docked?: boolean; style?: StyleProp<ViewStyle> }) {
  const { t } = useT();
  const { session } = useSession();
  const reduced = useReducedMotion();
  const now = new Date();
  const { shown } = dayTrips(s, now);
  const [alert, setAlert] = useState<'idle' | 'saving' | 'saved' | 'tooMany' | 'error'>('idle');
  const win = alertWindow(searchDayStart(s.day, now), s.part, now);
  const canAlert = !!s.week && !s.loading && !!win && !shown.some((r) => r.seats_left > 0);
  useEffect(() => setAlert('idle'), [s.part, s.day, s.origin, s.destination]);

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

/** Part-of-day switch, the count line, and the trips for the chosen day. `dockedAlert`: the owner shows <AlertMe> elsewhere. */
export function SearchResults({
  s,
  onOpenTrip,
  dockedAlert,
}: {
  s: SearchState;
  onOpenTrip?: (tripId: string, from?: Rect | null) => void;
  dockedAlert?: boolean;
}) {
  const openInLayer = useOpenTrip();
  const { t } = useT();
  const { profile } = useSession();
  const reduced = useReducedMotion();
  const now = new Date();
  const { womenOnly, setWomenOnly } = s;

  const { ofDay, shown } = dayTrips(s, now);
  const driverStats = useTripDriverStats(ofDay.map((r) => r.id));

  // A trip grows out of its row, over the results (see trip-sheet.tsx).
  const open = onOpenTrip ?? openInLayer;
  // A new key per question replays the rows' entrance, so you see the list change.
  const answerKey = `${s.origin}-${s.destination}-${s.day}-${s.part}-${womenOnly}`;

  return (
    <View style={{ gap: space.md }}>
      <PartTabs s={s} />
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
          <Body muted>{t('noResults')}</Body>
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
            {/* Exact towns come first (search_trips orders them so); a quiet label starts the nearby ones. */}
            {isNearby(r) && (i === 0 || !isNearby(shown[i - 1])) ? <Body muted small>{t('nearbyTrips')}</Body> : null}
            <TimeFirstRow r={r} last={i === shown.length - 1} soon={leavingSoon(r.departs_at, now)} stats={driverStats[r.id]} onPress={(from) => open(r.id, from)} />
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

/** A trip from or to a town near the one you searched, not the town itself. */
const isNearby = (r: Result) => Number(r.origin_km) > 0 || Number(r.destination_km) > 0;

/** Time of day as quiet tabs (All day, Morning, Afternoon, Evening): an underline, not a box. */
function PartTabs({ s }: { s: SearchState }) {
  const { t } = useT();
  const { rtl, direction } = useFont();
  const tabs: { value: DayPart | null; label: string }[] = [
    { value: null, label: t('allDay') },
    ...PARTS.map((p) => ({ value: p, label: t(partLabel[p]) })),
  ];
  const pill = usePillSlide(
    tabs.findIndex((o) => o.value === s.part),
    rtl,
  );
  const line = usePillStyle(pill, 'underline');
  return (
    <View style={[styles.tabs, { direction }]} accessibilityRole="tablist" onLayout={pill.onTrackLayout}>
      {tabs.map((o, i) => (
        <PartTab
          key={o.value ?? 'all'}
          i={i}
          pill={pill}
          label={o.label}
          on={o.value === s.part}
          onPress={() => {
            selectFeel();
            s.setPart(o.value);
          }}
        />
      ))}
      {/* The underline slides from tab to tab instead of jumping. */}
      <Animated.View pointerEvents="none" style={[pillBase, styles.tabLine, line]} />
    </View>
  );
}

function PartTab({ i, pill, label, on, onPress }: { i: number; pill: PillSlide; label: string; on: boolean; onPress: () => void }) {
  const { f } = useFont();
  const text = usePillColor(pill, i, colors.inkSecondary, colors.ink);
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
      hitSlop={8}
      onPress={onPress}
      onLayout={pill.onItemLayout(i)}
      style={styles.tab}
    >
      <Animated.Text style={[styles.tabText, { fontFamily: on ? f.bold : f.regular }, text]}>{label}</Animated.Text>
    </Pressable>
  );
}

/** One trip: the time leads (that's what people choose by), then the driver, then seats and price. */
function TimeFirstRow({
  r,
  last,
  soon,
  stats,
  onPress,
}: {
  r: Result;
  last: boolean;
  soon: boolean;
  stats: Parameters<typeof StatsLine>[0]['stats'];
  /** Gets where the row is on screen, so the trip can grow out of it. */
  onPress: (from: Rect | null) => void;
}) {
  const ref = useRef<HostInstance>(null);
  const { t, lang } = useT();
  const { f } = useFont();
  const full = r.seats_left <= 0;
  const name = r.driver_last_initial ? `${r.driver_first_name} ${r.driver_last_initial}.` : r.driver_first_name;
  // A nearby trip says where it really goes: "From Bitunia · 3 km".
  const where = [
    Number(r.origin_km) > 0 ? `${t('fromPlace').replace('{place}', placeName(r.origin, lang))} · ${r.origin_km} ${t('kmUnit')}` : null,
    Number(r.destination_km) > 0 ? `${t('toPlace').replace('{place}', placeName(r.destination, lang))} · ${r.destination_km} ${t('kmUnit')}` : null,
  ];
  const sub = [...where, r.women_only ? t('womenOnly') : null, carName(r.car_model, r.car_color, lang)].filter(Boolean).join(' · ');
  const seatsText = full ? t('full') : `${r.seats_left} ${t('seatsFree')}`;
  return (
    <Pressable
      testID="trip-row"
      accessibilityRole="button"
      accessibilityLabel={`${shortTime(new Date(r.departs_at))}, ${name}, ${seatsText}, ${r.price_ils}₪`}
      ref={ref}
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
        <StatsLine stats={stats} showReliability={false} />
      </View>
      <View style={styles.end}>
        {full ? <Text style={[styles.meta, { fontFamily: f.regular }]}>{t('full')}</Text> : <SeatSquares left={r.seats_left} total={r.seats_total} />}
        <Text style={styles.price}>{ltr(`${r.price_ils}₪`)}</Text>
      </View>
    </Pressable>
  );
}

/** Taken seats dark, free seats light: how full the car is, at a glance. */
function SeatSquares({ left, total }: { left: number; total: number }) {
  const taken = Math.max(0, total - left);
  return (
    <View style={styles.seats}>
      {Array.from({ length: Math.min(total, 8) }, (_, i) => (
        <View key={i} style={[styles.seat, i >= taken && styles.seatFree]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
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
  tabs: { flexDirection: 'row', gap: 18 },
  tab: { paddingBottom: 8 },
  tabLine: { backgroundColor: colors.ink, borderRadius: 1 },
  tabText: { fontSize: 14, color: colors.inkSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  time: { fontFamily: fonts.en.bold, fontSize: 24, color: colors.ink, minWidth: 66 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 15, lineHeight: 21, color: colors.ink, flexShrink: 1 },
  meta: { fontSize: 13, lineHeight: 18, color: colors.inkSecondary },
  end: { alignItems: 'flex-end', gap: 6 },
  price: { fontFamily: fonts.en.medium, fontSize: 13, color: colors.inkSecondary },
  seats: { flexDirection: 'row', gap: 3, direction: 'ltr' },
  seat: { width: 9, height: 9, borderRadius: 2.5, backgroundColor: colors.ink },
  seatFree: { backgroundColor: colors.lineStrong, opacity: 0.45 },
});
