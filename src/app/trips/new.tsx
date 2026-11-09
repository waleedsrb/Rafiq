// Driver posts a trip, as four short steps inside the trip card over the map (Nov 9,
// driver flow, Option A): where to, where you meet riders, when, then seats and price.
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
import { ScrollView, StyleSheet, Switch, View, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { PickupMap } from '@/components/pickup-map';
import { PlacePicker } from '@/components/place-picker';
import { RouteCard } from '@/components/route-card';
import { TimeWheel } from '@/components/time-wheel';
import { TripHero } from '@/components/trip-hero';
import { StepHeader, TripSheet, sheetMidTop, type SheetMini } from '@/components/trip-sheet';
import { Body, Button, Chip, Field, ListRow, PillChips, Stepper, ltr } from '@/components/ui';
import { photoGate, photoGateText } from '@/lib/avatar';
import { formatChipDay, formatDay, formatLongDay, shortTime } from '@/lib/format';
import { successFeel } from '@/lib/haptics';
import { goBack } from '@/lib/nav';
import { centreName, centrePoint, NABLUS, place, placeKm, RAMALLAH, routeName, type LatLng } from '@/lib/places';
import { labelOk, movePickup, offerSpots, spotAt, type Pickup } from '@/lib/pickup';
import { askForPush } from '@/lib/push';
import { WEEK, WORK_WEEK, toDbTime, toggleDay, weekdayName } from '@/lib/recurring';
import { isVerifiedWoman, useSession, useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { PRICE_MAX, SEATS_MAX, SEATS_MIN, suggestedPrice, type City } from '@/lib/trip-form';
import { colors, space } from '@/theme/tokens';

type Step = 'where' | 'pickup' | 'when' | 'seats' | 'posted';
type FormStep = Exclude<Step, 'posted'>;
const STEPS: FormStep[] = ['where', 'pickup', 'when', 'seats'];
const DAYS = 7; // today plus the next 6: drivers post a week ahead at most
const WEEKLY = DAYS; // the "Weekly" pill sits after the days

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
  const [picking, setPicking] = useState<'origin' | 'destination' | null>(null);

  const [step, setStep] = useState<Step>('where');
  const [closing, setClosing] = useState(false);
  const [day, setDay] = useState(() => Math.min(DAYS - 1, Math.max(0, Number(params.day) || 0)));
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

  // ─── When ─────────────────────────────────────────────────────────────────────
  const weekly = day === WEEKLY;
  const departs = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + (weekly ? 0 : day));
    d.setHours(time.h, time.m, 0, 0);
    return d;
  }, [day, time.h, time.m, weekly]);
  const timePassed = !weekly && departs.getTime() <= Date.now();
  const dayLabels = useMemo(
    () => [
      ...Array.from({ length: DAYS }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() + i);
        return i === 0 ? t('today') : i === 1 ? t('tomorrow') : formatChipDay(d, lang);
      }),
      t('weeklyChip'),
    ],
    [t, lang],
  );
  const whenText = weekly ? t('weeklyChip') : day === 0 ? t('today') : day === 1 ? t('tomorrow') : formatDay(departs, lang);

  // ─── Steps ────────────────────────────────────────────────────────────────────
  const index = step === 'posted' ? STEPS.length : STEPS.indexOf(step);
  const stepOk =
    step === 'pickup' ? !!pickup && labelOk(pickup.label) : step === 'when' ? !timePassed && (!weekly || weekdays.length > 0) : true;
  const close = () => setClosing(true);
  const next = () => {
    setError(null);
    if (step === 'seats') return publish();
    setStep(STEPS[index + 1]);
  };
  const back = () => {
    setError(null);
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
    footer = <Button label={t('done')} onPress={close} />;
    mini = { sub: title, tone: 'ok', action: { label: t('done'), onPress: close } };
  } else {
    const form = step as FormStep;
    const titles: Record<FormStep, string> = {
      where: t('postStepWhere'),
      pickup: t('postStepPickup'),
      when: t('postStepWhen'),
      seats: t('postStepSeats'),
    };
    const kicker = `${t('postTripTitle')} · ${ltr(index + 1)} ${t('stepOf')} ${ltr(STEPS.length)}`;
    header = <StepHeader title={titles[form]} kicker={kicker} onBack={back} />;

    if (form === 'where') {
      body = (
        <>
          <RouteCard
            origin={origin}
            destination={destination}
            onSwap={() => pickRoute({ origin: destination, destination: origin })}
            onPick={setPicking}
          />
          {past.length ? (
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
          {demand ? (
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
    } else if (form === 'when') {
      body = (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 2 }}>
            <PillChips labels={dayLabels} selected={day} onPick={setDay} />
          </ScrollView>
          {weekly ? (
            <View style={styles.weekdays}>
              {WEEK.map((d) => (
                <Chip key={d} label={weekdayName(d, lang)} selected={weekdays.includes(d)} onPress={() => setWeekdays((cur) => toggleDay(cur, d))} />
              ))}
            </View>
          ) : null}
          <TimeWheel h={time.h} m={time.m} onChange={(h, m) => setTime({ h, m })} />
          {timePassed ? (
            <Body error small style={{ textAlign: 'center' }}>
              {t('timeInvalid')}
            </Body>
          ) : null}
          {weekly ? (
            <Body muted small>
              {t('repeatHint')}
            </Body>
          ) : null}
        </>
      );
    } else {
      body = (
        <View>
          <ListRow icon="users" title={t('seatsLabel')} trailing={<Stepper value={seats} min={SEATS_MIN} max={SEATS_MAX} onChange={setSeats} />} />
          <ListRow
            last={!canWomenOnly}
            icon="currency"
            title={`${t('seatPrice')} · ${ltr(`${price}₪`)}`}
            subtitle={
              km !== null
                ? `${t('suggestedForKm').replace('{n}', ltr(Math.round(km)))} ${ltr(`${suggestedPrice(km)}₪`)}`
                : `${t('suggestedPrice')} ${ltr(`${suggestedPrice(km)}₪`)}`
            }
            trailing={<Stepper value={price} min={1} max={PRICE_MAX} onChange={setPrice} />}
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
    const nextLabel = form === 'seats' ? `${t('publishTrip')} · ${whenText} ${ltr(shortTime(departs))}` : t('nextStep');
    footer = (
      <>
        {error ? (
          <Body error small style={{ textAlign: 'center' }}>
            {error}
          </Body>
        ) : null}
        <Button label={nextLabel} onPress={next} disabled={!stepOk} loading={saving} />
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
        map={step === 'pickup' && !pausedUntil ? <PickupMap center={mapAt} onMove={onMapMove} visibleBottom={sheetMidTop(H)} /> : undefined}
      />
      <PlacePicker
        visible={picking !== null}
        title={t(picking === 'destination' ? 'whereTo' : 'whereFrom')}
        exclude={picking === 'destination' ? origin : picking === 'origin' ? destination : undefined}
        onPick={(id) => {
          // Picking the town at the other end flips the route.
          if (picking === 'origin') pickRoute(id === destination ? { origin: id, destination: origin } : { origin: id, destination });
          else pickRoute(id === origin ? { origin: destination, destination: id } : { origin, destination: id });
          setPicking(null);
        }}
        onClose={() => setPicking(null)}
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
