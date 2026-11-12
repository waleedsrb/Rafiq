// The driver's trip: every state of one of your trips, in the glass card over the map
// (src/components/trip-sheet.tsx), the same frame passengers see.
//
// - Before the day: requests to answer (clay, with a countdown), then your riders as a plain
//   list with a call button each; the pickup point; Cancel as a quiet button at the end.
// - At the pickup: one big button per rider, tapped when they get in (no-show after 10 min).
//   Start turns on once everyone is accounted for.
// - Underway: drive mode (src/components/drive-mode.tsx), light or dark, slide to arrive.
// - Any time until arrival: the checkpoints on the way fill themselves in (Nov 10), so there
//   is only Edit for a rare fix. A closed one on the way asks "going around it?": one tap
//   takes it off the way and tells the riders. Drive mode asks the same.
// - Arrived: the cash reminder and a row of stars per rider, sent once.
//
// A rider's profile and the rating are steps inside the same card. The database decides
// what's allowed (guard_booking, start_trip, finish_trip): this screen only shows the
// right button at the right time.

import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Avatar } from '@/components/avatar';
import { BarricadeMark, useStatusLook } from '@/components/checkpoint-badge';
import { CheckpointPicker, useWayChoices } from '@/components/checkpoint-picker';
import { useContact } from '@/components/contact-card';
import { DriveMode } from '@/components/drive-mode';
import { Icon } from '@/components/icon';
import { PersonProfile } from '@/components/person-profile';
import { useWayCheckpoints } from '@/components/route-map';
import { useRateRiders, type RideToRate } from '@/components/rate-riders';
import { useRepeatsText } from '@/components/repeats';
import { RequestRow } from '@/components/request-row';
import { Stars } from '@/components/stars';
import { StatsLine, usePeopleStats } from '@/components/stats-line';
import { Note } from '@/components/trip-details';
import { TripHero } from '@/components/trip-hero';
import { StepHeader, TripSheet, type Detent, type SheetMini } from '@/components/trip-sheet';
import { Body, Button, ListRow, TextLink, ltr, useFont } from '@/components/ui';
import type { StringKey } from '@/i18n/strings';
import { confirm } from '@/lib/dialog';
import { formatCountdown, formatTime } from '@/lib/format';
import { tapFeel } from '@/lib/haptics';
import { useBookingChanges, useTripChanges } from '@/lib/live';
import { shortName } from '@/lib/names';
import { goBack } from '@/lib/nav';
import { telLink } from '@/lib/phone';
import { centreName, routeName } from '@/lib/places';
import { useDriverPosition } from '@/lib/position';
import { isLateTripCancel } from '@/lib/rules';
import { useSession, useT } from '@/lib/session';
import { openEmergency, shareTrip } from '@/lib/share-trip';
import { cache } from '@/lib/cache';
import { driverTripQuery, type DriverTripData, type DrivenTrip, type RiderRequest } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import type { City } from '@/lib/trip-form';
import { noShowFrom, noShowOpen, pickupOpen, ratingOpen, startOpen, tripState } from '@/lib/trip-day';
import { makeStyles, useTheme } from '@/theme/theme';
import { space } from '@/theme/tokens';

type Trip = DrivenTrip;
type Request = RiderRequest;

type Step = 'details' | 'rider' | 'arrived' | 'way';

/** Seats that count as taken: said yes to, or ridden. */
const holdsSeat = (status: string) => status === 'accepted' || status === 'completed';

export default function DriverTrip() {
  const STATUS_LOOK = useStatusLook();
  const appTheme = useTheme();
  const colors = appTheme.c;
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useT();
  const { f } = useFont();
  const { session } = useSession();
  const repeatsText = useRepeatsText();
  // Opened from My trips, which started loading this as your finger landed (src/lib/cache.ts).
  const [seed] = useState(() => (id ? cache.get<DriverTripData>(driverTripQuery(id).key) : undefined));
  const [trip, setTrip] = useState<Trip | null>(seed?.trip ?? null);
  const [requests, setRequests] = useState<Request[]>(seed?.requests ?? []);
  const [rated, setRated] = useState<Record<string, number>>({}); // booking id -> stars I gave
  const [busy, setBusy] = useState<string | null>(null); // booking id (or 'trip') being updated
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [step, setStep] = useState<Step>('details');
  const [riderId, setRiderId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [want, setWant] = useState<{ to: Detent; key: number } | null>(null);
  // Drive mode starts in the app's look; the sun/moon button switches it for this trip.
  const [dark, setDark] = useState(() => appTheme.dark);

  /** `reuse`: on opening, take an answer My trips just started loading instead of asking twice. */
  const load = useCallback(async (reuse = false) => {
    if (!id) return;
    const query = driverTripQuery(id);
    // Live changes (a new request, a rider checked in) always ask the server afresh.
    const data = reuse ? await cache.load(query, 5_000) : await cache.refetch(query);
    if (!data || cache.failed(query.key)) {
      if (!data) setTrip(null);
      return;
    }
    setTrip(data.trip);
    const list = data.requests;
    setRequests(list);
    const done = list.filter((r) => r.status === 'completed').map((r) => r.id);
    if (done.length > 0 && session) {
      const { data } = await supabase.from('ratings').select('booking_id, stars').eq('rater_id', session.user.id).in('booking_id', done);
      setRated(Object.fromEntries(((data as { booking_id: string; stars: number }[] | null) ?? []).map((x) => [x.booking_id, x.stars])));
    }
  }, [id, session]);

  // Reload on every visit, and whenever a booking or the trip changes.
  useFocusEffect(
    useCallback(() => {
      load(true);
    }, [load]),
  );
  useBookingChanges(() => load(), id ? `trip_id=eq.${id}` : undefined);
  useTripChanges(() => load(), id);

  const passengerStats = usePeopleStats(requests.map((r) => r.passenger_id));

  // Tick every second while someone waits for your answer; every 15 seconds on trip day,
  // so Start and No-show appear on time.
  const waiting = requests.some((r) => r.status === 'requested');
  const confirmed = requests.some((r) => r.status === 'accepted');
  useEffect(() => {
    if (!waiting && !confirmed) return;
    const timer = setInterval(() => setNow(new Date()), waiting ? 1000 : 15_000);
    return () => clearInterval(timer);
  }, [waiting, confirmed]);

  // While the trip is underway, follow the car (drive mode, Share my trip links).
  const underway = !!trip && !!trip.started_at && !trip.finished_at && !trip.cancelled_at;
  const car = useDriverPosition(trip?.id ?? null, underway);

  // ---------- Actions ----------
  // The database checks the timing again; its message picks our text.
  async function act(key: string, fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(key);
    setError(null);
    const { error: err } = await fn();
    setBusy(null);
    if (err) {
      setError(
        err.message.includes('Mark every passenger')
          ? t('startNeedsAll')
          : err.message.includes('Too early')
            ? t('startOpensNote')
            : err.message.includes('Not enough seats')
              ? t('noSeatsLeft')
              : err.message.includes('expired')
                ? t('status_expired')
                : t('somethingWrong'),
      );
    }
    await load();
    return !err;
  }
  const decide = (r: Request, status: 'accepted' | 'declined') =>
    act(r.id, () => supabase.from('bookings').update({ status }).eq('id', r.id));
  // Decline is a small ✕ now, easy to tap by accident, so it asks first.
  async function declineAsk(r: Request) {
    const name = shortName(r.profiles.display_name).split(' ')[0];
    const ok = await confirm({
      title: t('declineAskTitle').replace('{name}', name),
      body: t('declineAskBody'),
      yes: t('declineSorry'),
      no: t('keep'),
      tone: 'warning',
    });
    if (ok) await decide(r, 'declined');
  }
  const board = (r: Request) => {
    tapFeel();
    return act(r.id, () => supabase.rpc('mark_boarded', { p_booking_id: r.id, p_boarded: !r.boarded_at }));
  };
  async function noShow(r: Request) {
    const ok = await confirm({ title: t('noShowConfirmTitle'), body: t('noShowConfirmBody'), yes: t('yesNoShow'), no: t('keep'), tone: 'warning' });
    if (ok) await act(r.id, () => supabase.rpc('mark_no_show', { p_booking_id: r.id }));
  }
  const start = () => act('trip', () => supabase.rpc('start_trip', { p_trip_id: id }));
  // The slide is the confirmation: no pop-up on top of it.
  async function arrive() {
    const ok = await act('trip', () => supabase.rpc('finish_trip', { p_trip_id: id }));
    if (ok) {
      setStep('arrived');
      setWant({ to: 'full', key: Date.now() });
    }
  }

  // Cancelling close to departure with passengers booked is a late cancel (3 in 30 days
  // pause posting for a week). A checkpoint reported closed right now is a fair excuse.
  async function cancelTrip() {
    if (!trip) return;
    const bookedSeats = requests.filter((r) => r.status === 'accepted').reduce((n, r) => n + r.seats, 0);
    let reason: 'checkpoint_closed' | null = null;
    if (isLateTripCancel(new Date(), new Date(trip.departs_at), bookedSeats)) {
      // A closed checkpoint on this trip's own way is a fair excuse.
      const closed = onWay.filter((c) => c.status === 'closed');
      if (closed.length > 0) {
        const names = closed.map((c) => c.name).join('، ');
        const excused = await confirm({
          title: t('closedCheckpointTitle'),
          body: `${t('closedCheckpointBody')} ${names}\n\n${t('closedCheckpointNote')}`,
          yes: t('yesClosed'),
          no: t('otherReason'),
          tone: 'warning',
        });
        if (excused) reason = 'checkpoint_closed';
      }
      if (!reason) {
        const { data: record } = await supabase.rpc('my_driving_record');
        const count = (record as { late_cancels_30d: number }[] | null)?.[0]?.late_cancels_30d ?? 0;
        const ok = await confirm({
          title: t('driverLateCancelTitle'),
          body: `${t('driverLateCancelBody')} ${ltr(count)}`,
          yes: t('yesCancel'),
          no: t('keep'),
          tone: 'danger',
        });
        if (!ok) return;
      }
    } else {
      const ok = await confirm({ title: t('cancelTripTitle'), body: t('cancelTripBody'), yes: t('yesCancel'), no: t('keep'), tone: 'danger' });
      if (!ok) return;
    }
    await act('trip', () => supabase.rpc('cancel_trip', { p_trip_id: trip.id, p_reason: reason }));
  }

  // Stop the weekly pattern: no new trips, and upcoming ones nobody asked for are taken down.
  async function stopRepeating() {
    if (!trip?.trip_series) return;
    const ok = await confirm({ title: t('stopRepeatingTitle'), body: t('stopRepeatingBody'), yes: t('stopRepeating'), no: t('keep') });
    if (ok) await act('series', () => supabase.rpc('stop_trip_series', { p_series_id: trip.trip_series!.id }));
  }

  // ---------- Where things stand ----------
  const departs = new Date(trip?.departs_at ?? Date.now());
  const state = trip ? tripState(trip) : 'scheduled';
  const price = Number(trip?.price_ils ?? 0);
  const route = trip ? routeName(trip.origin, trip.destination, lang) : '';
  const asking = requests.filter((r) => r.status === 'requested');
  const riders = requests.filter((r) => r.status === 'accepted');
  const rode = requests.filter((r) => r.status === 'completed');
  const earlier = requests.filter((r) => !['requested', 'accepted', 'completed'].includes(r.status));
  const booked = requests.filter((r) => holdsSeat(r.status)).reduce((n, r) => n + r.seats, 0);
  const total = Math.max(trip?.seats_total ?? 0, booked);
  const atPickup = state === 'scheduled' && riders.length > 0 && pickupOpen(now, departs);
  const canStart = state === 'scheduled' && confirmed && startOpen(now, departs);
  const notIn = riders.filter((r) => !r.boarded_at);
  const allIn = riders.length > 0 && notIn.length === 0;
  const noShowOk = noShowOpen(now, departs);
  const canCancelTrip = state === 'scheduled' && departs > now;
  const canRate = state === 'finished' && !!trip?.finished_at && ratingOpen(now, new Date(trip.finished_at));
  const unrated = rode.filter((r) => rated[r.id] === undefined);
  const pickupLabel = trip ? (trip.pickup_label ?? centreName(trip.origin, lang)) : '';
  const pickup = trip?.pickup_lat != null && trip.pickup_lng != null ? { latitude: Number(trip.pickup_lat), longitude: Number(trip.pickup_lng) } : null;

  // ---------- Checkpoints on the way, and Change my way ----------
  const origin = trip?.origin ?? '';
  const destination = trip?.destination ?? '';
  const onWay = useWayCheckpoints({ origin, destination, start: pickup, ids: trip?.checkpoint_ids, refreshMs: 60_000 });
  const choices = useWayChoices(origin, destination, pickup);
  const [draft, setDraft] = useState<string[]>([]);
  const canChangeWay = !!trip && !trip.cancelled_at && state !== 'finished';
  const closedOnWay = canChangeWay ? onWay.find((c) => c.status === 'closed') : undefined;
  // Trip day: from 3 hours before leaving, a closed checkpoint also shows at the top of the card.
  const closedSoon = state === 'scheduled' && departs.getTime() - now.getTime() < 3 * 3600_000;
  const openWay = () => {
    setDraft(onWay.map((c) => c.id));
    setStep('way');
    setWant({ to: 'full', key: Date.now() });
  };
  // One tap: a closed checkpoint comes off the way, and the riders are told.
  const goAround = async (id: string) => {
    if (!trip) return;
    await act('way', () => supabase.rpc('change_trip_way', { p_trip: trip.id, p_checkpoints: onWay.map((c) => c.id).filter((c) => c !== id) }));
  };
  const saveWay = async () => {
    if (!trip) return;
    const ok = await act('way', () => supabase.rpc('change_trip_way', { p_trip: trip.id, p_checkpoints: draft }));
    if (ok) setStep('details');
  };

  const toRate: RideToRate[] = rode.map((r) => ({
    bookingId: r.id,
    passengerId: r.passenger_id,
    name: shortName(r.profiles.display_name),
    avatarPath: r.profiles.avatar_path,
    seats: r.seats,
    given: rated[r.id] ?? null,
  }));
  const backToDetails = () => {
    setStep('details');
    load();
  };
  const rate = useRateRiders({ riders: toRate, price, open: canRate, onDone: backToDetails });

  const share = () => trip && shareTrip(trip.id, route, lang, t);
  const emergency = () => trip && session && openEmergency(trip.id, session.user.id, lang, t);

  if (!trip) return <View style={styles.page} />;

  // ---------- Drive mode ----------
  if (state === 'underway' && step !== 'way') {
    return (
      <GestureHandlerRootView style={styles.page}>
        <DriveMode
          origin={trip.origin}
          destination={trip.destination}
          pickup={pickup}
          checkpoints={onWay}
          onGoAround={goAround}
          goingAround={busy === 'way'}
          startedAt={trip.started_at!}
          car={car}
          riders={requests
            .filter((r) => r.status === 'accepted' && r.boarded_at)
            .map((r) => ({ id: r.id, name: shortName(r.profiles.display_name), avatarPath: r.profiles.avatar_path, seed: r.passenger_id }))}
          dark={dark}
          onToggleDark={() => setDark((d) => !d)}
          onArrive={arrive}
          arriving={busy === 'trip'}
          onShare={share}
          onEmergency={emergency}
          onLeave={goBack}
        />
      </GestureHandlerRootView>
    );
  }

  // ---------- The card ----------
  const openRider = (passengerId: string) => {
    setRiderId(passengerId);
    setStep('rider');
    setWant({ to: 'full', key: Date.now() });
  };

  // The small line above the big time says where things stand.
  const tone = (text: string, color: string, icon?: 'check') => (
    <View style={styles.labelRow}>
      {icon ? <Icon name={icon} size={14} color={color} /> : null}
      <Body small style={{ fontFamily: f.medium, color }}>
        {text}
      </Body>
    </View>
  );
  const label = trip.cancelled_at
    ? tone(t('tripCancelled'), colors.inkSecondary)
    : state === 'finished'
      ? tone(t('arrivedSafely'), colors.statusOpen, 'check')
      : asking.length > 0
        ? tone(t('newRequest'), colors.clay)
        : atPickup && allIn
          ? tone(t('allInCar'), colors.statusOpen, 'check')
          : atPickup
            ? tone(`${t('pickupAt')} · ${pickupLabel}`, colors.ink)
            : riders.length > 0
              ? tone(t('ridersConfirmed'), colors.statusOpen, 'check')
              : tone(t('noRequests'), colors.inkSecondary);

  const header = <TripHero label={label} departsAt={trip.departs_at} origin={trip.origin} destination={trip.destination} />;

  const facts = (
    <View>
      <ListRow
        icon="armchair"
        title={t('seatsLine').replace('{booked}', ltr(booked)).replace('{total}', ltr(total))}
        subtitle={t('priceEarn').replace('{price}', ltr(`${price}₪`)).replace('{total}', ltr(`${booked * price}₪`))}
      />
      {trip.trip_series ? (
        <ListRow
          icon="calendar"
          title={trip.trip_series.stopped_at ? t('repeatStopped') : repeatsText(trip.trip_series.weekdays)}
          trailing={
            trip.trip_series.stopped_at || state !== 'scheduled' ? undefined : (
              <TextLink label={t('stopRepeating')} onPress={stopRepeating} disabled={busy === 'series'} />
            )
          }
        />
      ) : null}
      <ListRow last={!canChangeWay && onWay.length === 0} icon="mapPin" title={pickupLabel} subtitle={t('pickupRow')} />
      {canChangeWay || onWay.length ? (
        <ListRow
          last
          icon="barricade"
          // Look B: the barricade, with a dot for the worst status on the way.
          leading={<BarricadeMark status={closedOnWay ? 'closed' : onWay.some((c) => c.status === 'crowded') ? 'crowded' : null} />}
          title={t('checkpointsOnRoute')}
          subtitle={
            onWay.length ? (
              // Each name; a status word only when it is crowded or closed.
              <Text style={[styles.wayText, { fontFamily: f.regular }]}>
                {onWay.map((c, i) => (
                  <Text key={c.id}>
                    {i > 0 ? (lang === 'ar' ? '، ' : ', ') : ''}
                    {c.name}
                    {c.status === 'closed' || c.status === 'crowded' ? (
                      <Text style={{ fontFamily: f.medium, color: STATUS_LOOK[c.status].color }}>
                        {' '}
                        {t(STATUS_LOOK[c.status].word).toLocaleLowerCase()}
                      </Text>
                    ) : null}
                  </Text>
                ))}
              </Text>
            ) : (
              t('wayNone')
            )
          }
          trailing={canChangeWay ? <TextLink label={t('edit')} onPress={openWay} /> : undefined}
        />
      ) : null}
    </View>
  );

  const body = (
    <>
      {trip.cancelled_at ? <Note icon="info" text={t('tripCancelled')} /> : null}
      {/* A closed checkpoint lives in the checkpoints row. Only in the last hours before
          leaving, when it really changes the drive, does it also get a line up here. */}
      {closedOnWay && closedSoon ? (
        <View style={styles.closed}>
          <Icon name="warning" size={16} color={colors.statusClosed} />
          <Body small style={{ flex: 1, fontFamily: f.medium, color: colors.statusClosed }}>
            {t('closedOnYourWay').replace('{name}', closedOnWay.name)}
          </Body>
        </View>
      ) : null}

      {/* Requests: they need your answer, so they come first. */}
      {asking.length > 0 ? (
        <View>
          {asking.map((r, i) => (
            <View key={r.id} style={[styles.ask, i > 0 && styles.askLine]}>
              <RequestRow
                name={shortName(r.profiles.display_name)}
                seats={r.seats}
                avatarPath={r.profiles.avatar_path}
                seed={r.passenger_id}
                stats={passengerStats[r.passenger_id]}
                remaining={r.respond_by ? formatCountdown(new Date(r.respond_by).getTime() - now.getTime()) : null}
                progress={progressOf(r, now)}
                onOpen={() => openRider(r.passenger_id)}
                onAccept={() => decide(r, 'accepted')}
                onDecline={() => declineAsk(r)}
                accepting={busy === r.id}
                disabled={busy !== null}
              />
            </View>
          ))}
        </View>
      ) : null}
      {asking.length > 0 ? (
        <Body muted small>
          {t('unanswered')}
        </Body>
      ) : null}

      {/* Your riders: one row each (look A, Nov 11): call, and at the pickup an "In the car?" capsule. */}
      {riders.length > 0 ? (
        <View>
          {riders.map((r, i) => (
            <RiderRow
              key={r.id}
              r={r}
              last={i === riders.length - 1}
              onOpen={() => openRider(r.passenger_id)}
              checkIn={
                atPickup ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: !!r.boarded_at }}
                    accessibilityLabel={`${t(r.boarded_at ? 'inTheCar' : 'inTheCarAsk')} ${shortName(r.profiles.display_name)}`}
                    onPress={() => board(r)}
                    disabled={busy !== null}
                    hitSlop={4}
                    style={({ pressed }) => [styles.inCar, r.boarded_at ? styles.inCarOn : null, pressed && { opacity: 0.7 }]}
                  >
                    {r.boarded_at ? <Icon name="check" size={16} color={colors.onInk} /> : null}
                    <Text style={[styles.inCarText, { fontFamily: f.medium }, r.boarded_at ? { color: colors.onInk } : null]}>
                      {t(r.boarded_at ? 'inTheCar' : 'inTheCarAsk')}
                    </Text>
                  </Pressable>
                ) : null
              }
              note={
                atPickup && !r.boarded_at ? (
                  r.here_at ? (
                    <Body small style={{ color: colors.clay, fontFamily: f.medium }}>
                      {t('atPickup')}
                    </Body>
                  ) : noShowOk ? (
                    // No-show only takes space once it's allowed (10 minutes after leaving time).
                    <TextLink label={t('markNoShow')} onPress={() => noShow(r)} />
                  ) : (
                    <Body muted small>
                      {t('noShowFrom')} {ltr(formatTime(noShowFrom(departs), lang))}
                    </Body>
                  )
                ) : null
              }
            />
          ))}
        </View>
      ) : null}

      {/* After the trip: who rode, and the stars you gave. */}
      {rode.length > 0 ? (
        <View>
          {rode.map((r, i) => (
            <ListRow
              key={r.id}
              last={i === rode.length - 1}
              leading={<Avatar path={r.profiles.avatar_path} name={r.profiles.display_name} seed={r.passenger_id} />}
              title={shortName(r.profiles.display_name)}
              subtitle={`${ltr(r.seats)} ${t('seatOne')} · ${ltr(`${r.seats * price}₪`)}`}
              trailing={rated[r.id] ? <Stars value={rated[r.id]} /> : undefined}
              onPress={rated[r.id] ? undefined : () => openRider(r.passenger_id)}
            />
          ))}
        </View>
      ) : null}

      {facts}

      {earlier.length > 0 ? (
        <View>
          <Body muted small style={{ paddingTop: space.sm }}>
            {t('earlierRequests')}
          </Body>
          {earlier.map((r, i) => (
            <ListRow
              key={r.id}
              last={i === earlier.length - 1}
              leading={<Avatar path={r.profiles.avatar_path} name={r.profiles.display_name} seed={r.passenger_id} size={32} />}
              title={shortName(r.profiles.display_name)}
              subtitle={t(`status_${r.status}` as StringKey)}
            />
          ))}
        </View>
      ) : null}

      {state === 'scheduled' && confirmed && atPickup && !canStart ? <Body muted small>{t('startOpensNote')}</Body> : null}
      {error ? <Body error>{error}</Body> : null}
    </>
  );

  // The buttons, and the one the bar keeps.
  let footer = null;
  let mini: SheetMini = { sub: `${route} · ${t('seatsLine').replace('{booked}', ltr(booked)).replace('{total}', ltr(total))}` };
  const firstAsk = asking[0];
  if (firstAsk && !trip.cancelled_at) {
    const name = shortName(firstAsk.profiles.display_name).split(' ')[0];
    const left = firstAsk.respond_by ? ` · ${formatCountdown(new Date(firstAsk.respond_by).getTime() - now.getTime())}` : '';
    mini = {
      sub: `${t('requestFrom').replace('{name}', name)}${left}`,
      tone: 'clay',
      action: { label: t('acceptName').replace('{name}', name), onPress: () => decide(firstAsk, 'accepted'), loading: busy === firstAsk.id },
    };
  }
  if (canStart) {
    footer = (
      <>
        <Button label={t('startTrip')} icon="steeringWheel" onPress={start} loading={busy === 'trip'} disabled={!allIn} />
        {allIn ? null : (
          <Body muted small style={{ textAlign: 'center' }}>
            {t('waitingForName').replace('{name}', notIn.map((r) => shortName(r.profiles.display_name).split(' ')[0]).join(lang === 'ar' ? '، ' : ', '))}
          </Body>
        )}
      </>
    );
    if (!firstAsk) {
      mini = allIn
        ? { sub: t('allInCar'), tone: 'ok', action: { label: t('startTrip'), onPress: start, loading: busy === 'trip' } }
        : { sub: t('waitingForName').replace('{name}', notIn.map((r) => shortName(r.profiles.display_name).split(' ')[0]).join(lang === 'ar' ? '، ' : ', ')) };
    }
  } else if (state === 'finished') {
    if (canRate && unrated.length > 0) {
      const rateNow = () => {
        setStep('arrived');
        setWant({ to: 'full', key: Date.now() });
      };
      footer = <Button label={t('rateRiders')} icon="star" onPress={rateNow} />;
      mini = { sub: t('arrivedSafely'), tone: 'ok', action: { label: t('rateOne'), onPress: rateNow } };
    } else {
      mini = { sub: t('arrivedSafely'), tone: 'ok' };
    }
  } else if (canCancelTrip) {
    footer = <Button variant="plain" label={t('cancelTrip')} onPress={cancelTrip} loading={busy === 'trip'} />;
  }

  // Steps replace the details in the same card.
  const riderRow = requests.find((r) => r.passenger_id === riderId);
  const riderName = riderRow ? shortName(riderRow.profiles.display_name) : null;
  const minutes = trip.started_at && trip.finished_at ? Math.max(1, Math.round((+new Date(trip.finished_at) - +new Date(trip.started_at)) / 60_000)) : null;
  const page =
    step === 'rider' && riderId
      ? {
          header: <StepHeader title={riderName ?? t('passengers')} onBack={() => setStep('details')} />,
          body: <PersonProfile id={riderId} />,
          footer: null,
          mini: { sub: route },
        }
      : step === 'way'
        ? {
            header: <StepHeader title={t('checkpointsOnRoute')} kicker={route} onBack={() => setStep('details')} />,
            body: (
              <>
                <CheckpointPicker choices={choices} value={draft} onChange={setDraft} />
                {error ? (
                  <Body error small>
                    {error}
                  </Body>
                ) : null}
              </>
            ),
            footer: (
              <>
                {requests.some((r) => r.status === 'requested' || r.status === 'accepted') ? (
                  <Body muted small style={{ textAlign: 'center' }}>
                    {t('wayRidersTold')}
                  </Body>
                ) : null}
                <Button label={t('saveWay')} onPress={saveWay} loading={busy === 'way'} />
              </>
            ),
            mini: { sub: `${route} · ${t('checkpointsOnRoute')}`, action: { label: t('saveWay'), onPress: saveWay, loading: busy === 'way' } },
          }
      : step === 'arrived'
        ? {
            header: (
              <StepHeader
                title={t('arrivedSafely')}
                kicker={minutes ? t('tripMinutes').replace('{n}', ltr(minutes)) : undefined}
                onBack={backToDetails}
              />
            ),
            body: rate.body,
            footer: rate.footer,
            mini: { sub: t('arrivedSafely'), tone: 'ok' as const },
          }
        : { header, body, footer, mini };

  return (
    <GestureHandlerRootView style={styles.page}>
      <TripSheet
        origin={trip.origin}
        destination={trip.destination}
        departsAt={trip.departs_at}
        pickup={pickup}
        checkpointIds={step === 'way' ? draft : onWay.map((c) => c.id)}
        checkpointsExact
        from={null}
        want={want}
        closing={closing}
        onRequestClose={() => setClosing(true)}
        onClosed={goBack}
        onShare={state === 'scheduled' && riders.length > 0 && step === 'details' ? share : null}
        step={{ key: step, depth: step === 'details' ? 0 : 1 }}
        {...page}
      />
    </GestureHandlerRootView>
  );
}

/** One confirmed rider in one row: photo, name, seats, call; at the pickup, the check-in capsule beside it. */
function RiderRow({
  r,
  last,
  onOpen,
  checkIn,
  note,
}: {
  r: Request;
  last: boolean;
  onOpen: () => void;
  checkIn: ReactNode;
  note: ReactNode;
}) {
  const { c: colors } = useTheme();
  const styles = useStyles();
  const { t, lang } = useT();
  const contact = useContact(r.id);
  const phone = contact?.phone ?? null;
  // Before the hour-before mark the phone is hidden; say when it appears.
  const opensAt = !phone && contact && new Date(contact.opens_at).getTime() > Date.now() ? new Date(contact.opens_at) : null;
  return (
    <View style={[styles.rider, !last && styles.riderLine]}>
      <ListRow
        last
        leading={<Avatar path={r.profiles.avatar_path} name={r.profiles.display_name} seed={r.passenger_id} />}
        title={shortName(r.profiles.display_name)}
        onPress={onOpen}
        subtitle={
          <View style={{ gap: 2 }}>
            {/* No phone number here: the call button dials it. */}
            <Body muted small>
              {ltr(r.seats)} {t('seatOne')}
            </Body>
            {opensAt ? (
              <Body muted small>
                {t('phoneAt').replace('{time}', ltr(formatTime(opensAt, lang)))}
              </Body>
            ) : null}
            {note}
          </View>
        }
        trailing={
          phone || checkIn ? (
            <View style={styles.riderEnd}>
              {phone ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t('call')} ${shortName(r.profiles.display_name)}`}
                  onPress={() => Linking.openURL(telLink(phone)).catch(() => {})}
                  hitSlop={4}
                  style={({ pressed }) => [styles.call, pressed && { opacity: 0.7 }]}
                >
                  <Icon name="phone" size={18} color={colors.onInk} />
                </Pressable>
              ) : null}
              {checkIn}
            </View>
          ) : undefined
        }
      />
    </View>
  );
}

/** How much of the answer window is left, from 1 (just asked) to 0 (expired). */
function progressOf(r: Request, now: Date) {
  if (!r.respond_by) return 0;
  const startMs = new Date(r.created_at).getTime();
  const end = new Date(r.respond_by).getTime();
  return end > startMs ? (end - now.getTime()) / (end - startMs) : 0;
}

const useStyles = makeStyles((colors) => ({
  closed: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.statusClosedSoft },
  wayText: { fontSize: 14, color: colors.inkSecondary },
  page: { flex: 1, backgroundColor: colors.surface },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ask: { paddingVertical: space.sm },
  askLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
  rider: { paddingBottom: space.sm },
  riderLine: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  riderEnd: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  // 40pt targets plus 4pt hitSlop keep the 48pt tap area, same as the request rows.
  inCar: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.ink,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  inCarOn: { backgroundColor: colors.statusOpen, borderColor: colors.statusOpen },
  inCarText: { fontSize: 15, color: colors.ink },
  call: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
}));
