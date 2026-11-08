// Driver: see who asked for a seat on one of your trips, and accept or decline.
// The database decides whether a change is allowed (guard_booking): only the
// driver may accept, and an accept fails if the car would be overbooked.
// On the day this is also "Driver at pickup": tick who got in, mark no-shows,
// Start trip, then Arrived, then rate each passenger.

import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BookingContact } from '@/components/contact-card';
import { useRepeatsText } from '@/components/repeats';
import { SeatDots } from '@/components/seat-dots';
import { TripHero } from '@/components/trip-hero';
import { StatsLine, usePeopleStats } from '@/components/stats-line';
import { Stars } from '@/components/stars';
import { Body, Button, Chip, Countdown, IconCircle, ListRow, Screen, SectionTitle, TextLink, ltr } from '@/components/ui';
import type { StringKey } from '@/i18n/strings';
import { confirm } from '@/lib/dialog';
import { formatCountdown, formatTime } from '@/lib/format';
import { useBookingChanges, useTripChanges } from '@/lib/live';
import { shortName } from '@/lib/names';
import { isLateTripCancel } from '@/lib/rules';
import { useDriverPosition } from '@/lib/position';
import { useSession, useT } from '@/lib/session';
import { openEmergency, shareTrip } from '@/lib/share-trip';
import { supabase } from '@/lib/supabase';
import type { City } from '@/lib/trip-form';
import { noShowFrom, noShowOpen, pickupOpen, startOpen, tripState } from '@/lib/trip-day';
import { colors, space } from '@/theme/tokens';

type Trip = {
  id: string;
  origin: City;
  destination: City;
  departs_at: string;
  price_ils: number;
  cancelled_at: string | null;
  trip_series: { id: string; weekdays: number[]; stopped_at: string | null } | null; // weekly pattern, if any
  started_at: string | null;
  finished_at: string | null;
};
type Request = {
  id: string;
  status: string;
  seats: number;
  respond_by: string | null;
  created_at: string;
  here_at: string | null;
  boarded_at: string | null;
  passenger_id: string;
  profiles: { full_name: string }; // the passenger
};

export default function TripRequests() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useT();
  const { session } = useSession();
  const [rated, setRated] = useState<Record<string, number>>({}); // booking id -> stars I gave
  const repeatsText = useRepeatsText();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const [seatsLeft, setSeatsLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // booking id being updated
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    if (!id) return;
    const [tripRes, reqRes, seatsRes] = await Promise.all([
      supabase.from('trips').select('id, origin, destination, departs_at, price_ils, cancelled_at, started_at, finished_at, trip_series(id, weekdays, stopped_at)').eq('id', id).single(),
      supabase
        .from('bookings')
        .select('id, status, seats, respond_by, created_at, here_at, boarded_at, passenger_id, profiles!bookings_passenger_id_fkey(full_name)')
        .eq('trip_id', id)
        .order('created_at'),
      supabase.rpc('seats_left', { p_trip_id: id }),
    ]);
    setTrip((tripRes.data as unknown as Trip | null) ?? null);
    const list = (reqRes.data as unknown as Request[] | null) ?? [];
    setRequests(list);
    const done = list.filter((r) => r.status === 'completed').map((r) => r.id);
    if (done.length > 0 && session) {
      const { data } = await supabase.from('ratings').select('booking_id, stars').eq('rater_id', session.user.id).in('booking_id', done);
      setRated(Object.fromEntries(((data as { booking_id: string; stars: number }[] | null) ?? []).map((x) => [x.booking_id, x.stars])));
    }
    setSeatsLeft((seatsRes.data as number | null) ?? null);
  }, [id, session]);

  // Reload on every visit (e.g. coming back from rating a passenger).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Tick once a second while someone is waiting for your answer.
  const passengerStats = usePeopleStats(requests.map((r) => r.passenger_id));

  // On trip day, tick every 15 seconds so Start and No-show appear on time.
  const waiting = requests.some((r) => r.status === 'requested');
  const confirmed = requests.some((r) => r.status === 'accepted');
  useEffect(() => {
    if (!waiting && !confirmed) return;
    const timer = setInterval(() => setNow(new Date()), waiting ? 1000 : 15_000);
    return () => clearInterval(timer);
  }, [waiting, confirmed]);

  // New requests appear without pulling to refresh.
  useBookingChanges(load, id ? `trip_id=eq.${id}` : undefined);
  useTripChanges(load, id);

  // While the trip is underway, the car's position feeds Share my trip links.
  const underway = !!trip && !!trip.started_at && !trip.finished_at && !trip.cancelled_at;
  useDriverPosition(trip?.id ?? null, underway);

  // Trip day actions. The database checks the timing again; its message picks our text.
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
            : t('somethingWrong'),
      );
    }
    await load();
  }
  const board = (r: Request) => act(r.id, () => supabase.rpc('mark_boarded', { p_booking_id: r.id, p_boarded: !r.boarded_at }));
  async function noShow(r: Request) {
    const ok = await confirm({ title: t('noShowConfirmTitle'), body: t('noShowConfirmBody'), yes: t('yesNoShow'), no: t('keep'), tone: 'warning' });
    if (ok) await act(r.id, () => supabase.rpc('mark_no_show', { p_booking_id: r.id }));
  }
  const start = () => act('trip', () => supabase.rpc('start_trip', { p_trip_id: id }));
  async function finish() {
    const ok = await confirm({ title: t('finishConfirmTitle'), body: t('finishConfirmBody'), yes: t('yesArrived'), no: t('keep') });
    if (ok) await act('trip', () => supabase.rpc('finish_trip', { p_trip_id: id }));
  }

  async function decide(bookingId: string, status: 'accepted' | 'declined') {
    setBusy(bookingId);
    setError(null);
    const { error: err } = await supabase.from('bookings').update({ status }).eq('id', bookingId);
    setBusy(null);
    if (err) {
      // The database's own message tells us which rule stopped it.
      setError(
        err.message.includes('Not enough seats')
          ? t('noSeatsLeft')
          : err.message.includes('expired')
            ? t('status_expired')
            : t('somethingWrong'),
      );
    }
    await load();
  }

  // Cancelling close to departure with passengers booked is a late cancel (3 in 30 days
  // pause posting for a week). A checkpoint reported closed right now is a fair excuse.
  async function cancelTrip() {
    if (!trip) return;
    const bookedSeats = requests.filter((r) => r.status === 'accepted').reduce((n, r) => n + r.seats, 0);
    let reason: 'checkpoint_closed' | null = null;
    if (isLateTripCancel(new Date(), new Date(trip.departs_at), bookedSeats)) {
      const { data: overview } = await supabase.rpc('checkpoint_overview');
      const closed = ((overview as { name_ar: string; name_en: string; status: string | null }[] | null) ?? []).filter(
        (c) => c.status === 'closed',
      );
      if (closed.length > 0) {
        const names = closed.map((c) => (lang === 'ar' ? c.name_ar : c.name_en)).join('، ');
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
    setBusy('trip');
    setError(null);
    const { error: err } = await supabase.rpc('cancel_trip', { p_trip_id: trip.id, p_reason: reason });
    setBusy(null);
    if (err) setError(t('somethingWrong'));
    await load();
  }

  // Stop the weekly pattern: no new trips, and upcoming ones nobody asked for are taken down.
  async function stopRepeating() {
    if (!trip?.trip_series) return;
    const ok = await confirm({ title: t('stopRepeatingTitle'), body: t('stopRepeatingBody'), yes: t('stopRepeating'), no: t('keep') });
    if (!ok) return;
    setBusy('series');
    setError(null);
    const { error: err } = await supabase.rpc('stop_trip_series', { p_series_id: trip.trip_series.id });
    setBusy(null);
    if (err) setError(t('somethingWrong'));
    await load();
  }

  if (!trip) return <Screen back>{null}</Screen>;
  const departs = new Date(trip.departs_at);
  const state = tripState(trip);
  const canCancelTrip = state === 'scheduled' && departs > new Date();
  const atPickup = state === 'scheduled' && pickupOpen(now, departs);
  const canStart = state === 'scheduled' && startOpen(now, departs) && confirmed;
  const allAccounted = requests.every((r) => r.status !== 'accepted' || !!r.boarded_at);
  const noShowOk = noShowOpen(now, departs);
  const booked = requests.filter((r) => r.status === 'accepted').reduce((n, r) => n + r.seats, 0);
  const pending = requests.filter((r) => r.status === 'requested').reduce((n, r) => n + r.seats, 0);
  const total = seatsLeft !== null ? seatsLeft + booked : booked;

  return (
    <Screen
      back
      scroll
      footer={
        canStart ? (
          <>
            <Button label={t('startTrip')} icon="steeringWheel" onPress={start} loading={busy === 'trip'} disabled={!allAccounted} />
            {allAccounted ? null : <Body muted small style={{ textAlign: 'center' }}>{t('startNeedsAll')}</Body>}
          </>
        ) : state === 'underway' ? (
          <>
            <Button label={t('weArrived')} icon="mapPin" onPress={finish} loading={busy === 'trip'} />
            <Button
              variant="secondary"
              label={t('shareTrip')}
              icon="shareNetwork"
              onPress={() => shareTrip(trip.id, `${t(trip.origin)} ${lang === 'ar' ? '←' : '→'} ${t(trip.destination)}`, lang, t)}
            />
            <Button
              variant="plain"
              label={t('emergencyButton')}
              icon="warning"
              onPress={() => session && openEmergency(trip.id, session.user.id, lang, t)}
            />
          </>
        ) : canCancelTrip ? (
          <Button variant="plain" label={t('cancelTrip')} onPress={cancelTrip} loading={busy === 'trip'} />
        ) : undefined
      }
    >
      <TripHero
        label={
          <Body muted small>
            {t(state === 'underway' ? 'onTheWay' : state === 'finished' ? 'tripFinished' : atPickup ? 'pickupTitle' : 'requestsTitle')}
          </Body>
        }
        departsAt={trip.departs_at}
        origin={trip.origin}
        destination={trip.destination}
      />
      {total > 0 ? <SeatDots total={total} booked={booked} pending={Math.min(pending, total - booked)} /> : null}
      {state === 'scheduled' && confirmed && atPickup && !canStart ? <Body muted small>{t('startOpensNote')}</Body> : null}
      {booked > 0 && !trip.cancelled_at ? (
        <Body muted small>
          {t('youEarn')} {ltr(`${booked * Number(trip.price_ils)}₪`)}
        </Body>
      ) : null}
      {trip.cancelled_at ? <Body error>{t('tripCancelled')}</Body> : null}
      {trip.trip_series ? (
        <View>
          <ListRow
            last
            icon="calendar"
            title={trip.trip_series.stopped_at ? t('repeatStopped') : repeatsText(trip.trip_series.weekdays)}
            trailing={
              trip.trip_series.stopped_at ? undefined : (
                <TextLink label={t('stopRepeating')} onPress={stopRepeating} disabled={busy === 'series'} />
              )
            }
          />
        </View>
      ) : null}

      <SectionTitle>{t('passengers')}</SectionTitle>
      {requests.length === 0 ? <Body muted>{t('noRequests')}</Body> : null}
      {requests.map((r) => {
        const name = shortName(r.profiles.full_name);
        const seats = `${ltr(r.seats)} ${t('seatOne')}`;
        const statusText = r.status === 'requested' ? seats : `${seats} · ${t(`status_${r.status}` as StringKey)}`;
        return (
          <View key={r.id} style={styles.request}>
            {r.status === 'accepted' ? (
              <BookingContact bookingId={r.id} />
            ) : (
              <ListRow
                last
                leading={<IconCircle letter={name.charAt(0)} />}
                title={name}
                onPress={() => router.push({ pathname: '/people/[id]', params: { id: r.passenger_id } })}
                subtitle={
                  <View style={{ gap: 2 }}>
                    <Body muted small>{statusText}</Body>
                    {r.status === 'requested' ? <StatsLine stats={passengerStats[r.passenger_id]} /> : null}
                  </View>
                }
              />
            )}
            {r.status === 'accepted' && atPickup ? (
              <View style={styles.pickup}>
                <Chip label={t('inTheCar')} icon={r.boarded_at ? 'check' : undefined} selected={!!r.boarded_at} onPress={() => board(r)} />
                {!r.boarded_at && noShowOk ? <Chip label={t('markNoShow')} onPress={() => noShow(r)} /> : null}
                {!r.boarded_at && r.here_at ? <Body signal small>{t('atPickup')}</Body> : null}
                {!r.boarded_at && !noShowOk && !r.here_at ? (
                  <Body muted small>
                    {t('noShowFrom')} {ltr(formatTime(noShowFrom(departs), lang))}
                  </Body>
                ) : null}
              </View>
            ) : null}
            {r.status === 'completed' ? (
              rated[r.id] ? (
                <Stars value={rated[r.id]} />
              ) : (
                <Button
                  variant="secondary"
                  icon="star"
                  label={`${t('rateOne')} ${name}`}
                  onPress={() => router.push({ pathname: '/trips/rate/[bookingId]', params: { bookingId: r.id } })}
                />
              )
            ) : null}
            {r.status === 'requested' ? (
              <>
                {r.respond_by ? (
                  <Countdown
                    label={t('answerWithin')}
                    remaining={formatCountdown(new Date(r.respond_by).getTime() - now.getTime())}
                    progress={progressOf(r, now)}
                  />
                ) : null}
                <View style={styles.actions}>
                  <View style={styles.action}>
                    <Button
                      variant="secondary"
                      label={t('declineSorry')}
                      onPress={() => decide(r.id, 'declined')}
                      disabled={busy !== null}
                    />
                  </View>
                  <View style={styles.action}>
                    <Button
                      label={t('acceptRequest')}
                      onPress={() => decide(r.id, 'accepted')}
                      loading={busy === r.id}
                      disabled={busy !== null && busy !== r.id}
                    />
                  </View>
                </View>
                <Body muted small>
                  {t('unanswered')}
                </Body>
              </>
            ) : null}
          </View>
        );
      })}
      {error ? <Body error>{error}</Body> : null}
    </Screen>
  );
}

/** How much of the answer window is left, from 1 (just asked) to 0 (expired). */
function progressOf(r: Request, now: Date) {
  if (!r.respond_by) return 0;
  const start = new Date(r.created_at).getTime();
  const end = new Date(r.respond_by).getTime();
  return end > start ? (end - now.getTime()) / (end - start) : 0;
}

const styles = StyleSheet.create({
  request: {
    paddingBottom: space.md,
    gap: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  actions: { flexDirection: 'row', gap: space.sm },
  pickup: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  action: { flex: 1 },
});
