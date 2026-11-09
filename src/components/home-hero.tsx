// The blocks that can sit at the top of Home. Which one shows is decided in
// src/lib/home-state.ts; each block only draws itself. Blocks that belong to a
// trip are tappable as a whole (Home wraps them) and open that trip's own screen,
// so nothing here repeats a page that already exists (no rating stars, no pickup list).

import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { SeatDots } from '@/components/seat-dots';
import { Body, Button, Countdown, ltr, useFont } from '@/components/ui';
import { alertWindow } from '@/lib/alerts';
import { clock, formatCountdown, formatLongDay, shortTime } from '@/lib/format';
import { usualDay } from '@/lib/home-state';
import { shortName } from '@/lib/names';
import { NABLUS, RAMALLAH, routeName } from '@/lib/places';
import { useSession, useT } from '@/lib/session';
import { openTrip } from '@/lib/trip-layer';
import { reliabilityText, type Stats } from '@/lib/stats';
import { supabase } from '@/lib/supabase';
import type { City } from '@/lib/trip-form';
import { colors, fonts, space } from '@/theme/tokens';

export type Route = { origin: City; destination: City };

/** Caption line, then the big number with its small word beside it. */
function Big({ caption, value, unit, captionSignal }: { caption: ReactNode; value: string; unit?: string; captionSignal?: boolean }) {
  const { f } = useFont();
  return (
    <View style={{ gap: space.xs }}>
      <Text style={[styles.caption, { fontFamily: captionSignal ? f.medium : f.regular }, captionSignal && { color: colors.clay }]}>
        {caption}
      </Text>
      <View style={styles.timeRow}>
        <Text style={styles.heroNumber}>{value}</Text>
        {unit ? <Text style={[styles.unit, { fontFamily: f.regular }]}>{unit}</Text> : null}
      </View>
    </View>
  );
}

/** A big heading in place of a number, for states with no time to show. */
function Heading({ caption, title, signal }: { caption: string; title: string; signal?: boolean }) {
  const { f } = useFont();
  return (
    <View style={{ gap: space.xs }}>
      <Text style={[styles.caption, { fontFamily: signal ? f.medium : f.regular }, signal && { color: colors.clay }]}>{caption}</Text>
      <Text style={[styles.heading, { fontFamily: f.bold }]}>{title}</Text>
    </View>
  );
}

function RouteLine({ origin, destination, extra }: { origin: City; destination: City; extra?: string }) {
  const { lang } = useT();
  return (
    <Body>
      {routeName(origin, destination, lang)}
      {extra ? ` · ${extra}` : ''}
    </Body>
  );
}

function Buttons({ children }: { children: ReactNode }) {
  return <View style={styles.buttons}>{children}</View>;
}

function timeParts(iso: string) {
  const { time, pm } = clock(new Date(iso));
  return { time, pm };
}

// ---------------------------------------------------------------- passenger

export type SeatInfo = {
  status: 'requested' | 'accepted';
  departsAt: string;
  startedAt: string | null;
  createdAt: string;
  respondBy: string | null;
  origin: City;
  destination: City;
  driver: string | null;
};

/** P4 waiting, P5 confirmed, P6 leaving soon, and on the road. */
export function SeatBlock({ seat, phase, now }: { seat: SeatInfo; phase: 'waiting' | 'confirmed' | 'soon' | 'onTheRoad'; now: Date }) {
  const { t, lang } = useT();
  const { f } = useFont();
  const { time, pm } = timeParts(seat.departsAt);
  const driver = seat.driver ? shortName(seat.driver) : undefined;
  const minutes = Math.max(0, Math.round((new Date(seat.departsAt).getTime() - now.getTime()) / 60_000));

  const caption =
    phase === 'onTheRoad'
      ? `${t('homeOnTheRoad')} · ${t('homeLeftAt')} ${ltr(shortTime(new Date(seat.startedAt!)))}`
      : phase === 'soon'
        ? `${t('homeLeavesIn')} ${ltr(minutes)} ${t('homeMinutes')}`
        : `${t('yourNextTrip')} · ${formatLongDay(new Date(seat.departsAt), lang)}`;

  let footer: ReactNode = null;
  if (phase === 'waiting' && seat.respondBy) {
    const start = new Date(seat.createdAt).getTime();
    const end = new Date(seat.respondBy).getTime();
    const left = end - now.getTime();
    footer = <Countdown label={t('waitingForDriver')} remaining={formatCountdown(left)} progress={end > start ? left / (end - start) : 0} />;
  } else if (phase === 'confirmed') {
    footer = (
      <View style={styles.confirmed}>
        <Icon name="check" size={16} />
        <Text style={[styles.confirmedText, { fontFamily: f.medium }]}>{t('seatConfirmed')}</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: space.sm }}>
      <Big caption={caption} value={time} unit={pm ? t('pm') : t('am')} />
      <RouteLine origin={seat.origin} destination={seat.destination} extra={driver} />
      {footer}
    </View>
  );
}

/** P7: the driver cancelled. The trip's own screen lists the other trips that day. */
export function CancelledBlock({ departsAt, driver, onOpen, onLater }: { departsAt: string; driver: string | null; onOpen: () => void; onLater: () => void }) {
  const { t } = useT();
  return (
    <View style={{ gap: space.sm }}>
      <Heading
        signal
        caption={t('homeTripChanged')}
        title={`${driver ? `${shortName(driver)} · ` : ''}${t('homeDriverCancelled')} ${ltr(shortTime(new Date(departsAt)))}`}
      />
      <Body muted>{t('homeCancelledBody')}</Body>
      <Buttons>
        <View style={{ flex: 1 }}>
          <Button label={t('homeSeeOtherTrips')} onPress={onOpen} />
        </View>
        <View style={{ flex: 1 }}>
          <Button variant="secondary" label={t('homeLater')} onPress={onLater} />
        </View>
      </Buttons>
    </View>
  );
}

/** P8: you arrived. The rating itself happens on the rating screen. */
export function RateBlock({ driver, onOpen, onLater }: { driver: string | null; onOpen: () => void; onLater: () => void }) {
  const { t, lang } = useT();
  return (
    <View style={{ gap: space.sm }}>
      <Heading caption={t('arrivedSafe')} title={t('homeArrived')} />
      <Body muted>
        {driver ? `${t('homeHowWas')} ${shortName(driver)}${lang === 'ar' ? '؟' : '?'} ` : ''}
        {t('homeRatingHelps')}
      </Body>
      <Buttons>
        <View style={{ flex: 1 }}>
          <Button icon="star" label={t('rateTrip')} onPress={onOpen} />
        </View>
        <View style={{ flex: 1 }}>
          <Button variant="secondary" label={t('homeLater')} onPress={onLater} />
        </View>
      </Buttons>
    </View>
  );
}

type Found = { id: string; departs_at: string; seats_left: number; price_ils: number; driver_first_name: string; driver_verified: boolean };

/**
 * Nothing booked. P1 with no usual route yet, P2 with the next free seat on it
 * (today, else tomorrow), P3 when nothing is posted yet (offer a ride alert).
 */
export function IdlePassenger({ route, verified }: { route: Route | null; verified: boolean }) {
  const { t, lang } = useT();
  const { session } = useSession();
  const [found, setFound] = useState<{ trip: Found | null; day: 0 | 1; count: number } | null>(null);
  const [alert, setAlert] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    if (!route) return;
    let gone = false;
    (async () => {
      for (const day of [0, 1] as const) {
        const start = new Date();
        start.setDate(start.getDate() + day);
        if (day > 0) start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setHours(24, 0, 0, 0);
        const { data } = await supabase.rpc('search_trips', {
          p_origin: route.origin,
          p_destination: route.destination,
          p_from: start.toISOString(),
          p_to: end.toISOString(),
        });
        const open = ((data as Found[] | null) ?? []).filter((r) => r.seats_left > 0);
        if (open.length > 0 || day === 1) {
          if (!gone) setFound({ trip: open[0] ?? null, day, count: open.length });
          return;
        }
      }
    })();
    return () => {
      gone = true;
    };
  }, [route?.origin, route?.destination]);

  if (!route) {
    // P1: pick the usual route; it becomes the route Home watches.
    return (
      <View style={{ gap: space.sm }}>
        <Heading caption={t('homeNewCaption')} title={t('homeNewTitle')} />
        <Body muted>{t('homeNewBody')}</Body>
        <View style={styles.chips}>
          {[RAMALLAH, NABLUS].map((origin) => {
            const destination = origin === RAMALLAH ? NABLUS : RAMALLAH;
            return (
              <Button
                key={origin}
                variant="secondary"
                label={routeName(origin, destination, lang)}
                onPress={() => router.push({ pathname: '/trips/results', params: { origin, destination, day: '0' } })}
              />
            );
          })}
        </View>
        {!verified ? (
          <Button variant="plain" icon="shieldCheck" label={t('homeVerifyFirst')} onPress={() => router.push('/verify')} />
        ) : null}
      </View>
    );
  }

  if (!found) return <View style={{ minHeight: 180 }} />;

  if (found.trip) {
    // P2: the next free seat on your route.
    const trip = found.trip;
    const { time, pm } = timeParts(trip.departs_at);
    const more = found.count - 1;
    return (
      <View style={{ gap: space.sm }}>
        <Big caption={`${t('homeNextSeat')} · ${t(found.day === 0 ? 'today' : 'tomorrow')}`} value={time} unit={pm ? t('pm') : t('am')} />
        <RouteLine origin={route.origin} destination={route.destination} extra={trip.driver_first_name} />
        <Body muted small>
          {trip.driver_verified ? `${t('verifiedDriver')} · ` : ''}
          {ltr(trip.seats_left)} {t('seatsLeft')} · {ltr(`${trip.price_ils}₪`)}
        </Body>
        <Buttons>
          <View style={{ flex: 1 }}>
            <Button label={t('requestSeat')} onPress={() => openTrip(trip.id)} />
          </View>
          {more > 0 ? (
            <View style={{ flex: 1 }}>
              <Button
                variant="secondary"
                label={`${ltr(more)} ${t('homeMoreTrips')}`}
                onPress={() => router.push({ pathname: '/trips/results', params: { ...route, day: String(found.day) } })}
              />
            </View>
          ) : null}
        </Buttons>
      </View>
    );
  }

  // P3: nothing posted yet. One tap saves an alert for tomorrow morning.
  async function saveAlert() {
    if (!session || !route) return;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const win = alertWindow(tomorrow, 'morning', new Date());
    if (!win) return;
    setAlert('saving');
    const { error } = await supabase.from('ride_alerts').insert({
      passenger_id: session.user.id,
      origin: route.origin,
      destination: route.destination,
      window_from: win.from.toISOString(),
      window_to: win.to.toISOString(),
    });
    setAlert(!error || error.code === '23505' ? 'saved' : 'error');
  }

  return (
    <View style={{ gap: space.sm }}>
      <Heading caption={`${t('homeOnYourRoute')} · ${t('homeTomorrowMorning')}`} title={t('homeNoTripsTitle')} />
      <RouteLine origin={route.origin} destination={route.destination} />
      <Body muted small>
        {alert === 'saved' ? t('alertSaved') : t('homeNoTripsBody')}
      </Body>
      {alert === 'error' ? <Body error>{t('somethingWrong')}</Body> : null}
      <Buttons>
        {alert !== 'saved' ? (
          <View style={{ flex: 1 }}>
            <Button icon="bell" label={t('homeAlertTomorrow')} onPress={saveAlert} loading={alert === 'saving'} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Button variant="secondary" label={t('homeAnotherDay')} onPress={() => router.push('/trips/search')} />
        </View>
      </Buttons>
    </View>
  );
}

// ---------------------------------------------------------------- driver

export type DriveInfo = {
  departsAt: string;
  startedAt: string | null;
  origin: City;
  destination: City;
  seatsTotal: number;
  booked: number;
  asked: number;
  riders: number;
  firstPending: { name: string | null; createdAt: string; respondBy: string } | null;
};

/** D2 request waiting, D3 ready, D4 on the road. Answering happens on the trip's own screen. */
export function DriveBlock({ drive, phase, now }: { drive: DriveInfo; phase: 'requests' | 'ready' | 'onTheRoad'; now: Date }) {
  const { t, lang } = useT();
  const { time, pm } = timeParts(drive.startedAt ?? drive.departsAt);
  const full = drive.booked >= drive.seatsTotal;
  const caption =
    phase === 'onTheRoad'
      ? `${t('homeOnTheRoad')} · ${t('homeLeftAt')}`
      : `${t('yourNextDrive')} · ${formatLongDay(new Date(drive.departsAt), lang)}`;
  const first = drive.firstPending;

  return (
    <View style={{ gap: space.sm }}>
      <Big caption={caption} value={time} unit={pm ? t('pm') : t('am')} />
      <RouteLine
        origin={drive.origin}
        destination={drive.destination}
        extra={phase === 'onTheRoad' ? `${ltr(drive.riders)} ${t('homeOnBoard')}` : undefined}
      />
      {phase !== 'onTheRoad' ? (
        <SeatDots total={drive.seatsTotal} booked={drive.booked} pending={Math.min(drive.asked, drive.seatsTotal - drive.booked)} />
      ) : null}
      {phase === 'requests' && first ? (
        <Countdown
          label={`${t('newRequestFrom')} ${first.name ? shortName(first.name) : ''} · ${t('answerWithin')}`}
          remaining={formatCountdown(new Date(first.respondBy).getTime() - now.getTime())}
          progress={(() => {
            const start = new Date(first.createdAt).getTime();
            const end = new Date(first.respondBy).getTime();
            return end > start ? (end - now.getTime()) / (end - start) : 0;
          })()}
        />
      ) : null}
      {phase === 'ready' ? (
        <Body muted small>
          {full ? `${t('homeCarFull')} · ` : ''}
          {t('homeNothingNeeded')}
        </Body>
      ) : null}
    </View>
  );
}

/**
 * D1: you drive but have nothing posted. The big number is demand on your route
 * (riders with an alert waiting); without demand, your usual departure time.
 */
export function IdleDriver({ route, time, stats }: { route: Route; time: string; stats: Stats | null }) {
  const { t, lang } = useT();
  const { f } = useFont();
  const [demand, setDemand] = useState<{ on_date: string; waiting: number } | null | undefined>(undefined);

  useEffect(() => {
    let gone = false;
    supabase.rpc('alert_demand', { p_origin: route.origin, p_destination: route.destination }).then(({ data }) => {
      if (!gone) setDemand(((data as { on_date: string; waiting: number }[] | null) ?? [])[0] ?? null);
    });
    return () => {
      gone = true;
    };
  }, [route.origin, route.destination]);

  const day = usualDay(time, new Date());
  const post = (withTime: boolean) =>
    router.push({
      pathname: '/trips/new',
      params: { origin: route.origin, destination: route.destination, day: String(day), ...(withTime ? { time } : {}) },
    });

  const [h, m] = time.split(':').map(Number);
  const at = new Date();
  at.setHours(h, m, 0, 0);
  const usual = clock(at);
  const reliability = stats ? reliabilityText(stats) : null;

  return (
    <View style={{ gap: space.sm }}>
      {demand && demand.waiting > 0 ? (
        <Big
          caption={`${t('homeOnYourRoute')} · ${formatLongDay(new Date(`${demand.on_date}T12:00:00`), lang)}`}
          value={String(demand.waiting)}
          unit={t('homeWaitingRiders')}
        />
      ) : (
        <Big caption={`${t('homeUsualDrive')} · ${t(day === 0 ? 'today' : 'tomorrow')}`} value={usual.time} unit={usual.pm ? t('pm') : t('am')} />
      )}
      <RouteLine origin={route.origin} destination={route.destination} />
      {stats && (stats.founding_driver || reliability) ? (
        <View style={styles.statsRow}>
          {stats.founding_driver ? (
            <View style={styles.confirmed}>
              <Icon name="star" size={14} />
              <Text style={[styles.statText, { fontFamily: f.medium }]}>{t('foundingDriver')}</Text>
            </View>
          ) : null}
          {reliability ? (
            <Text style={[styles.statText, { fontFamily: f.regular, color: colors.inkSecondary }]}>
              {t('homeReliability')} <Text style={{ fontFamily: fonts.en.bold, color: colors.ink }}>{ltr(reliability)}</Text>
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={{ gap: space.xs, marginTop: space.xs }}>
        <Button label={`${t('postTrip')} ${ltr(time)} ${t('homeAsUsual')}`} onPress={() => post(true)} />
        <Button variant="plain" label={t('homeOtherTime')} onPress={() => post(false)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  caption: { fontSize: 13, lineHeight: 18, color: colors.inkSecondary },
  timeRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, flexWrap: 'wrap' },
  heroNumber: { fontFamily: fonts.en.bold, fontSize: 56, lineHeight: 62, color: colors.ink, letterSpacing: -1.6 },
  unit: { fontSize: 16, color: colors.inkSecondary },
  heading: { fontSize: 28, lineHeight: 36, color: colors.ink, letterSpacing: -0.4 },
  confirmed: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  confirmedText: { fontSize: 14, color: colors.ink },
  buttons: { flexDirection: 'row', gap: space.sm, marginTop: space.xs, alignItems: 'center' },
  chips: { gap: space.sm },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  statText: { fontSize: 13, color: colors.ink },
});
