import { useState } from 'react';

import { Body, Button, Choice, Field, Screen, Title } from '@/components/ui';
import { deviceLanguage, type Gender } from '@/i18n';
import { useSession, useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/track';

export default function ProfileStep() {
  const { t } = useT();
  const { session, refreshProfile } = useSession();
  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const valid = name.trim().length >= 2 && gender !== null;

  async function submit() {
    if (!valid || !session) return;
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from('profiles').insert({
      id: session.user.id,
      full_name: name.trim(),
      gender,
      language: deviceLanguage(),
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
    <Screen footer={<Button label={t('continue')} onPress={submit} loading={saving} disabled={!valid} />}>
      <Title>{t('nameTitle')}</Title>
      <Body muted>{t('nameHint')}</Body>
      <Field
        autoFocus
        value={name}
        onChangeText={setName}
        placeholder={t('namePlaceholder')}
        textContentType="name"
        autoComplete="name"
        maxLength={80}
      />
      <Body>{t('genderLabel')}</Body>
      <Choice
        value={gender}
        onChange={setGender}
        options={[
          { value: 'm', label: t('genderM') },
          { value: 'f', label: t('genderF') },
        ]}
      />
      {error ? <Body error>{error}</Body> : null}
    </Screen>
  );
}
