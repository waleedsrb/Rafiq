import { router } from 'expo-router';
import { useState } from 'react';

import { Body, Button, Field, Screen, Title } from '@/components/ui';
import { normalizePhone } from '@/lib/phone';
import { useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/track';

export default function PhoneStep() {
  const { t } = useT();
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const phone = normalizePhone(raw);

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
    <Screen footer={<Button label={t('continue')} onPress={submit} loading={sending} disabled={!raw} />}>
      <Title>{t('phoneTitle')}</Title>
      <Body muted>{t('phoneHint')}</Body>
      <Field
        ltr
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
      {error ? <Body error>{error}</Body> : null}
    </Screen>
  );
}
