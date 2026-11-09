// Find a seat, design C1a "time first". There is no Search button: the week's trips for
// one direction load once, and changing the day or the part of the day only filters
// what is already here, so the list changes in place without waiting.
// Used by the search that grows out of Home's "Where to?" bar (search-morph.tsx)
// and by the stand-alone results screen that other screens link to.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type HostInstance } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition, useReducedMotion } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { StatsLine, useTripDriverStats } from '@/components/stats-line';
import { Body, Button, Chip, ltr, useFont } from '@/components/ui';
import { alertWindow } from '@/lib/alerts';
import { formatChipDay, shortTime, type DayPart } from '@/lib/format';
import { selectFeel } from '@/lib/haptics';
import { isVerifiedWoman, useSession, useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import type { City } from '@/lib/trip-form';
import { countByDay, dayIndex, filterTrips, leavingSoon, PARTS, SEARCH_DAYS, searchDayStart } from '@/lib/trip-search';
import { openTripFrom, useOpenTrip, type Rect } from '@/lib/trip-layer';
import { colors, fonts, radii, sizes, space } from '@/theme/tokens';

export type Result = {
  id: string;
  departs_at: string;
  seats_total: number;
  seats_left: number;
  price_ils: number;
  driver_first_name: string;
  driver_last_initial: string;
  car_model: string | null;
  driver_verified: boolean;
  /** Only verified women get these from search_trips(). */
  women_only: boolean;
};

const partLabel = { morning: 'partMorning', afternoon: 'partAfternoon', evening: 'partEvening' } as const;

export type SearchState = {
  origin: City;
  destination: City;
  day: number;
  part: DayPart | null;
  setOrigin: (c: City) => void;
  swap: () => void;
  setDay: (d: number) => void;
  setPart: (p: DayPart | null) => void;
  /** The whole week for this direction, earliest first (null until the first answer). */
  week: Result[] | null;
  loading: boolean;
  counts: number[];
  dayLabels: string[];
};

/** Everything a search page needs: the question, and the week of answers for it. */
export function useTripSearch(start?: { origin?: City; day?: number; part?: DayPart | null }): SearchState {
  const { t, lang } = useT();
  const [origin, setOrigin] = useState<City>(start?.origin ?? 'ramallah');
  const [day, setDay] = useState(start?.day ?? 0);
  const [part, setPart] = useState<DayPart | null>(start?.part ?? null);
  const destination: City = origin === 'ramallah' ? 'nablus' : 'ramallah';
  const [week, setWeek] = useState<Result[] | null>(null);
  const [loading, setLoading] = useState(true);
  const asked = useRef(0);

  useEffect(() => {
    const ask = ++asked.current;
    setLoading(true);
    const now = new Date();
    const from = searchDayStart(0, now);
    const to = searchDayStart(SEARCH_DAYS, now);
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
  const dayLabels = useMemo(() => {
    const now = new Date();
    return Array.from({ length: SEARCH_DAYS }, (_, i) =>
      i === 0 ? t('today') : i === 1 ? t('tomorrow') : formatChipDay(searchDayStart(i, now), lang),
    );
  }, [t, lang]);

  const swap = useCallback(() => setOrigin(destination), [destination]);
  return { origin, destination, day, part, setOrigin, swap, setDay, setPart, week, loading, counts, dayLabels };
}

/** The day chips: one tap picks the day, and the list below changes in place. */
export function DayChips({ s }: { s: SearchState }) {
  const { f } = useFont();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.dayRow}>
      {s.dayLabels.map((label, i) => {
        const on = i === s.day;
        return (
          <Pressable
            key={i}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={label}
            onPress={() => {
              selectFeel();
              s.setDay(i);
            }}
            style={[styles.dayChip, on && styles.dayChipOn]}
          >
            <Text style={[styles.dayText, { fontFamily: f.medium }, on && { color: colors.onInk }]}>{label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Part-of-day switch, the count line, and the trips for the chosen day. */
export function SearchResults({ s, onOpenTrip }: { s: SearchState; onOpenTrip?: (tripId: string, from?: Rect | null) => void }) {
  const openInLayer = useOpenTrip();
  const { t } = useT();
  const { session, profile } = useSession();
  const reduced = useReducedMotion();
  const [womenOnly, setWomenOnly] = useState(false);
  const now = new Date();

  const ofDay = (s.week ?? []).filter((r) => dayIndex(r.departs_at, now) === s.day);
  const shown = filterTrips(ofDay, s.part, womenOnly);
  const driverStats = useTripDriverStats(ofDay.map((r) => r.id));

  // No free seat in what you're looking at? Save the search and hear about the next trip.
  const [alert, setAlert] = useState<'idle' | 'saving' | 'saved' | 'tooMany' | 'error'>('idle');
  const dayStart = searchDayStart(s.day, now);
  const win = alertWindow(dayStart, s.part, now);
  const canAlert = !!s.week && !s.loading && !!win && !shown.some((r) => r.seats_left > 0);
  useEffect(() => setAlert('idle'), [s.part, s.day, s.origin]);

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

  // A trip grows out of its row, over the results (see trip-sheet.tsx).
  const open = onOpenTrip ?? openInLayer;
  // A new key per question replays the rows' entrance, so you see the list change.
  const answerKey = `${s.origin}-${s.day}-${s.part}-${womenOnly}`;

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
      {canAlert ? (
        alert === 'saved' ? (
          <Body muted small>{t('alertSaved')}</Body>
        ) : (
          <View style={{ gap: space.sm }}>
            <Button variant="secondary" icon="bell" label={t('alertMe')} onPress={saveAlert} loading={alert === 'saving'} />
            {alert === 'tooMany' ? <Body error>{t('alertTooMany')}</Body> : null}
            {alert === 'error' ? <Body error>{t('somethingWrong')}</Body> : null}
          </View>
        )
      ) : null}

      {/* First load: a small spinner. After that the old list dims while the new one comes. */}
      {s.loading && !s.week ? <ActivityIndicator style={{ marginTop: space.md }} color={colors.inkSecondary} /> : null}
      <View style={{ marginTop: -space.sm, opacity: s.loading && s.week ? 0.45 : 1 }}>
        {shown.map((r, i) => (
          <Animated.View
            key={`${answerKey}-${r.id}`}
            entering={reduced ? undefined : FadeInDown.duration(260).delay(Math.min(i, 6) * 35)}
            layout={reduced ? undefined : LinearTransition.duration(220)}
          >
            <TimeFirstRow r={r} last={i === shown.length - 1} soon={leavingSoon(r.departs_at, now)} stats={driverStats[r.id]} onPress={(from) => open(r.id, from)} />
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

/** Time of day as quiet tabs (All day, Morning, Afternoon, Evening): an underline, not a box. */
function PartTabs({ s }: { s: SearchState }) {
  const { t } = useT();
  const { f } = useFont();
  const tabs: { value: DayPart | null; label: string }[] = [
    { value: null, label: t('allDay') },
    ...PARTS.map((p) => ({ value: p, label: t(partLabel[p]) })),
  ];
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {tabs.map((o) => {
        const on = o.value === s.part;
        return (
          <Pressable
            key={o.value ?? 'all'}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            hitSlop={8}
            onPress={() => {
              selectFeel();
              s.setPart(o.value);
            }}
            style={[styles.tab, on && styles.tabOn]}
          >
            <Text style={[styles.tabText, { fontFamily: on ? f.bold : f.regular }, on && { color: colors.ink }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
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
  const { t } = useT();
  const { f, rtl } = useFont();
  const full = r.seats_left <= 0;
  const name = r.driver_last_initial ? `${r.driver_first_name} ${r.driver_last_initial}.` : r.driver_first_name;
  const sub = [r.women_only ? t('womenOnly') : null, r.car_model].filter(Boolean).join(' · ');
  const align = rtl ? ('right' as const) : ('left' as const);
  const seatsText = full ? t('full') : `${r.seats_left} ${t('seatsFree')}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${shortTime(new Date(r.departs_at))}, ${name}, ${seatsText}, ${r.price_ils}₪`}
      ref={ref}
      onPress={() => openTripFrom(ref.current, '', (_id, from) => onPress(from ?? null))}
      style={({ pressed }) => [styles.row, !last && styles.rowLine, pressed && { opacity: 0.6 }]}
    >
      <Text style={[styles.time, full && { color: colors.inkSecondary }]}>{shortTime(new Date(r.departs_at))}</Text>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, { fontFamily: f.medium, textAlign: align }, full && { color: colors.inkSecondary }]} numberOfLines={1}>
            {name}
          </Text>
          {r.driver_verified ? (
            <View accessible accessibilityLabel={t('verifiedDriver')}>
              <Icon name="sealCheck" size={15} color={colors.statusOpen} />
            </View>
          ) : null}
        </View>
        <Text style={[styles.meta, { fontFamily: f.regular, textAlign: align }]} numberOfLines={1}>
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
  dayRow: { gap: space.sm },
  dayChip: {
    height: sizes.controlSm,
    paddingHorizontal: 14,
    borderRadius: radii.capsule,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dayChipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  dayText: { fontSize: 13, color: colors.ink },
  tabs: { flexDirection: 'row', gap: 18 },
  tab: { paddingBottom: 6, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: colors.ink },
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
