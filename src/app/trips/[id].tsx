// Trip details for a passenger, with "Request a seat" or the status of their request.
// On the day it follows the trip: Find the car (from 30 min before), On the road
// (after the driver taps Start), then Arrived & rate.

import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ContactCard, useContact } from '@/components/contact-card';
import { Plate } from '@/components/plate';
import { RouteCheckpoints } from '@/components/route-checkpoints';
import { StatsLine, usePeopleStats } from '@/components/stats-line';
import { Stars } from '@/components/stars';
import { Icon } from '@/components/icon';
import { RouteMap } from '@/components/route-map';
import { TripHero } from '@/components/trip-hero';
import { Body, Button, Countdown, IconCircle, ListRow, Screen, ltr } from '@/components/ui';
import type { StringKey } from '@/i18n/strings';
import { confirm } from '@/lib/confirm';
import { formatCountdown, formatDay, formatTime } from '@/lib/format';
import { useBookingChanges, useTripChanges } from '@/lib/live';
import { shortName } from '@/lib/names';
import { telLink } from '@/lib/phone';
import { freeCancel } from '@/lib/rules';
import { useSession, useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import type { City } from '@/lib/trip-form';
import { startOpen, tripState } from '@/lib/trip-day';
import { colors, fonts } from '@/theme/tokens';

type Payment = { status: 'held' | 'charged' | 'released' | 'refunded'; total_ils: number; card_brand: string; card_last4: string };

type Trip = {
  id: string;
  driver_id: string;
  origin: City;
  destination: City;
  departs_at: string;
  price_ils: number;
  cancelled_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  profiles: { full_name: string }; // the driver, joined through trips.driver_id
};

export default function TripDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useT();
  const { session, profile } = useSession();
  const insets = useSafeAreaInsets();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [seatsLeft, setSeatsLeft] = useState<number | null>(null);
  const [driverVerified, setDriverVerified] = useState(false);
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

  const load = useCallback(async () => {
    if (!session || !id) return;
    const [tripRes, seatsRes, bookingRes] = await Promise.all([
      supabase
        .from('trips')
        .select('id, driver_id, origin, destination, departs_at, price_ils, cancelled_at, started_at, finished_at, profiles!trips_driver_id_fkey(full_name)')
        .eq('id', id)
        .single(),
      supabase.rpc('seats_left', { p_trip_id: id }),
      supabase.from('bookings').select('id, status, respond_by, accepted_at, created_at, here_at').eq('trip_id', id).eq('passenger_id', session.user.id).maybeSingle(),
    ]);
    const loaded = (tripRes.data as unknown as Trip | null) ?? null;
    setTrip(loaded);
    if (loaded) supabase.rpc('is_verified_driver', { p_driver_id: loaded.driver_id }).then(({ data }) => setDriverVerified(data === true));
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
    }
    if (bid) {
      const { data: pay } = await supabase
        .from('payments')
        .select('status, total_ils, card_brand, card_last4')
        .eq('booking_id', bid)
        .maybeSingle();
      setPayment((pay as Payment | null) ?? null);
    } else setPayment(null);
  }, [id, session]);

  // Reload whenever the screen comes back into view (e.g. after paying on checkout).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Tick once a second while we wait for the driver's answer, and every 15 seconds on
  // a confirmed seat so "Find the car" appears on time.
  useEffect(() => {
    if (status !== 'requested' && status !== 'accepted') return;
    const timer = setInterval(() => setNow(new Date()), status === 'requested' ? 1000 : 15_000);
    return () => clearInterval(timer);
  }, [status]);

  const contact = useContact(status === 'accepted' ? bookingId : null);
  const stats = usePeopleStats(trip ? [trip.driver_id] : []);

  // When the driver accepts, the status and contact card appear right away.
  useBookingChanges(load, id ? `trip_id=eq.${id}` : undefined);
  // When the driver taps Start trip or Arrived.
  useTripChanges(load, id);

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
    if (!profile?.id_verified_at) {
      router.push({ pathname: '/verify', params: { kind: 'passenger' } });
      return;
    }
    // Paying (a hold on the card) and requesting happen together on the checkout screen.
    router.push({ pathname: '/trips/checkout/[id]', params: { id: trip.id } });
  }

  // Withdraw a request, or cancel an accepted seat (warning first if it's late).
  async function cancel() {
    if (!trip || !bookingId) return;
    const late = status === 'accepted' && !freeCancel(new Date(), new Date(trip.departs_at), acceptedAt ? new Date(acceptedAt) : null);
    const ok = await confirm(
      t(late ? 'lateCancelTitle' : 'cancelConfirmTitle'),
      t(late ? 'lateCancelBody' : 'cancelConfirmBody'),
      t('yesCancel'),
      t('keep'),
    );
    if (!ok) return;
    setSending(true);
    setError(null);
    const { error: err } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', bookingId);
    setSending(false);
    if (err) return setError(t('somethingWrong'));
    await load();
  }

  if (!trip) return <Screen back>{null}</Screen>;

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

  const driverName = shortName(trip.profiles.full_name);
  const driverStats = stats[trip.driver_id];
  const canRequest =
    status === null && !trip.cancelled_at && (seatsLeft ?? 0) > 0 && trip.driver_id !== session?.user.id;
  const state = tripState(trip);
  const canCancel = (status === 'requested' || status === 'accepted') && departs > new Date() && state === 'scheduled';
  // Trip day phases for a confirmed seat.
  const findCar = status === 'accepted' && state === 'scheduled' && startOpen(now, departs);
  const onRoad = status === 'accepted' && state === 'underway';
  const arrived = status === 'completed';
  const callDriver = () => {
    if (contact?.phone) Linking.openURL(telLink(contact.phone)).catch(() => {});
  };
  const price = ltr(`${trip.price_ils}₪`);

  async function share() {
    if (!trip || !contact) return;
    const message = t('shareMessage')
      .replace('{route}', `${t(trip.origin)} ${lang === 'ar' ? '←' : '→'} ${t(trip.destination)}`)
      .replace('{when}', when(trip.departs_at))
      .replace('{driver}', contact.first_name)
      .replace('{car}', [contact.car_model, contact.car_color].filter(Boolean).join(' '))
      .replace('{plate}', contact.plate ?? '');
    await Share.share({ message }).catch(() => {});
  }

  // The small line above the big time says where things stand.
  const label = findCar || onRoad || arrived ? (
      <Body small style={{ fontFamily: fonts[lang].medium }}>
        {t(findCar ? 'findTheCar' : onRoad ? 'onTheWay' : 'arrivedSafe')}
      </Body>
    ) : status === 'accepted' ? (
      <View style={styles.labelRow}>
        <Icon name="check" size={14} />
        <Body small style={{ fontFamily: fonts[lang].medium }}>
          {t('seatIsConfirmed')}
        </Body>
      </View>
    ) : status === 'requested' ? (
      <Body muted small>
        {t('sentRequestTo')} {driverName}
      </Body>
    ) : null;

  let countdown = null;
  if (status === 'requested' && respondBy && createdAt) {
    const start = new Date(createdAt).getTime();
    const end = new Date(respondBy).getTime();
    const left = end - now.getTime();
    countdown = (
      <Countdown label={t('waitingForDriver')} remaining={formatCountdown(left)} progress={end > start ? left / (end - start) : 0} />
    );
  }

  return (
    <Screen
      back
      scroll
      hero={
        <RouteMap
          origin={trip.origin}
          destination={trip.destination}
          height={insets.top + 300}
          topInset={insets.top + 60}
          onExpand={() => router.push({ pathname: '/checkpoints/map', params: { origin: trip.origin } })}
        />
      }
      footer={
        findCar ? (
          <>
            {hereAt ? null : <Button label={t('imHere')} icon="mapPin" onPress={imHere} loading={sending} />}
            {contact?.phone ? <Button variant={hereAt ? 'secondary' : 'plain'} label={t('cantFindCar')} icon="phone" onPress={callDriver} /> : null}
          </>
        ) : onRoad ? (
          contact ? <Button variant="secondary" label={t('shareTrip')} icon="shareNetwork" onPress={share} /> : undefined
        ) : arrived && myStars === null && bookingId ? (
          <Button label={t('rateTrip')} icon="star" onPress={() => router.push({ pathname: '/trips/rate/[bookingId]', params: { bookingId } })} />
        ) : canRequest ? (
          <>
            <Button label={`${t('requestSeat')} · ${price}`} onPress={request} loading={sending} />
            <Body muted small style={{ textAlign: 'center' }}>
              {t('detailsAfterAccept')}
            </Body>
          </>
        ) : canCancel ? (
          <>
            {status === 'accepted' && contact ? <Button label={t('shareTrip')} icon="shareNetwork" onPress={share} /> : null}
            <Button
              variant={status === 'accepted' ? 'plain' : 'secondary'}
              label={t(status === 'requested' ? 'withdrawRequest' : 'cancelSeat')}
              onPress={cancel}
              loading={sending}
            />
          </>
        ) : undefined
      }
    >
      <TripHero label={label} departsAt={trip.departs_at} origin={trip.origin} destination={trip.destination} />

      {trip.cancelled_at ? <Body error>{t('tripCancelled')}</Body> : null}
      {status === 'no_show' ? <Body muted>{t('leftWithoutYou')}</Body> : null}
      {status && !['requested', 'accepted', 'completed', 'no_show'].includes(status) ? (
        <Body muted>{t(`status_${status}` as StringKey)}</Body>
      ) : null}
      {arrived && myStars !== null ? (
        <View style={styles.labelRow}>
          <Body muted small>{t('youRated')}</Body>
          <Stars value={myStars} />
        </View>
      ) : null}

      {findCar && contact?.plate ? (
        <View style={styles.findCar}>
          <Body muted small>{t('lookForPlate')}</Body>
          <Plate plate={contact.plate} />
          {contact.car_model ? <Body>{[contact.car_model, contact.car_color].filter(Boolean).join(' · ')}</Body> : null}
          {hereAt ? (
            <View style={styles.labelRow}>
              <Icon name="check" size={14} color={colors.statusOpen} />
              <Body muted small>{t('driverKnowsHere')}</Body>
            </View>
          ) : null}
        </View>
      ) : null}
      {status === 'accepted' && state === 'scheduled' && !findCar && departs.getTime() - now.getTime() < 3 * 60 * 60 * 1000 ? (
        <Body muted small>{t('checkInOpens')}</Body>
      ) : null}

      {countdown}
      {status === 'requested' ? <Body muted small>{t('waitExplain')}</Body> : null}

      {onRoad ? <RouteCheckpoints origin={trip.origin} /> : null}

      {(status === 'accepted' || arrived) && contact ? (
        <ContactCard contact={contact} />
      ) : (
        <View>
          <ListRow
            leading={<IconCircle letter={driverName.charAt(0)} />}
            title={driverName}
            subtitle={
              <View style={{ gap: 2 }}>
                {driverVerified ? <VerifiedLine /> : <Body muted small>{t('driverLabel')}</Body>}
                <StatsLine stats={driverStats} />
              </View>
            }
          />
          <ListRow
            last
            icon="armchair"
            title={seatsLeft !== null ? (seatsLeft > 0 ? `${ltr(seatsLeft)} ${t('seatsFree')}` : t('full')) : ''}
            subtitle={`${price} ${t('perSeat')}`}
          />
        </View>
      )}
      {payment ? (
        <ListRow
          last
          icon="wallet"
          title={`${t('paymentLabel')} · ${ltr(`${Number(payment.total_ils)}₪`)}`}
          subtitle={`${t(`payment_${payment.status}` as StringKey)} · ${ltr(`•••• ${payment.card_last4}`)}`}
        />
      ) : null}
      {cancelNote ? <Body muted small>{cancelNote}</Body> : null}
      {error ? <Body error>{error}</Body> : null}
    </Screen>
  );
}

/** "Verified driver" with the seal, under the driver's name. */
function VerifiedLine() {
  const { t } = useT();
  return (
    <View style={styles.labelRow}>
      <Icon name="sealCheck" size={14} color={colors.statusOpen} />
      <Body muted small>
        {t('verifiedDriver')}
      </Body>
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  findCar: { gap: 10, paddingVertical: 8 },
});
