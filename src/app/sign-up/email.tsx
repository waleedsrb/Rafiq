import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Body, Button, Field, Screen, Title } from '@/components/ui';
import { normalizeEmail } from '@/lib/sign-in';
import { useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/track';
import { space } from '@/theme/tokens';

// Email sign in: Supabase emails a 6-digit code, the next screen checks it.
// Same code screen as the phone way (sign-up/code.tsx).
export default function EmailStep() {
  const { t } = useT();
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const email = normalizeEmail(raw);

  async function submit() {
    if (!email) {
      setError(t('emailInvalid'));
      return;
    }
    setSending(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({ email });
    setSending(false);
    if (err) {
      // 429: Supabase limits how many emails go out per hour.
      setError(err.status === 429 ? t('emailTooMany') : t('somethingWrong'));
      return;
    }
    track('signup_email_submitted'); // never log the address itself
    router.push({ pathname: '/sign-up/code', params: { email } });
  }

  return (
    <Screen back footer={<Button label={t('sendCode')} onPress={submit} loading={sending} disabled={!raw.trim()} />}>
      <Title>{t('emailTitle')}</Title>
      <Body muted>{t('emailHint')}</Body>
      <View style={{ marginTop: space.md }}>
        <Field
          label={t('emailLabel')}
          ltr
          autoFocus
          value={raw}
          onChangeText={(v) => {
            setRaw(v);
            setError(null);
          }}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="name@example.com"
          onSubmitEditing={submit}
        />
      </View>
      {error ? <Body error>{error}</Body> : null}
    </Screen>
  );
}
