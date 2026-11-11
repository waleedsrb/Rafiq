// Request a seat: pay (hold) and request in one step.
// The card details stay on the phone; only a token goes to the database (see lib/payments.ts).
// Cash pilot: while settings.cash_only is on, there is no card and no fee. The passenger
// just asks for the seat (request_seat_cash) and pays the driver in the car.
//
// Used as a step inside the trip card, and by the old /trips/checkout/[id] screen.
// It's a hook that hands back the pieces (body and footer), because the card puts its
// buttons in its own pinned footer.

import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { Icon } from '@/components/icon';
import { Body, Button, Field, ListRow, ltr } from '@/components/ui';
import type { StringKey } from '@/i18n/strings';
import { checkCard, fakeTokenize, formatCardNumber, formatExpiry } from '@/lib/payments';
import { askForPush } from '@/lib/push';
import { useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import type { City } from '@/lib/trip-form';
import { makeStyles, useTheme } from '@/theme/theme';
import { radii, space } from '@/theme/tokens';

export type CheckoutTrip = { id: string; origin: City; destination: City; departs_at: string; price_ils: number };

const money = (n: number) => ltr(`${Number.isInteger(n) ? n : n.toFixed(2)}₪`);

export function useRequestSeat(
  tripId: string | null | undefined,
  active: boolean,
  onDone: () => void,
): { ready: boolean; cash: boolean; title: string; trip: CheckoutTrip | null; body: ReactNode; footer: ReactNode } {
  const { c: colors } = useTheme();
  const styles = useStyles();
  const { t } = useT();
  const [trip, setTrip] = useState<CheckoutTrip | null>(null);
  const [fee, setFee] = useState<number | null>(null);
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [cash, setCash] = useState<boolean | null>(null);

  useEffect(() => {
    if (!tripId || !active) return;
    setError(null);
    supabase
      .from('trips')
      .select('id, origin, destination, departs_at, price_ils')
      .eq('id', tripId)
      .single()
      .then(({ data }) => setTrip((data as CheckoutTrip | null) ?? null));
    supabase
      .from('settings')
      .select('value')
      .eq('key', 'service_fee_ils')
      .maybeSingle()
      .then(({ data }) => setFee(Number(data?.value ?? 0)));
    supabase.rpc('cash_only').then(({ data, error: err }) => setCash(err ? false : data === true));
  }, [tripId, active]);

  async function requestCash() {
    if (!trip) return;
    setPaying(true);
    setError(null);
    const { error: err } = await supabase.rpc('request_seat_cash', { p_trip_id: trip.id });
    setPaying(false);
    if (err) {
      if (err.message.includes('profile photo')) return setError(t('photoNeeded'));
      if (err.message.includes('trip is full')) return setError(t('tripFullNow'));
      return setError(err.message.includes('women only') ? t('womenOnlyTrip') : t('somethingWrong'));
    }
    await askForPush();
    onDone();
  }

  async function pay() {
    if (!trip) return;
    const card = { number, expiry, cvc };
    const problem = checkCard(card, new Date());
    if (problem) return setError(t(`cardProblem_${problem}` as StringKey));
    setPaying(true);
    setError(null);
    const tok = fakeTokenize(card);
    // One call: hold the card and create the request together (request_seat in the database).
    const { error: err } = await supabase.rpc('request_seat', {
      p_trip_id: trip.id,
      p_card_token: tok.token,
      p_card_brand: tok.brand,
      p_card_last4: tok.last4,
    });
    setPaying(false);
    if (err) {
      if (err.message.includes('women only')) return setError(t('womenOnlyTrip'));
      if (err.message.includes('profile photo')) return setError(t('photoNeeded'));
      if (err.message.includes('trip is full')) return setError(t('tripFullNow'));
      return setError(err.message.includes('declined') ? t('cardDeclined') : t('somethingWrong'));
    }
    // Now is when notifications make sense: "tell me when the driver answers".
    await askForPush();
    onDone();
  }

  const ready = !!trip && fee !== null && cash !== null;
  if (!ready) return { ready, cash: false, title: '', trip, body: null, footer: null };
  const total = Number(trip.price_ils) + fee;
  const errorLine = error ? <Body error>{error}</Body> : null;

  if (cash) {
    return {
      ready,
      cash: true,
      trip,
      title: t('cashTitle'),
      body: (
        <>
          <View>
            <ListRow icon="armchair" title={t('fareLine')} trailing={<Body>{money(Number(trip.price_ils))}</Body>} />
            <ListRow last icon="wallet" title={t('cashLine')} />
          </View>
          <Body muted small>
            {t('cashHint')}
          </Body>
          {errorLine}
        </>
      ),
      footer: <Button label={t('sendRequest')} onPress={requestCash} loading={paying} />,
    };
  }

  return {
    ready,
    cash: false,
    trip,
    title: t('checkoutTitle'),
    body: (
      <>
        <View>
          <ListRow icon="armchair" title={t('fareLine')} trailing={<Body>{money(Number(trip.price_ils))}</Body>} />
          <ListRow icon="ticket" title={t('feeLine')} trailing={<Body>{money(fee)}</Body>} />
          <ListRow last icon="wallet" title={t('totalLine')} trailing={<Body style={{ fontWeight: '700' }}>{money(total)}</Body>} />
        </View>
        <Body muted small>
          {t('checkoutHint')}
        </Body>

        <Field
          label={t('cardNumber')}
          ltr
          value={number}
          onChangeText={(v) => {
            setNumber(formatCardNumber(v));
            setError(null);
          }}
          placeholder="4242 4242 4242 4242"
          keyboardType="number-pad"
          autoComplete="cc-number"
          textContentType="creditCardNumber"
          maxLength={23}
        />
        <View style={[styles.pair, { flexDirection: 'row' }]}>
          <View style={{ flex: 1 }}>
            <Field
              label={t('cardExpiry')}
              ltr
              value={expiry}
              onChangeText={(v) => {
                setExpiry(formatExpiry(v));
                setError(null);
              }}
              placeholder="MM/YY"
              keyboardType="number-pad"
              autoComplete="cc-exp"
              maxLength={5}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label={t('cardCvc')}
              ltr
              value={cvc}
              onChangeText={(v) => {
                setCvc(v.replace(/\D/g, '').slice(0, 4));
                setError(null);
              }}
              placeholder="123"
              keyboardType="number-pad"
              autoComplete="cc-csc"
              secureTextEntry
              maxLength={4}
            />
          </View>
        </View>

        <View style={[styles.test, { flexDirection: 'row' }]}>
          <Icon name="shieldCheck" size={18} color={colors.inkSecondary} />
          <Body muted small style={{ flex: 1 }}>
            {t('testMode')}
          </Body>
        </View>
        {errorLine}
      </>
    ),
    footer: (
      <Button label={`${t('payAndRequest')} · ${money(total)}`} onPress={pay} loading={paying} disabled={!number || !expiry || !cvc} />
    ),
  };
}

const useStyles = makeStyles((colors) => ({
  pair: { gap: space.md },
  test: { gap: space.sm, alignItems: 'flex-start', backgroundColor: colors.sunken, borderRadius: radii.md, padding: space.md },
}));
