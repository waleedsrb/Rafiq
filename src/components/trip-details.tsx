// Trip details for a passenger: every state of one trip, in the glass card over the map
// (src/components/trip-sheet.tsx). The card only fills its slots per state:
// - header: the label, the big time, the route;
// - body: the driver, seats, the countdown, the plate, checkpoints, a note when it ended;
// - footer: the state's buttons; and the bar (swiped down): one line + one button.
//
// Requesting, rating and the driver's page are steps inside the same card (back arrow),
// so nothing here jumps to another page except the ID check, which needs the camera.
//
// Drawn by the trip layer (trip-layer-host.tsx), inside the search, and on the
// /trips/[id] screen for links from notifications.

import { useCallback, useEffect, useState, type MutableRefObject } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { ContactCard, useContact } from '@/components/contact-card';
import { DriverCancelled } from '@/components/driver-cancelled';
import { Icon, type IconName } from '@/components/icon';
import { PersonProfile } from '@/components/person-profile';
import { PlateArt } from '@/components/plate-art';
import { useRateTrip } from '@/components/rate-trip';
import { useRepeatsText } from '@/components/repeats';
import { useRequestSeat } from '@/components/request-seat';
import { RouteCheckpoints } from '@/components/route-checkpoints';
import { Stars } from '@/components/stars';
import { StatsLine, usePeopleStats } from '@/components/stats-line';
import { TripHero } from '@/components/trip-hero';
import { StepHeader, TripSheet, type Detent, type SheetMini } from '@/components/trip-sheet';
import { Body, Button, Countdown, ListRow, ltr, useFont } from '@/components/ui';
import type { StringKey } from '@/i18n/strings';
import { photoGate, photoGateText } from '@/lib/avatar';
import { confirm } from '@/lib/dialog';
import { formatCountdown, formatDay, formatTime } from '@/lib/format';
import { useBookingChanges, useTripChanges } from '@/lib/live';
import { carName, shortName } from '@/lib/names';
import { pushAfterDialog } from '@/lib/nav';
import { centreName, routeName } from '@/lib/places';
import { telLink } from '@/lib/phone';
import { freeCancel } from '@/lib/rules';
import { useSession, useT } from '@/lib/session';
import { openEmergency, shareTrip } from '@/lib/share-trip';
import { supabase } from '@/lib/supabase';
import { startOpen, tripState } from '@/lib/trip-day';
import type { City } from '@/lib/trip-form';
import { TripOpenerContext, type Rect } from '@/lib/trip-layer';
import { colors, radii, space } from '@/theme/tokens';

type Payment = { status: 'held' | 'charged' | 'released' | 'refunded'; total_ils: number; card_brand: string; card_last4: string };

type Trip = {
  id: string;
  driver_id: string;
  origin: City;
  destination: City;
  departs_at: string;
  price_ils: number;
  cancelled_at: string | null;
  cancelled_late: boolean | null;
  cancel_reason: string | null;
  started_at: string | null;
  finished_at: string | null;
  // Where the driver meets riders (null on trips posted before pickups: the city square).
  pickup_label: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  // The checkpoints the driver goes through (empty on trips posted before Nov 10).
  checkpoint_ids: string[] | null;
  profiles: { display_name: string; avatar_path: string | null }; // the driver, joined through trips.driver_id
  trip_series: { weekdays: number[]; stopped_at: string | null } | null; // set when the trip repeats weekly
};

type Step = 'details' | 'request' | 'rate' | 'driver';

export function TripDetails({
  id,
  from,
  settled,
  closing,
  onRequestClose,
  onClosed,
  onFindOthers,
  backRef,
}: {
  id: string;
  from: Rect | null;
  settled?: boolean;
  closing: boolean;
  onRequestClose: () => void;
  onClosed: () => void;
  /** "Other trips that day": back to the search, or a results page. */
  onFindOthers: (trip: { origin: City; destination: City; departs_at: string }) => void;
  /** Android back: a step goes back to the details, the details close. */
  backRef?: MutableRefObject<(() => void) | null>;
}) {
  const { t, lang } = useT();
  const { f } = useFont();
  const { session, profile } = useSession();
  const repeatsText = useRepeatsText();

  // Another trip can be opened right here (the driver cancelled: "other trips that day").
  const [tripId, setTripId] = useState(id);
  const [step, setStep] = useState<Step>('details');
  const [want, setWant] = useState<{ to: Detent; key: number } | null>(null);
  const moveTo = (to: Detent) => setWant((w) => ({ to, key: (w?.key ?? 0) + 1 }));

  const [trip, setTrip] = useState<Trip | null>(null);
  const [seatsLeft, setSeatsLeft] = useState<number | null>(null);
  const [driverVerified, setDriverVerified] = useState(false);
  // Car model and colour, shown while booking (plate only later, see trip_contact()).
  const [car, setCar] = useState<{ car_model: string | null; car_color: string | null } | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [respondBy, setRespondBy] = useState<string | null>(null);
  const [acceptedAt, setAcceptedAt] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [hereAt, setHereAt] = useState<string | null>(null);
  const [myStars, setMyStars] = useState<number | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [firstLoad, setFirstLoad] = useState(true);

  const load = useCallback(async () => {
    if (!session || !tripId) return;
    const [tripRes, seatsRes, bookingRes] = await Promise.all([
      supabase
        .from('trips')
        .select(
          'id, driver_id, origin, destination, departs_at, price_ils, cancelled_at, cancelled_late, cancel_reason, started_at, finished_at, pickup_label, pickup_lat, pickup_lng, checkpoint_ids, profiles!trips_driver_id_fkey(display_name, avatar_path), trip_series(weekdays, stopped_at)',
        )
        .eq('id', tripId)
        .single(),
      supabase.rpc('seats_left', { p_trip_id: tripId }),
      supabase
        .from('bookings')
        .select('id, status, respond_by, accepted_at, created_at, here_at')
        .eq('trip_id', tripId)
        .eq('passenger_id', session.user.id)
        .maybeSingle(),
    ]);
    const loaded = (tripRes.data as unknown as Trip | null) ?? null;
    setTrip(loaded);
    if (loaded) {
      supabase.rpc('is_verified_driver', { p_driver_id: loaded.driver_id }).then(({ data }) => setDriverVerified(data === true));
      supabase.rpc('public_profile', { p_person: loaded.driver_id }).then(({ data }) => setCar(((data as typeof car[] | null) ?? [])[0] ?? null));
    }
    setSeatsLeft((seatsRes.data as number | null) ?? null);
    setStatus(bookingRes.data?.status ?? null);
    setBookingId(bookingRes.data?.id ?? null);
    setRespondBy(bookingRes.data?.respond_by ?? null);
    setAcceptedAt(bookingRes.data?.accepted_at ?? null);
    setCreatedAt(bookingRes.data?.created_at ?? null);
    setHereAt(bookingRes.data?.here_at ?? null);
    const bid = bookingRes.data?.id;
    if (bid && bookingRes.data?.status === 'completed') {
      const { data: r } = await supabase.from('ratings').select('stars').eq('booking_id', bid).eq('rater_id', session.user.id).maybeSingle();
      setMyStars((r as { stars: number } | null)?.stars ?? null);
    } else setMyStars(null);
    if (bid) {
      const { data: pay } = await supabase.from('payments').select('status, total_ils, card_brand, card_last4').eq('booking_id', bid).maybeSingle();
      setPayment((pay as Payment | null) ?? null);
    } else setPayment(null);
  }, [tripId, session]);

  useEffect(() => {
    load();
  }, [load]);

  // On the road, open on the bar so the map leads.
  useEffect(() => {
    if (!trip || !firstLoad) return;
    setFirstLoad(false);
    if (status === 'accepted' && tripState(trip) === 'underway') moveTo('mini');
  }, [trip]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tick once a second while we wait for the driver's answer, and every 15 seconds on
  // a confirmed seat so "Find the car" appears on time.
  useEffect(() => {
    if (status !== 'requested' && status !== 'accepted') return;
    const timer = setInterval(() => setNow(new Date()), status === 'requested' ? 1000 : 15_000);
    return () => clearInterval(timer);
  }, [status]);

  const contact = useContact(status === 'accepted' || status === 'completed' ? bookingId : null);
  const stats = usePeopleStats(trip ? [trip.driver_id] : []);

  // When the driver accepts, the status and contact card appear right away.
  useBookingChanges(load, tripId ? `trip_id=eq.${tripId}` : undefined);
  // When the driver taps Start trip or Arrived.
  useTripChanges(load, tripId);

  const backToDetails = () => {
    setStep('details');
    moveTo('mid');
    load();
  };
  const req = useRequestSeat(trip?.id, step === 'request', backToDetails);
  const rate = useRateTrip(bookingId, step === 'rate', backToDetails);

  // The request step needs room for a card form; the cash one fits at the middle height.
  useEffect(() => {
    if (step === 'request' && req.ready) moveTo(req.cash ? 'mid' : 'full');
  }, [step, req.ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!backRef) return;
    backRef.current = () => (step === 'details' ? onRequestClose() : backToDetails());
  });

  if (!trip) return null;

  async function imHere() {
    if (!bookingId) return;
    setSending(true);
    setError(null);
    const { error: err } = await supabase.rpc('im_here', { p_booking_id: bookingId });
    setSending(false);
    if (err) return setError(err.message.includes('Too early') ? t('checkInOpens') : t('somethingWrong'));
    await load();
  }

  async function request() {
    if (!session || !trip) return;
    // First booking? Verify your ID first (the database would refuse the booking anyway).
    // The ID check is the one page of its own (camera and photos), so say so before going.
    if (!profile?.id_verified_at) {
      const go = await confirm({ title: t('idFirstTitle'), body: t('idFirstBody'), yes: t('startVerify'), no: t('notNow') });
      if (go) await pushAfterDialog({ pathname: '/verify', params: { kind: 'passenger' } });
      return;
    }
    if (!(await photoGate(!!profile.avatar_path, photoGateText(t)))) return;
    setStep('request');
  }

  // Withdraw a request, or cancel an accepted seat (warning first if it's late).
  async function cancel() {
    if (!trip || !bookingId) return;
    const withdraw = status === 'requested';
    const late = status === 'accepted' && !freeCancel(new Date(), new Date(trip.departs_at), acceptedAt ? new Date(acceptedAt) : null);
    const ok = await confirm({
      title: t(withdraw ? 'withdrawTitle' : late ? 'lateCancelTitle' : 'cancelConfirmTitle'),
      body: t(withdraw ? 'withdrawBody' : late ? 'lateCancelBody' : 'cancelConfirmBody'),
      yes: t(withdraw ? 'yesWithdraw' : 'yesCancel'),
      no: t('keep'),
      // A late cancel costs money: that's a warning. A free one is just a question.
      tone: late ? 'warning' : 'neutral',
    });
    if (!ok) return;
    setSending(true);
    setError(null);
    const { error: err } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', bookingId);
    setSending(false);
    if (err) return setError(t('somethingWrong'));
    await load();
  }

  const departs = new Date(trip.departs_at);
  // "07:30" today, "Sat 8 Nov 07:30" otherwise.
  const when = (iso: string) => {
    const d = new Date(iso);
    const time = formatTime(d, lang);
    return d.toDateString() === new Date().toDateString() ? time : `${formatDay(d, lang)} ${time}`;
  };
  const freeUntil = new Date(departs.getTime() - 12 * 60 * 60 * 1000);
  const isFree = freeCancel(new Date(), departs, acceptedAt ? new Date(acceptedAt) : null);
  const cancelNote =
    status !== 'accepted' || departs <= new Date()
      ? null
      : freeUntil > new Date()
        ? `${t('freeCancelUntil')} ${when(freeUntil.toISOString())}`
        : isFree
          ? null // inside the 15-minute grace of a late booking
          : t('lateCancelNote');

  const driverName = shortName(trip.profiles.display_name);
  const driverStats = stats[trip.driver_id];
  const mine = trip.driver_id === session?.user.id;
  const canRequest = status === null && !trip.cancelled_at && (seatsLeft ?? 0) > 0 && !mine;
  const state = tripState(trip);
  // The driver cancelled a trip I had asked to ride on.
  const driverCancelled = !!trip.cancelled_at && status === 'cancelled';
  const canCancel = (status === 'requested' || status === 'accepted') && departs > new Date() && state === 'scheduled';
  // Trip day phases for a confirmed seat.
  const findCar = status === 'accepted' && state === 'scheduled' && startOpen(now, departs);
  const onRoad = status === 'accepted' && state === 'underway';
  const arrived = status === 'completed';
  // It ended without you: say what happened and offer a way forward.
  const endedNote: StringKey | null = driverCancelled
    ? null
    : status === 'declined'
      ? 'declinedNote'
      : status === 'expired'
        ? 'expiredNote'
        : status === 'cancelled'
          ? 'youCancelledNote'
          : status === 'no_show'
            ? 'leftWithoutYou'
            : status === 'not_confirmed'
              ? 'notConfirmedNote'
              : status === 'disputed'
                ? 'disputedNote'
                : null;
  const findOthers = () => onFindOthers({ origin: trip.origin, destination: trip.destination, departs_at: trip.departs_at });
  const callDriver = () => {
    if (contact?.phone) Linking.openURL(telLink(contact.phone)).catch(() => {});
  };
  const emergency = () => session && openEmergency(trip.id, session.user.id, lang, t);
  const price = ltr(`${trip.price_ils}₪`);
  const route = routeName(trip.origin, trip.destination, lang);

  async function share() {
    if (!trip || !contact) return;
    const message = t('shareMessage')
      .replace('{route}', route)
      .replace('{when}', when(trip.departs_at))
      .replace('{driver}', contact.first_name)
      .replace('{car}', [contact.car_model, contact.car_color].filter(Boolean).join(' '))
      .replace('{plate}', contact.plate ?? '');
    await shareTrip(trip.id, message, lang, t);
  }
  const canShare = (status === 'accepted' || onRoad) && !!contact;

  // ---------- Steps inside the card ----------
  const pickupLabel = trip.pickup_label ?? centreName(trip.origin, lang);
  const common = {
    pickup: trip.pickup_lat !== null && trip.pickup_lng !== null ? { latitude: Number(trip.pickup_lat), longitude: Number(trip.pickup_lng) } : null,
    origin: trip.origin,
    destination: trip.destination,
    checkpointIds: trip.checkpoint_ids,
    departsAt: trip.departs_at,
    from,
    settled,
    want,
    closing,
    onRequestClose,
    onClosed,
  };
  const quietBar: SheetMini = { sub: `${route} · ${price}` };

  // ---------- The details ----------
  // The small line above the big time says where things stand.
  const label =
    findCar || onRoad || arrived ? (
      <Body small style={{ fontFamily: f.medium, color: arrived ? colors.statusOpen : colors.ink }}>
        {t(findCar ? 'findTheCar' : onRoad ? 'onTheWay' : 'arrivedSafe')}
      </Body>
    ) : status === 'accepted' ? (
      <View style={styles.labelRow}>
        <Icon name="check" size={14} color={colors.statusOpen} />
        <Body small style={{ fontFamily: f.medium, color: colors.statusOpen }}>
          {t('seatIsConfirmed')}
        </Body>
      </View>
    ) : status === 'requested' ? (
      <Body muted small>
        {t('sentRequestTo')} {driverName}
      </Body>
    ) : null;

  let countdown = null;
  let left = 0;
  if (status === 'requested' && respondBy && createdAt) {
    const start = new Date(createdAt).getTime();
    const end = new Date(respondBy).getTime();
    left = end - now.getTime();
    countdown = <Countdown label={t('waitingForDriver')} remaining={formatCountdown(left)} progress={end > start ? left / (end - start) : 0} />;
  }

  const driverLine = (last: boolean) => (
    <ListRow
      leading={<Avatar path={trip.profiles.avatar_path} name={driverName} seed={trip.driver_id} />}
      title={driverName}
      onPress={() => {
        setStep('driver');
        moveTo('full');
      }}
      subtitle={
        <View style={{ gap: 2 }}>
          {driverVerified ? <VerifiedLine founding={!!driverStats?.founding_driver} /> : <Body muted small>{t('driverLabel')}</Body>}
          {/* The founding badge rides on the verified line: at the end of the stats it got cut off. */}
          <StatsLine stats={driverStats} showBadge={!driverVerified} />
        </View>
      }
      last={last}
    />
  );
  const driverRow = (
    <View>
      {driverLine(!!endedNote || driverCancelled || status === 'requested')}
      {endedNote || status === 'requested' ? null : (
        <>
          {trip.trip_series && !trip.trip_series.stopped_at ? <ListRow icon="calendar" title={repeatsText(trip.trip_series.weekdays)} /> : null}
          {car?.car_model ? <ListRow icon="carProfile" title={carName(car.car_model, car.car_color, lang)} /> : null}
          <ListRow icon="mapPin" title={pickupLabel} subtitle={t('pickupRow')} last={!!trip.cancelled_at} />
          {trip.cancelled_at ? null : (
            <ListRow
              last
              icon="armchair"
              title={seatsLeft !== null ? (seatsLeft > 0 ? `${ltr(seatsLeft)} ${t('seatsFree')}` : t('full')) : ''}
              subtitle={`${price} ${t('perSeat')}`}
            />
          )}
        </>
      )}
    </View>
  );

  const body = (
    <>
      {driverCancelled ? (
        <DriverCancelled
          tripId={trip.id}
          origin={trip.origin}
          destination={trip.destination}
          departsAt={trip.departs_at}
          cancelledAt={trip.cancelled_at!}
          late={!!trip.cancelled_late}
          excused={trip.cancel_reason === 'checkpoint_closed'}
          refunded={payment && (payment.status === 'refunded' || payment.status === 'released') ? Number(payment.total_ils) : null}
          onSearchAgain={findOthers}
        />
      ) : trip.cancelled_at && !status ? (
        <Note icon="info" text={t('tripCancelled')} />
      ) : null}
      {endedNote ? <Note text={t(endedNote)} /> : null}
      {status === 'no_show' ? <Body muted small>{t('noShowMeaning')}</Body> : null}
      {arrived && myStars !== null ? (
        <View style={styles.labelRow}>
          <Body muted small>
            {t('youRated')}
          </Body>
          <Stars value={myStars} />
        </View>
      ) : null}

      {/* Find the car: who you're meeting, the plate to look for, the car and where. */}
      {findCar ? (
        <View>
          {driverLine(false)}
          {contact?.plate ? (
            <View style={styles.findCar}>
              <Body muted small>
                {t('lookForPlate')}
              </Body>
              <PlateArt plate={contact.plate} width={250} />
            </View>
          ) : null}
          {contact?.car_model ? <ListRow icon="carProfile" title={contact.car_model} subtitle={contact.car_color ?? undefined} /> : null}
          <ListRow last icon="mapPin" title={pickupLabel} subtitle={t('pickupRow')} />
        </View>
      ) : null}
      {findCar && hereAt ? <Note tone="ok" icon="check" text={t('driverKnowsHere')} /> : null}
      {status === 'accepted' && state === 'scheduled' && !findCar && departs.getTime() - now.getTime() < 3 * 60 * 60 * 1000 ? (
        <Body muted small>
          {t('checkInOpens')}
        </Body>
      ) : null}

      {countdown}
      {status === 'requested' ? (
        <Body muted small>
          {t('waitExplain')}
        </Body>
      ) : null}

      {onRoad ? <RouteCheckpoints origin={trip.origin} destination={trip.destination} start={common.pickup} ids={trip.checkpoint_ids} inCard /> : null}

      {(status === 'accepted' || arrived) && contact && !findCar ? (
        <>
          <ContactCard contact={contact} avatarPath={trip.profiles.avatar_path} seed={trip.driver_id} />
          {status === 'accepted' && !trip.started_at && departs.getTime() - Date.now() > 60 * 60 * 1000 ? (
            <Body muted small>
              {t('remindHourBefore')}
            </Body>
          ) : null}
        </>
      ) : driverCancelled || findCar || onRoad ? null : (
        driverRow
      )}
      {payment ? (
        <ListRow
          last
          icon="wallet"
          title={`${t('paymentLabel')} · ${ltr(`${Number(payment.total_ils)}₪`)}`}
          subtitle={`${t(`payment_${payment.status}` as StringKey)} · ${ltr(`•••• ${payment.card_last4}`)}`}
        />
      ) : null}
      {error ? <Body error>{error}</Body> : null}
    </>
  );

  // The buttons, and the one the bar keeps.
  let footer = null;
  let mini: SheetMini = { sub: `${route} · ${price}` };
  if (findCar) {
    footer = hereAt ? (
      contact?.phone ? <Button variant="secondary" label={t('call')} icon="phone" onPress={callDriver} /> : null
    ) : (
      <>
        <Button label={t('imHere')} icon="mapPin" onPress={imHere} loading={sending} />
        {contact?.phone ? <Button variant="plain" label={t('cantFindCar')} onPress={callDriver} /> : null}
      </>
    );
    mini = {
      sub: contact?.plate ? `${t('lookForPlate')} ${contact.plate}` : t('findTheCar'),
      action: hereAt
        ? contact?.phone
          ? { label: t('call'), onPress: callDriver, secondary: true }
          : null
        : { label: t('imHere'), onPress: imHere, loading: sending },
    };
  } else if (onRoad) {
    footer = <Button variant="secondary" label={t('emergencyButton')} icon="warning" onPress={emergency} />;
    mini = { sub: t('onTheWay'), action: { label: t('emergencyButton'), onPress: emergency, secondary: true } };
  } else if (arrived) {
    const rateNow = () => {
      setStep('rate');
      moveTo('full');
    };
    footer = myStars === null && bookingId ? <Button label={t('rateTrip')} icon="star" onPress={rateNow} /> : null;
    mini = { sub: t('arrivedSafe'), tone: 'ok', action: myStars === null && bookingId ? { label: t('rateOne'), onPress: rateNow } : null };
  } else if (canRequest) {
    footer = (
      <>
        <Body muted small style={{ textAlign: 'center' }}>
          {t('detailsAfterAccept')}
        </Body>
        <Button label={`${t('requestSeat')} · ${price}`} onPress={request} />
      </>
    );
    mini = { sub: `${route} · ${price}`, action: { label: t('requestSeat'), onPress: request } };
  } else if (canCancel && status === 'requested') {
    footer = <Button variant="secondary" label={t('withdrawRequest')} onPress={cancel} loading={sending} />;
    mini = {
      sub: `${t('waitingShort')} · ${formatCountdown(left)}`,
      tone: 'clay',
      action: { label: t('withdrawShort'), onPress: cancel, secondary: true, loading: sending },
    };
  } else if (status === 'accepted') {
    footer = canCancel ? (
      <>
        {cancelNote ? (
          <Body muted small style={{ textAlign: 'center' }}>
            {cancelNote}
          </Body>
        ) : null}
        <Button variant="secondary" label={t('cancelSeat')} onPress={cancel} loading={sending} />
      </>
    ) : null;
    mini = {
      sub: contact?.plate ? `${t('seatIsConfirmed')} · ${contact.plate}` : t('seatIsConfirmed'),
      tone: 'ok',
      action: contact?.phone ? { label: t('call'), onPress: callDriver, secondary: true } : null,
    };
  } else if (endedNote || driverCancelled) {
    footer = driverCancelled ? null : <Button variant="secondary" label={t('otherTripsThatDay')} onPress={findOthers} />;
    mini = {
      sub: driverCancelled ? t('sorryCancelled') : t(`status_${status}` as StringKey),
      tone: driverCancelled ? 'clay' : undefined,
      action: { label: t('otherTrips'), onPress: findOthers, secondary: true },
    };
  } else if (trip.cancelled_at) {
    mini = { sub: t('tripCancelled') };
  }

  // A step replaces the details in the same card (same frame, so nothing jumps).
  const page =
    step === 'request'
      ? { header: <StepHeader title={req.title || t('cashTitle')} onBack={backToDetails} />, body: req.body, footer: req.footer, mini: quietBar }
      : step === 'rate'
        ? {
            header: <StepHeader title={rate.title} kicker={rate.kicker} onBack={backToDetails} />,
            body: rate.body,
            footer: rate.footer,
            mini: { sub: t('arrivedSafe'), tone: 'ok' as const },
          }
        : step === 'driver'
          ? { header: <StepHeader title={t('driverLabel')} onBack={backToDetails} />, body: <PersonProfile id={trip.driver_id} />, footer: null, mini: quietBar }
          : {
              header: <TripHero label={label} departsAt={trip.departs_at} origin={trip.origin} destination={trip.destination} />,
              body,
              footer,
              mini,
            };

  return (
    <TripOpenerContext.Provider
      value={(next) => {
        // Another trip from inside this card: swap it in place.
        setTripId(next);
        setStep('details');
      }}
    >
      <TripSheet {...common} {...page} step={{ key: step, depth: step === 'details' ? 0 : 1 }} onShare={step === 'details' && canShare ? share : null} />
    </TripOpenerContext.Provider>
  );
}

/** "Verified driver" with the seal, under the driver's name. */
function VerifiedLine({ founding }: { founding?: boolean }) {
  const { t } = useT();
  return (
    <View style={styles.labelRow}>
      <Icon name="sealCheck" size={14} color={colors.statusOpen} />
      <Body muted small>
        {t('verifiedDriver')}
        {founding ? ` · ${t('foundingDriver')}` : ''}
      </Body>
    </View>
  );
}

/** A calm note in a soft box: what happened, in plain words. */
export function Note({ text, icon, tone }: { text: string; icon?: IconName; tone?: 'ok' }) {
  const fg = tone === 'ok' ? colors.statusOpen : colors.inkSecondary;
  return (
    <View style={[styles.note, { backgroundColor: tone === 'ok' ? colors.statusOpenSoft : 'rgba(23,25,28,0.05)' }]}>
      {icon ? <Icon name={icon} size={16} color={fg} /> : null}
      <Body small style={{ color: fg, flex: 1 }}>
        {text}
      </Body>
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  findCar: { gap: 10, paddingVertical: space.md, alignItems: 'flex-start', borderBottomWidth: 1, borderBottomColor: colors.hairline },
  note: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderRadius: radii.md },
});
