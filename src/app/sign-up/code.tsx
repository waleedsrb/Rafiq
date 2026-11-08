import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Body, Screen, TextLink, Title, ltr } from '@/components/ui';
import { formatPhone } from '@/lib/phone';
import { useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/track';
import { colors, fonts, space } from '@/theme/tokens';

const LENGTH = 6;
const RESEND_AFTER = 45; // seconds before the person may ask for a new code

export default function CodeStep() {
  const { t } = useT();
  // Arrives with either a phone (SMS code) or an email (emailed code).
  const { phone, email } = useLocalSearchParams<{ phone?: string; email?: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [wait, setWait] = useState(RESEND_AFTER);
  const input = useRef<ComponentRef<typeof TextInput>>(null);

  // Count down to the resend link once a second.
  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function submit(value: string) {
    if (value.length !== LENGTH || !(phone || email)) return;
    setChecking(true);
    setError(null);
    const { error: err } = email
      ? await supabase.auth.verifyOtp({ email, token: value, type: 'email' })
      : await supabase.auth.verifyOtp({ phone: phone!, token: value, type: 'sms' });
    setChecking(false);
    if (err) {
      setError(t('codeInvalid'));
      setCode('');
      return;
    }
    track('signup_code_verified');
    // No navigation needed: signing in flips the guards in _layout.tsx,
    // which moves the person to the profile step (or home, if they already have one).
  }

  async function resend() {
    if (!phone && !email) return;
    setWait(RESEND_AFTER);
    setError(null);
    const { error: err } = email
      ? await supabase.auth.signInWithOtp({ email })
      : await supabase.auth.signInWithOtp({ phone: phone! });
    if (err) setError(t('somethingWrong'));
  }

  const timeLeft = `0:${String(wait).padStart(2, '0')}`;

  return (
    <Screen back>
      <Title>{t('codeTitle')}</Title>
      <Body muted>
        {t('codeHint')} <Text style={{ fontFamily: fonts.en.medium }}>{ltr(email ?? (phone ? formatPhone(phone) : ''))}</Text>
      </Body>
      {email ? (
        <Body muted small>
          {t('codeSpamHint')}
        </Body>
      ) : null}

      {/* Six boxes drawn over one invisible input, so paste and SMS autofill still work. */}
      <Pressable onPress={() => input.current?.focus()} style={styles.boxes}>
        {Array.from({ length: LENGTH }, (_, i) => {
          const active = i === Math.min(code.length, LENGTH - 1) && !checking;
          return (
            <View key={i} style={[styles.box, active && styles.boxActive]}>
              <Text style={styles.digit}>{code[i] ?? ''}</Text>
            </View>
          );
        })}
        <TextInput
          ref={input}
          autoFocus
          value={code}
          maxLength={LENGTH}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete={email ? 'one-time-code' : 'sms-otp'}
          caretHidden
          style={styles.hiddenInput}
          onChangeText={(v) => {
            const digits = v.replace(/\D/g, '').slice(0, LENGTH);
            setCode(digits);
            setError(null);
            if (digits.length === LENGTH) submit(digits); // auto-submit when complete
          }}
        />
      </Pressable>

      {checking ? <Body muted>{t('checking')}</Body> : null}
      {error ? <Body error>{error}</Body> : null}

      {wait > 0 ? (
        <Body muted small>
          {t('resendIn')} {ltr(timeLeft)}
        </Body>
      ) : (
        <TextLink label={t('resend')} onPress={resend} />
      )}
      <TextLink label={email ? t('changeEmail') : t('changeNumber')} onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  boxes: { flexDirection: 'row', direction: 'ltr', justifyContent: 'space-between', marginTop: space.md },
  box: {
    width: 48,
    height: 60,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderWidth: 2, borderColor: colors.ink },
  digit: { fontFamily: fonts.en.bold, fontSize: 24, color: colors.ink },
  hiddenInput: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.011, color: 'transparent' },
});
