import { useState } from 'react';
import { View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Body, Button, Choice, Field, Label, ListRow, Screen, Title } from '@/components/ui';
import { deviceLanguage, type Gender } from '@/i18n';
import { shortName } from '@/lib/names';
import { normalizePhone } from '@/lib/phone';
import { useSession, useT } from '@/lib/session';
import { providerNames } from '@/lib/sign-in';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/track';
import { space } from '@/theme/tokens';

export default function ProfileStep() {
  const { t } = useT();
  const { session, refreshProfile, chosenLanguage } = useSession();
  // Google (and Apple, the first time) already told us the name: start from it.
  const given = providerNames(session?.user.user_metadata);
  const [first, setFirst] = useState(given.first);
  const [last, setLast] = useState(given.last);
  // Email, Apple and Google accounts have no phone number yet, but the driver and
  // passenger must be able to call each other once a seat is accepted.
  const needsPhone = !session?.user.phone;
  const [rawPhone, setRawPhone] = useState('');
  const typedPhone = rawPhone.trim();
  const phone = normalizePhone(
    typedPhone.startsWith('+') || typedPhone.startsWith('00') ? typedPhone : `+970${typedPhone.replace(/^0/, '')}`,
  );
  const [gender, setGender] = useState<Gender | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const valid = first.trim().length >= 2 && last.trim().length >= 2 && gender !== null && (!needsPhone || !!typedPhone);

  async function submit() {
    if (!valid || !session) return;
    if (needsPhone && !phone) {
      setError(t('phoneInvalid'));
      return;
    }
    setSaving(true);
    setError(null);
    // Upsert, so pressing Continue again after a failed phone save still works.
    const { error: err } = await supabase.from('profiles').upsert({
      id: session.user.id,
      full_name: `${first.trim()} ${last.trim()}`,
      gender,
      language: chosenLanguage ?? deviceLanguage(),
    });
    // Stored like Supabase stores sign-in phones: digits only (970591234567).
    const { error: phoneErr } =
      err || !needsPhone || !phone
        ? { error: null }
        : await supabase.from('contact_phones').upsert({ user_id: session.user.id, phone: phone.slice(1) });
    if (err || phoneErr) {
      setSaving(false);
      setError(t('somethingWrong'));
      return;
    }
    track('signup_profile_completed');
    await refreshProfile(); // the guard in _layout.tsx now sends them home
  }

  return (
    <Screen scroll footer={<Button label={t('continue')} onPress={submit} loading={saving} disabled={!valid} />}>
      <Title>{t('nameTitle')}</Title>
      <Body muted>{t('nameHint')}</Body>
      <View style={{ gap: space.md, marginTop: space.md }}>
        <Field
          label={t('firstName')}
          autoFocus
          value={first}
          onChangeText={setFirst}
          textContentType="givenName"
          autoComplete="name-given"
          maxLength={40}
        />
        <Field
          label={t('lastName')}
          value={last}
          onChangeText={setLast}
          textContentType="familyName"
          autoComplete="name-family"
          maxLength={40}
        />
      </View>
      {first.trim() ? (
        <ListRow
          last
          leading={<Avatar name={first} seed={session?.user.id} />}
          title={shortName(`${first} ${last}`)}
          subtitle={t('namePreviewHint')}
        />
      ) : null}
      <View style={{ gap: space.sm }}>
        <Label>{t('genderLabel')}</Label>
        <Choice
          value={gender}
          onChange={setGender}
          options={[
            { value: 'm', label: t('genderM') },
            { value: 'f', label: t('genderF') },
          ]}
        />
      </View>
      {needsPhone ? (
        <View style={{ gap: space.xs }}>
          <Field
            label={t('reachPhoneLabel')}
            ltr
            prefix="+970"
            value={rawPhone}
            onChangeText={(v) => {
              setRawPhone(v);
              setError(null);
            }}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            placeholder={t('phonePlaceholder')}
          />
          <Body muted small>
            {t('reachPhoneHint')}
          </Body>
        </View>
      ) : null}
      {error ? <Body error>{error}</Body> : null}
    </Screen>
  );
}
