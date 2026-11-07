import { useState } from 'react';
import { View } from 'react-native';

import { Body, Button, Choice, Field, IconCircle, Label, ListRow, Screen, Title } from '@/components/ui';
import { deviceLanguage, type Gender } from '@/i18n';
import { shortName } from '@/lib/names';
import { useSession, useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/track';
import { space } from '@/theme/tokens';

export default function ProfileStep() {
  const { t } = useT();
  const { session, refreshProfile, chosenLanguage } = useSession();
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const valid = first.trim().length >= 2 && last.trim().length >= 2 && gender !== null;

  async function submit() {
    if (!valid || !session) return;
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from('profiles').insert({
      id: session.user.id,
      full_name: `${first.trim()} ${last.trim()}`,
      gender,
      language: chosenLanguage ?? deviceLanguage(),
    });
    if (err) {
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
          leading={<IconCircle letter={first.trim().charAt(0)} />}
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
      {error ? <Body error>{error}</Body> : null}
    </Screen>
  );
}
