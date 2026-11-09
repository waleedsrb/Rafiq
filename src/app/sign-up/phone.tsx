import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Body, Button, PillChips, Field, Screen, Title } from '@/components/ui';
import { normalizePhone } from '@/lib/phone';
import { useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/track';
import { space } from '@/theme/tokens';

// Palestinian mobiles work with either country code, so the person picks one.
type Prefix = '970' | '972';

export default function PhoneStep() {
  const { t } = useT();
  const [prefix, setPrefix] = useState<Prefix>('970');
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // "059 123 4567" or "59 123 4567" -> "+970591234567".
  // A full number with its own +970/+972 also works (pasted from contacts).
  const typed = raw.trim();
  const phone = normalizePhone(typed.startsWith('+') || typed.startsWith('00') ? typed : `+${prefix}${typed.replace(/^0/, '')}`);

  async function submit() {
    if (!phone) {
      setError(t('phoneInvalid'));
      return;
    }
    setSending(true);
    setError(null);
    // Supabase sends the SMS code. In development we use test numbers that
    // always get the same code, so no real SMS is sent (see README).
    const { error: err } = await supabase.auth.signInWithOtp({ phone });
    setSending(false);
    if (err) {
      setError(t('somethingWrong'));
      return;
    }
    track('signup_phone_submitted'); // note: never log the number itself
    router.push({ pathname: '/sign-up/code', params: { phone } });
  }

  return (
    <Screen back footer={<Button label={t('sendCode')} onPress={submit} loading={sending} disabled={!raw} />}>
      <Title>{t('phoneTitle')}</Title>
      <Body muted>{t('phoneHint')}</Body>
      <View style={{ marginTop: space.md }}>
        <Field
          label={t('phoneLabel')}
          ltr
          prefix={`+${prefix}`}
          autoFocus
          value={raw}
          onChangeText={(v) => {
            setRaw(v);
            setError(null);
          }}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          placeholder={t('phonePlaceholder')}
          onSubmitEditing={submit}
        />
      </View>
      <View style={{ flexDirection: 'row' }}>
        <PillChips
          labels={[t('countryPS'), '+972']}
          selected={prefix === '970' ? 0 : 1}
          onPick={(i) => setPrefix(i === 0 ? '970' : '972')}
        />
      </View>
      {error ? <Body error>{error}</Body> : null}
    </Screen>
  );
}
