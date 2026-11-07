// Checkout: pay (hold) and request a seat in one step.
// The card details stay on the phone; only a token goes to the database (see lib/payments.ts).

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { TripHero } from '@/components/trip-hero';
import { Body, Button, Field, ListRow, Screen, Title, ltr, useFont } from '@/components/ui';
import type { StringKey } from '@/i18n/strings';
import { checkCard, fakeTokenize, formatCardNumber, formatExpiry } from '@/lib/payments';
import { askForPush } from '@/lib/push';
import { useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import type { City } from '@/lib/trip-form';
import { colors, radii, space } from '@/theme/tokens';

type Trip = { id: string; origin: City; destination: City; departs_at: string; price_ils: number };

const money = (n: number) => ltr(`${Number.isInteger(n) ? n : n.toFixed(2)}₪`);

export default function Checkout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useT();
  const { rtl } = useFont();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [fee, setFee] = useState<number | null>(null);
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (!id) return;
    supabase
      .from('trips')
      .select('id, origin, destination, departs_at, price_ils')
      .eq('id', id)
      .single()
      .then(({ data }) => setTrip((data as Trip | null) ?? null));
    supabase
      .from('settings')
      .select('value')
      .eq('key', 'service_fee_ils')
      .maybeSingle()
      .then(({ data }) => setFee(Number(data?.value ?? 0)));
  }, [id]);

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
    if (err) return setError(err.message.includes('declined') ? t('cardDeclined') : t('somethingWrong'));
    // Now is when notifications make sense: "tell me when the driver answers".
    await askForPush();
    router.back();
  }

  if (!trip || fee === null) return <Screen back>{null}</Screen>;
  const total = Number(trip.price_ils) + fee;

  return (
    <Screen
      back
      scroll
      footer={
        <Button
          label={`${t('payAndRequest')} · ${money(total)}`}
          onPress={pay}
          loading={paying}
          disabled={!number || !expiry || !cvc}
        />
      }
    >
      <Title>{t('checkoutTitle')}</Title>
      <TripHero departsAt={trip.departs_at} origin={trip.origin} destination={trip.destination} />

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
        <Body muted small style={{ flex: 1, textAlign: rtl ? 'right' : 'left' }}>
          {t('testMode')}
        </Body>
      </View>

      {error ? <Body error>{error}</Body> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pair: { gap: space.md },
  test: { gap: space.sm, alignItems: 'flex-start', backgroundColor: colors.sunken, borderRadius: radii.md, padding: space.md },
});
