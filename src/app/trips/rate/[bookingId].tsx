// Arrived & rate: after a finished trip, each side rates the other once.
// The passenger rates the driver; the driver rates each passenger (one booking at a time).
// rate_trip() in the database checks who you are and that the trip really finished.

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { StarPicker, Stars } from '@/components/stars';
import { Body, Button, Chip, Field, Screen, Title } from '@/components/ui';
import type { StringKey } from '@/i18n/strings';
import { successFeel } from '@/lib/haptics';
import { shortName } from '@/lib/names';
import { useSession, useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { ratingOpen } from '@/lib/trip-day';
import { space } from '@/theme/tokens';

// Tags the rater can pick, by who is being rated. The database only checks their shape.
const TAGS = {
  driver: ['on_time', 'safe_driving', 'clean_car', 'friendly'],
  passenger: ['on_time', 'friendly', 'respectful'],
} as const;

type Loaded = {
  status: string;
  passenger_id: string;
  passenger: { full_name: string };
  trips: { id: string; driver_id: string; finished_at: string | null; driver: { full_name: string } };
};

export default function RateTrip() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { t } = useT();
  const { session } = useSession();
  const [b, setB] = useState<Loaded | null>(null);
  const [given, setGiven] = useState<number | null>(null); // stars already given
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bookingId || !session) return;
    supabase
      .from('bookings')
      .select(
        'status, passenger_id, passenger:profiles!bookings_passenger_id_fkey(full_name), trips!inner(id, driver_id, finished_at, driver:profiles!trips_driver_id_fkey(full_name))',
      )
      .eq('id', bookingId)
      .maybeSingle()
      .then(({ data }) => setB((data as unknown as Loaded | null) ?? null));
    supabase
      .from('ratings')
      .select('stars')
      .eq('booking_id', bookingId)
      .eq('rater_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setGiven((data as { stars: number } | null)?.stars ?? null));
  }, [bookingId, session]);

  if (!b || !session) return <Screen back>{null}</Screen>;

  const iAmPassenger = b.passenger_id === session.user.id;
  const role = iAmPassenger ? 'driver' : 'passenger';
  const name = shortName(iAmPassenger ? b.trips.driver.full_name : b.passenger.full_name);
  const open = b.status === 'completed' && !!b.trips.finished_at && ratingOpen(new Date(), new Date(b.trips.finished_at));
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/home'));

  async function send() {
    if (!bookingId || stars === 0) return;
    setSending(true);
    setError(null);
    const { error: err } = await supabase.rpc('rate_trip', {
      p_booking_id: bookingId,
      p_stars: stars,
      p_tags: tags,
      p_note: note.trim() || null,
    });
    setSending(false);
    if (err && !err.message.includes('already rated')) return setError(t('somethingWrong'));
    successFeel();
    setDone(true);
    setGiven(stars);
  }

  const toggle = (tag: string) => setTags((cur) => (cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag]));

  // Already rated (now or before): a calm thank-you.
  if (given !== null) {
    return (
      <Screen back footer={<Button label={t('continue')} onPress={leave} />}>
        <Title>{done ? t('thanksRating') : t('tripFinished')}</Title>
        <View style={styles.given}>
          <Body muted>{t('youRated')}</Body>
          <Stars value={given} size={18} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      back
      scroll
      footer={
        open ? (
          <>
            <Button label={t('sendRating')} onPress={send} loading={sending} disabled={stars === 0} />
            <Button variant="plain" label={t('notNow')} onPress={leave} />
          </>
        ) : undefined
      }
    >
      <Body muted small>
        {iAmPassenger ? t('arrivedSafe') : t('tripFinished')}
      </Body>
      <Title>{t('rateHowWas').replace('{name}', name)}</Title>
      {open ? (
        <>
          <StarPicker value={stars} onChange={setStars} />
          <View style={styles.tags}>
            {TAGS[role].map((tag) => (
              <Chip key={tag} label={t(`tag_${tag}` as StringKey)} selected={tags.includes(tag)} onPress={() => toggle(tag)} />
            ))}
          </View>
          <Field
            label={t('noteOptional')}
            placeholder={t('noteOnlyThey').replace('{name}', name)}
            value={note}
            onChangeText={setNote}
            maxLength={500}
            multiline
          />
        </>
      ) : (
        <Body muted>{t('ratingClosed')}</Body>
      )}
      {error ? <Body error>{error}</Body> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  given: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
