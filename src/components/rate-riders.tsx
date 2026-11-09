// After a trip, the driver rates every rider on one screen and sends it once.
// First the cash reminder (we're cash only in the pilot), then a row of stars per rider.
// Each rating goes through rate_trip() like the passenger's own, which checks who you are
// and that the trip really finished. Riders you skip can be rated later, for 7 days.

import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { StarPicker, Stars } from '@/components/stars';
import { Body, Button, ListRow, ltr, useFont } from '@/components/ui';
import { successFeel } from '@/lib/haptics';
import { useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { colors, space } from '@/theme/tokens';

export type RideToRate = {
  bookingId: string;
  passengerId: string;
  name: string;
  avatarPath: string | null;
  seats: number;
  /** Stars already given, if any. */
  given: number | null;
};

export function useRateRiders({
  riders,
  price,
  open,
  onDone,
}: {
  riders: RideToRate[];
  price: number;
  /** Ratings close 7 days after the trip. */
  open: boolean;
  onDone: () => void;
}): { body: ReactNode; footer: ReactNode } {
  const { t } = useT();
  const { f } = useFont();
  const [stars, setStars] = useState<Record<string, number>>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = riders.reduce((n, r) => n + r.seats * price, 0);
  const toRate = riders.filter((r) => r.given === null);
  const picked = toRate.filter((r) => (stars[r.bookingId] ?? 0) > 0);

  async function send() {
    setSending(true);
    setError(null);
    const results = await Promise.all(
      picked.map((r) =>
        supabase.rpc('rate_trip', { p_booking_id: r.bookingId, p_stars: stars[r.bookingId], p_tags: [], p_note: null }),
      ),
    );
    setSending(false);
    if (results.some((x) => x.error && !x.error.message.includes('already rated'))) return setError(t('somethingWrong'));
    successFeel();
    onDone();
  }

  const body = (
    <>
      {total > 0 ? (
        <View>
          <ListRow
            last
            icon="wallet"
            title={t('collectCash').replace('{amount}', ltr(`${total}₪`))}
            subtitle={riders.map((r) => `${r.name} ${ltr(`${r.seats * price}₪`)}`).join(' · ')}
          />
        </View>
      ) : null}
      {riders.length > 0 ? (
        <Body small style={{ fontFamily: f.medium }}>
          {t('rateRiders')}
        </Body>
      ) : null}
      {riders.map((r) => (
        <View key={r.bookingId} style={styles.rider}>
          <View style={styles.who}>
            <Avatar path={r.avatarPath} name={r.name} seed={r.passengerId} size={36} />
            <Body style={{ flex: 1, fontFamily: f.medium }}>{r.name}</Body>
            {r.given !== null ? <Stars value={r.given} /> : null}
          </View>
          {r.given === null && open ? (
            <StarPicker
              size={30}
              label={r.name}
              value={stars[r.bookingId] ?? 0}
              onChange={(n) => setStars((cur) => ({ ...cur, [r.bookingId]: n }))}
            />
          ) : null}
        </View>
      ))}
      {!open && toRate.length > 0 ? <Body muted small>{t('ratingClosed')}</Body> : null}
      {error ? <Body error>{error}</Body> : null}
    </>
  );

  const footer =
    open && toRate.length > 0 ? (
      <>
        <Button label={t('sendRatings')} onPress={send} loading={sending} disabled={picked.length === 0} />
        <Button variant="plain" label={t('later')} onPress={onDone} />
      </>
    ) : (
      <Button label={t('continue')} onPress={onDone} />
    );

  return { body, footer };
}

const styles = StyleSheet.create({
  rider: { gap: space.sm, paddingBottom: space.md, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  who: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
