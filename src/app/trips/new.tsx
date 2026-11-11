// Driver posts a trip, as four short steps inside the trip card over the map (Nov 9,
// driver flow, Option A): where to, where you meet riders, when, then seats and price.
//
// The checkpoints on the way fill themselves in (Nov 10, Waleed: no extra step): the list
// from the last real drive on this route (learned_checkpoints), else the ones near the way.
// The last step shows them in one line with Edit, for the rare fix.
// It uses the same card as a passenger's trip (src/components/trip-sheet.tsx), so the
// tinted glass, the bar, the spacing and the calm motion are the same on both sides.
//
// The card starts filled in from your last trip (route, pickup, time, seats, price), so
// on a normal day posting is Next, Next, Next, Publish. Home's "post your usual trip"
// opens it with the route and time already chosen.
//
// After Publish the steps turn into the posted trip in place, and only then do we ask
// for notifications ("tell me when someone asks for a seat").

import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Switch, View, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { CheckpointPicker, useWayChoices } from '@/components/checkpoint-picker';
import { PickupMap } from '@/components/pickup-map';
import { PlaceFields, PlaceResults, usePlaceSearch } from '@/components/place-search';
import { RouteCard } from '@/components/route-card';
import { DayPills } from '@/components/day-pills';
import { TimeRuler } from '@/components/time-ruler';
import { TripHero } from '@/components/trip-hero';
import { StepHeader, TripSheet, sheetMidTop, type SheetMini } from '@/components/trip-sheet';
import { Body, Button, Chip, Field, ListRow, Stepper, TextLink, ltr } from '@/components/ui';
import { photoGate, photoGateText } from '@/lib/avatar';
import { formatDay, formatLongDay, shortTime } from '@/lib/format';
import { successFeel } from '@/lib/haptics';
import { earliestToday, LAST, minutesOf, slotBars, untilWords } from '@/lib/leave-time';
import { goBack } from '@/lib/nav';
import { centreName, centrePoint, NABLUS, place, placeKm, RAMALLAH, routeName, type LatLng } from '@/lib/places';
import { labelOk, movePickup, offerSpots, spotAt, type Pickup } from '@/lib/pickup';
import { askForPush } from '@/lib/push';
import { WEEK, WORK_WEEK, toDbTime, toggleDay, weekdayName } from '@/lib/recurring';
import { isVerifiedWoman, useSession, useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { PRICE_MAX, SEATS_MAX, SEATS_MIN, suggestedPrice, type City } from '@/lib/trip-form';
import { AHEAD_DAYS } from '@/lib/trip-search';
import { inDrivingOrder } from '@/lib/way';
import { colors, space } from '@/theme/tokens';

type Step = 'where' | 'pickup' | 'way' | 'when' | 'seats' | 'posted';
type FormStep = Exclude<Step, 'posted'>;
const STEPS: FormStep[] = ['where', 'pickup', 'when', 'seats'];
// 'way' is not in the row of steps: it opens from Edit on the last step and goes back to it.
// Days: 0 = today .. AHEAD_DAYS (30, from the calendar); WEEKLY is the "Weekly" pill after them.
const WEEKLY = -1;

type LastTrip = {
  origin: City;
  destination: City;
  departs_at: string;
  seats_total: number;
  price_ils: number;
  pickup_label: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
};

export default function NewTrip() {
  const { t, lang } = useT();
  const { session, profile } = useSession();
  const { height: H } = useWindowDimensions();
  const canWomenOnly = isVerifiedWoman(profile);

  // Home's "post your usual trip" opens this already filled in.
  const params = useLocalSearchParams<{ origin?: City; destination?: City; day?: string; time?: string }>();
  const [ends, setRoute] = useState<{ origin: City; destination: City }>(() => {
    const o = place(params.origin)?.id ?? RAMALLAH;
    const d = place(params.destination)?.id;
    return { origin: o, destination: d && d !== o ? d : o === NABLUS ? RAMALLAH : NABLUS };
  });
  const { origin, destination } = ends;
  // Tapping From or To turns the route card into the two place fields, in the card itself.
  const places = usePlaceSearch();
  const picking = places.end;
  const [want, setWant] = useState<{ to: 'full' | 'mid'; key: number } | null>(null);
  const openPlaces = (end: 'origin' | 'destination') => {
    places.open(end);
    setWant((w) => ({ to: 'full', key: (w?.key ?? 0) + 1 })); // room for the town list
  };
  const closePlaces = () => {
    places.close();
    setWant((w) => ({ to: 'mid', key: (w?.key ?? 0) + 1 }));
  };

  const [step, setStep] = useState<Step>('where');
  const [closing, setClosing] = useState(false);
  const [day, setDay] = useState(() => {
    if (params.day !== undefined) return Math.min(AHEAD_DAYS, Math.max(0, Number(params.day) || 0));
    // Nothing asked for: today, unless the usual 7:30 has already gone by.
    const t = parseHm(params.time) ?? { h: 7, m: 30 };
    const first = earliestToday(new Date());
    return first !== null && t.h * 60 + t.m >= first ? 0 : 1;
  });
  const [weekdays, setWeekdays] = useState<number[]>(WORK_WEEK);
  const [time, setTime] = useState(() => parseHm(params.time) ?? { h: 7, m: 30 });
  const [seats, setSeats] = useState(3);
  const km = placeKm(origin, destination);
  const [price, setPrice] = useState(() => suggestedPrice(km));
  const [womenOnly, setWomenOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [posted, setPosted] = useState<{ weekly: boolean; departsAt: string } | null>(null);
  // After 3 late cancels in 30 days, posting pauses for a week (see my_driving_record()).
  const [pausedUntil, setPausedUntil] = useState<Date | null>(null);

  // ─── Your last trip fills the card in ─────────────────────────────────────────
  const [last, setLast] = useState<LastTrip | null>(null);
  // The routes you post most, for one-tap picking on the first step.
  const [past, setPast] = useState<{ origin: City; destination: City; times: number }[]>([]);
  // A new route gets the price that fits its distance (your last trip's price stays for the same route).
  const pickRoute = (next: { origin: City; destination: City }) => {
    setRoute(next);
    const sameAsLast = last && place(last.origin)?.id === next.origin && place(last.destination)?.id === next.destination;
    setPrice(sameAsLast ? Math.min(PRICE_MAX, Math.max(1, Math.round(Number(last.price_ils)))) : suggestedPrice(placeKm(next.origin, next.destination)));
  };
  useEffect(() => {
    if (!session) return;
    supabase
      .from('trips')
      .select('origin, destination, departs_at, seats_total, price_ils, pickup_label, pickup_lat, pickup_lng')
      .eq('driver_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        const rows = (data as LastTrip[] | null) ?? [];
        setPast(usualRoutes(rows));
        const l = rows[0];
        if (!l) return;
        setLast(l);
        if (!params.origin && place(l.origin) && place(l.destination)) setRoute({ origin: place(l.origin)!.id, destination: place(l.destination)!.id });
        if (!params.time) {
          const d = new Date(l.departs_at);
          setTime({ h: d.getHours(), m: d.getMinutes() });
          // Your usual time has gone by today? Start on tomorrow instead.
          const first = earliestToday(new Date());
          if (params.day === undefined && (first === null || minutesOf(d) < first)) setDay((cur) => (cur === 0 ? 1 : cur));
        }
        setSeats(Math.min(SEATS_MAX, Math.max(SEATS_MIN, l.seats_total)));
        setPrice(Math.min(PRICE_MAX, Math.max(1, Math.round(Number(l.price_ils)))));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // No car yet? Add it first. Car not checked yet? Send the driver check first.
  // (The database would refuse the trip anyway: see require_car().)
  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      supabase
        .from('driver_details')
        .select('verified_at')
        .eq('driver_id', session.user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (!data) router.push('/car');
          else if (!data.verified_at) router.replace({ pathname: '/verify', params: { kind: 'driver' } });
        });
      supabase.rpc('my_driving_record').then(({ data }) => {
        const until = (data as { paused_until: string | null }[] | null)?.[0]?.paused_until;
        setPausedUntil(until ? new Date(until) : null);
      });
    }, [session]),
  );

  // Riders who asked to be alerted on this route: the first day someone is waiting.
  const [demand, setDemand] = useState<{ on_date: string; waiting: number } | null>(null);
  useEffect(() => {
    let gone = false;
    supabase.rpc('alert_demand', { p_origin: origin, p_destination: destination }).then(({ data }) => {
      if (!gone) setDemand(((data as { on_date: string; waiting: number }[] | null) ?? [])[0] ?? null);
    });
    return () => {
      gone = true;
    };
  }, [origin, destination]);

  // ─── Pickup ───────────────────────────────────────────────────────────────────
  const [popular, setPopular] = useState<Pickup[]>([]);
  useEffect(() => {
    let gone = false;
    supabase.rpc('popular_pickups', { p_city: origin, p_limit: 3 }).then(({ data }) => {
      if (gone) return;
      const rows = (data as { label: string; lat: number; lng: number }[] | null) ?? [];
      setPopular(rows.map((r) => ({ label: r.label, latitude: Number(r.lat), longitude: Number(r.lng) })));
    });
    return () => {
      gone = true;
    };
  }, [origin]);
  const usual: Pickup | null =
    last && last.origin === origin && last.pickup_label && last.pickup_lat !== null && last.pickup_lng !== null
      ? { label: last.pickup_label, latitude: Number(last.pickup_lat), longitude: Number(last.pickup_lng) }
      : null;
  const centreLabel = centreName(origin, lang);
  const spots = useMemo(
    () => offerSpots(usual, popular, { label: centreLabel, ...centrePoint(origin) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [usual?.label, usual?.latitude, usual?.longitude, popular, centreLabel, origin],
  );
  const [pickup, setPickup] = useState<Pickup | null>(null);
  const [mapAt, setMapAt] = useState<LatLng & { key: number }>({ ...centrePoint(origin), key: 0 });
  const pickSpot = (p: Pickup) => {
    setPickup({ label: p.label, latitude: p.latitude, longitude: p.longitude });
    setMapAt((m) => ({ latitude: p.latitude, longitude: p.longitude, key: m.key + 1 }));
  };
  // A new city (or your usual spot arriving): start from the best offered spot.
  const best = spots[0];
  useEffect(() => {
    if (best) pickSpot(best);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, best?.label]);
  // The map moved under the pin. A tapped spot lands on that spot, so nothing changes.
  const pickupRef = useRef(pickup);
  pickupRef.current = pickup;
  const onMapMove = (at: LatLng) => {
    const prev = pickupRef.current ?? best ?? { label: '', ...at };
    setPickup(movePickup(prev, at, spots));
  };
  const onSpot = pickup ? spotAt(spots, pickup) : null;

  // ─── Checkpoints on the way ───────────────────────────────────────────────────
  // The last real drive on this route, else the ones near the way, until the driver edits
  // the list; a new route starts over.
  const choices = useWayChoices(origin, destination, pickup);
  const [wayIds, setWayIds] = useState<string[] | null>(null);
  const [learned, setLearned] = useState<string[] | null>(null);
  useEffect(() => {
    setWayIds(null);
    setLearned(null);
    let gone = false;
    supabase.rpc('learned_checkpoints', { p_origin: origin, p_destination: destination }).then(({ data }) => {
      if (!gone) setLearned((data as string[] | null) ?? []);
    });
    return () => {
      gone = true;
    };
  }, [origin, destination]);
  const way = wayIds ?? (learned && learned.length ? learned : choices.suggested.map((c) => c.id));
  const wayNames = inDrivingOrder(choices.from, choices.to, choices.all.filter((c) => way.includes(c.id))).map((c) => c.name);

  // ─── When ─────────────────────────────────────────────────────────────────────
  const weekly = day === WEEKLY;
  const departs = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + (weekly ? 0 : day));
    d.setHours(time.h, time.m, 0, 0);
    return d;
  }, [day, time.h, time.m, weekly]);
  const timePassed = !weekly && departs.getTime() <= Date.now();
  // Today the ruler starts 30 minutes from now (on the half hour); other days start at midnight.
  const nowMin = minutesOf(new Date());
  const firstToday = earliestToday(new Date());
  const minToday = day === 0 ? (firstToday ?? LAST) : 0;
  const leaveMin = time.h * 60 + time.m;
  // Switching to today with a time that has gone by moves the time up to the earliest one.
  useEffect(() => {
    if (day === 0 && firstToday !== null && leaveMin < firstToday) setTime({ h: Math.floor(firstToday / 60), m: firstToday % 60 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);
  // Riders with an open ride alert, per half hour of the chosen day (bars over the ruler).
  const [bars, setBars] = useState<number[] | undefined>(undefined);
  const barsDay = weekly ? null : departs.toLocaleDateString('en-CA');
  useEffect(() => {
    setBars(undefined);
    if (step !== 'when' || !barsDay) return;
    let live = true;
    supabase.rpc('alert_demand_by_slot', { p_origin: origin, p_destination: destination, p_day: barsDay }).then(({ data, error: err }) => {
      // Before the database function exists (or offline) there are simply no bars.
      if (live && !err) setBars(slotBars(data as { slot: number; riders: number }[] | null));
    });
    return () => {
      live = false;
    };
  }, [step, origin, destination, barsDay]);
  const whenText = weekly ? t('weeklyChip') : day === 0 ? t('today') : day === 1 ? t('tomorrow') : formatDay(departs, lang);

  // ─── Steps ────────────────────────────────────────────────────────────────────
  const index = step === 'posted' || step === 'way' ? STEPS.length : STEPS.indexOf(step);
  const stepOk =
    step === 'pickup' ? !!pickup && labelOk(pickup.label) : step === 'when' ? !timePassed && (!weekly || weekdays.length > 0) : true;
  const close = () => setClosing(true);
  const next = () => {
    setError(null);
    if (step === 'seats') return publish();
    if (step === 'way') return setStep('seats');
    setStep(STEPS[index + 1]);
  };
  const back = () => {
    setError(null);
    if (picking) return closePlaces();
    if (step === 'way') return setStep('seats');
    if (index <= 0) close();
    else setStep(STEPS[index - 1]);
  };

  async function publish() {
    if (!session || !pickup) return;
    if (!(await photoGate(!!profile?.avatar_path, photoGateText(t)))) return;
    const common = {
      driver_id: session.user.id,
      origin,
      destination,
      seats_total: seats,
      price_ils: price,
      women_only: canWomenOnly && womenOnly,
      pickup_label: pickup.label.trim(),
      pickup_lat: pickup.latitude,
      pickup_lng: pickup.longitude,
      checkpoint_ids: way,
    };
    setSaving(true);
    setError(null);
    const { error: err } = weekly
      ? // A weekly pattern: the server posts the real trips for the coming week, and keeps doing so.
        await supabase.from('trip_series').insert({ ...common, weekdays, depart_time: toDbTime(time.h, time.m) }) // a wall-clock time in Palestine
      : await supabase.from('trips').insert({ ...common, departs_at: departs.toISOString() }); // stored in UTC, shown in local time
    setSaving(false);
    if (err) {
      if (err.message.includes('Posting is paused')) {
        const { data } = await supabase.rpc('my_driving_record');
        const until = (data as { paused_until: string | null }[] | null)?.[0]?.paused_until;
        return setPausedUntil(until ? new Date(until) : null);
      }
      if (err.message.includes('profile photo')) return setError(t('photoNeeded'));
      return setError(err.message.includes('not approved') ? t('driverCheckNeeded') : t('somethingWrong'));
    }
    successFeel();
    setPosted({ weekly, departsAt: departs.toISOString() });
    setStep('posted');
    // Now is when notifications make sense: "tell me when someone asks for a seat".
    askForPush();
  }

  // ─── The card's slots per step ────────────────────────────────────────────────
  const route = routeName(origin, destination, lang);
  let header;
  let body;
  let footer;
  let mini: SheetMini;

  if (pausedUntil && step !== 'posted') {
    header = <StepHeader title={t('postTrip')} onBack={close} />;
    body = (
      <Body error>
        {t('postingPausedUntil')} {formatLongDay(pausedUntil, lang)} {ltr(shortTime(pausedUntil))} {t('postingPausedWhy')}
      </Body>
    );
    footer = <Button variant="secondary" label={t('done')} onPress={close} />;
    mini = { sub: t('postTrip'), tone: 'clay' };
  } else if (step === 'posted' && posted) {
    const title = t(posted.weekly ? 'seriesPosted' : 'tripPosted');
    header = (
      <TripHero
        label={
          <Body small style={{ color: colors.statusOpen }}>
            {title}
          </Body>
        }
        departsAt={posted.departsAt}
        origin={origin}
        destination={destination}
      />
    );
    body = (
      <View>
        <ListRow icon="mapPin" title={pickup?.label ?? centreLabel} subtitle={t('pickupRow')} />
        <ListRow
          icon="users"
          title={`${ltr(seats)} ${t('seatsLabel')} · ${ltr(`${price}₪`)} ${t('perSeat')}`}
          subtitle={posted.weekly ? `${t('weeklyChip')} · ${weekdays.map((d) => weekdayName(d, lang)).join('، ')}` : undefined}
        />
        <ListRow last icon="bell" title={t('tripPostedNext')} />
      </View>
    );
    footer = <Button testID="post-done" label={t('done')} onPress={close} />;
    mini = { sub: title, tone: 'ok', action: { label: t('done'), onPress: close } };
  } else {
    const form = step as FormStep;
    const titles: Record<FormStep, string> = {
      where: t('postStepWhere'),
      pickup: t('postStepPickup'),
      way: t('postStepWay'),
      when: t('postStepWhen'),
      seats: t('postStepSeats'),
    };
    const kicker = form === 'way' ? t('postTripTitle') : `${t('postTripTitle')} · ${ltr(index + 1)} ${t('stepOf')} ${ltr(STEPS.length)}`;
    header = <StepHeader title={titles[form]} kicker={kicker} onBack={back} />;

    if (form === 'where') {
      body = (
        <>
          {picking ? (
            <>
              <PlaceFields search={places} origin={origin} destination={destination} />
              <PlaceResults
                search={places}
                exclude={picking === 'destination' ? origin : destination}
                onPick={(id) => {
                  pickRoute(picking === 'origin' ? { origin: id, destination } : { origin, destination: id });
                  closePlaces();
                }}
              />
            </>
          ) : (
            <RouteCard
              origin={origin}
              destination={destination}
              onSwap={() => pickRoute({ origin: destination, destination: origin })}
              onPick={openPlaces}
            />
          )}
          {!picking && past.length ? (
            <View>
              {past.map((r, i) => (
                <ListRow
                  key={`${r.origin}-${r.destination}`}
                  last={i === past.length - 1}
                  icon={r.origin === origin && r.destination === destination ? 'check' : 'clock'}
                  title={routeName(r.origin, r.destination, lang)}
                  subtitle={t('postedTimes').replace('{n}', ltr(r.times))}
                  onPress={() => pickRoute({ origin: r.origin, destination: r.destination })}
                />
              ))}
            </View>
          ) : null}
          {!picking && demand ? (
            <View style={styles.demand}>
              <ListRow
                last
                icon="users"
                title={`${t('demandWaiting')}: ${ltr(demand.waiting)} · ${formatDay(new Date(`${demand.on_date}T12:00:00`), lang)}`}
                subtitle={t('demandHint')}
              />
            </View>
          ) : null}
        </>
      );
    } else if (form === 'pickup') {
      body = (
        <>
          <Body muted small>
            {t('pickupHint')}
          </Body>
          <View>
            {spots.map((s, i) => (
              <ListRow
                key={`${s.kind}-${s.label}`}
                last={i === spots.length - 1}
                icon={onSpot === s ? 'check' : 'mapPin'}
                title={s.label}
                subtitle={t(s.kind === 'usual' ? 'pickupYourUsual' : s.kind === 'popular' ? 'pickupPopular' : 'pickupCityCentre')}
                onPress={() => pickSpot(s)}
              />
            ))}
          </View>
          <Field
            label={t('pickupLabel')}
            value={pickup?.label ?? ''}
            onChangeText={(v) => setPickup((p) => (p ? { ...p, label: v } : { label: v, ...centrePoint(origin) }))}
            placeholder={t('pickupLabelPlaceholder')}
            maxLength={80}
          />
        </>
      );
    } else if (form === 'way') {
      body = <CheckpointPicker choices={choices} value={way} onChange={setWayIds} />;
    } else if (form === 'when') {
      body = (
        <>
          {/* The calendar takes the ruler's place while it is open; the card keeps its height. */}
          <DayPills day={day} onDay={setDay} extra={{ label: t('weeklyChip'), onPick: () => setDay(WEEKLY) }}>
            {weekly ? (
              <View style={styles.weekdays}>
                {WEEK.map((d) => (
                  <Chip key={d} label={weekdayName(d, lang)} selected={weekdays.includes(d)} onPress={() => setWeekdays((cur) => toggleDay(cur, d))} />
                ))}
              </View>
            ) : null}
            {day === 0 && firstToday === null ? (
              <Body muted style={{ textAlign: 'center' }}>
                {t('noTimeToday')}
              </Body>
            ) : (
              <View style={{ gap: space.sm }}>
                <TimeRuler minutes={leaveMin} min={minToday} onChange={(m) => setTime({ h: Math.floor(m / 60), m: m % 60 })} bars={bars} />
                {!weekly ? (
                  <Body muted small style={{ textAlign: 'center' }}>
                    {day === 0 ? t('leaveIn').replace('{t}', ltr(untilWords(Math.max(0, leaveMin - nowMin), lang === 'ar'))) : formatDay(departs, lang)}
                  </Body>
                ) : null}
              </View>
            )}
            {weekly ? (
              <Body muted small>
                {t('repeatHint')}
              </Body>
            ) : null}
          </DayPills>
        </>
      );
    } else {
      body = (
        <View>
          <ListRow icon="users" title={t('seatsLabel')} trailing={<Stepper value={seats} min={SEATS_MIN} max={SEATS_MAX} onChange={setSeats} />} />
          <ListRow
            icon="currency"
            title={`${t('seatPrice')} · ${ltr(`${price}₪`)}`}
            subtitle={
              km !== null
                ? `${t('suggestedForKm').replace('{n}', ltr(Math.round(km)))} ${ltr(`${suggestedPrice(km)}₪`)}`
                : `${t('suggestedPrice')} ${ltr(`${suggestedPrice(km)}₪`)}`
            }
            trailing={<Stepper value={price} min={1} max={PRICE_MAX} onChange={setPrice} />}
          />
          <ListRow
            last={!canWomenOnly}
            icon="barricade"
            title={t('checkpointsOnRoute')}
            subtitle={wayNames.length ? wayNames.join(lang === 'ar' ? '، ' : ', ') : t('wayNone')}
            trailing={<TextLink label={t('edit')} onPress={() => setStep('way')} />}
            onPress={() => setStep('way')}
          />
          {canWomenOnly ? (
            <ListRow
              last
              icon="shieldCheck"
              title={t('womenOnly')}
              subtitle={t('womenOnlyHint')}
              trailing={<Switch value={womenOnly} onValueChange={setWomenOnly} accessibilityLabel={t('womenOnly')} />}
            />
          ) : null}
        </View>
      );
    }

    // The last button says exactly what goes out: "Publish trip · Tomorrow 7:30".
    const nextLabel = form === 'seats' ? `${t('publishTrip')} · ${whenText} ${ltr(shortTime(departs))}` : form === 'way' ? t('done') : t('nextStep');
    footer = picking ? undefined : (
      <>
        {error ? (
          <Body error small style={{ textAlign: 'center' }}>
            {error}
          </Body>
        ) : null}
        <Button testID="post-next" label={nextLabel} onPress={next} disabled={!stepOk} loading={saving} />
      </>
    );
    mini = {
      sub: `${route} · ${titles[form]}`,
      action: stepOk ? { label: form === 'seats' ? t('publishTrip') : t('nextStep'), onPress: next, loading: saving } : null,
    };
  }

  return (
    <GestureHandlerRootView style={styles.page}>
      <TripSheet
        origin={origin}
        destination={destination}
        departsAt={posted?.departsAt ?? departs.toISOString()}
        header={header}
        body={body}
        footer={footer}
        mini={mini}
        from={null}
        closing={closing}
        onRequestClose={close}
        onClosed={goBack}
        step={{ key: step, depth: index }}
        pickup={pickup}
        checkpointIds={way}
        checkpointsExact
        want={want}
        fitContent={step !== 'pickup'}
        noFull={step === 'when'}
        map={step === 'pickup' && !pausedUntil ? <PickupMap center={mapAt} onMove={onMapMove} visibleBottom={sheetMidTop(H)} /> : undefined}
      />
    </GestureHandlerRootView>
  );
}

/** Your most posted routes (up to 3), most first, from your recent trips. */
function usualRoutes(rows: { origin: City; destination: City }[]): { origin: City; destination: City; times: number }[] {
  const count = new Map<string, { origin: City; destination: City; times: number }>();
  for (const r of rows) {
    const o = place(r.origin)?.id;
    const d = place(r.destination)?.id;
    if (!o || !d) continue;
    const key = `${o}>${d}`;
    const c = count.get(key) ?? { origin: o, destination: d, times: 0 };
    c.times++;
    count.set(key, c);
  }
  return [...count.values()].sort((a, b) => b.times - a.times).slice(0, 3);
}

/** "7:30" from Home's link, or null. */
function parseHm(s: string | undefined): { h: number; m: number } | null {
  const m = s?.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  return h < 24 && mm < 60 ? { h, m: mm } : null;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  weekdays: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  demand: { borderRadius: 16, backgroundColor: colors.claySoft, paddingHorizontal: space.md },
});
