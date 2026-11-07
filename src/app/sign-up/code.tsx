import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { Body, Button, Field, Screen, Title } from '@/components/ui';
import { useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/track';
import { fonts } from '@/theme/tokens';

export default function CodeStep() {
  const { t } = useT();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function submit(value = code) {
    if (value.length !== 6 || !phone) return;
    setChecking(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({ phone, token: value, type: 'sms' });
    setChecking(false);
    if (err) {
      setError(t('codeInvalid'));
      return;
    }
    track('signup_code_verified');
    // No navigation needed: signing in flips the guards in _layout.tsx,
    // which moves the person to the profile step (or home, if they already have one).
  }

  return (
    <Screen footer={<Button label={t('continue')} onPress={() => submit()} loading={checking} disabled={code.length !== 6} />}>
      <Title>{t('codeTitle')}</Title>
      <Body muted>
        {t('codeHint')}{' '}
        {/* Keep the number left-to-right inside Arabic text */}
        <Text style={{ fontFamily: fonts.en.medium, writingDirection: 'ltr' }}>{'⁦' + phone + '⁩'}</Text>
      </Body>
      <Field
        ltr
        autoFocus
        value={code}
        maxLength={6}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        placeholder="000000"
        onChangeText={(v) => {
          const digits = v.replace(/\D/g, '');
          setCode(digits);
          setError(null);
          if (digits.length === 6) submit(digits); // auto-submit when complete
        }}
      />
      {error ? <Body error>{error}</Body> : null}
    </Screen>
  );
}
