// Emergency contact: one person who can be sent your trip link (Share my trip and
// the Emergency button use it, slice 12). Stored on your profile row.

import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Body, Button, Field, Screen, TextLink, Title } from '@/components/ui';
import { goBack } from '@/lib/nav';
import { formatPhone, normalizeContactPhone } from '@/lib/phone';
import { useSession, useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { space } from '@/theme/tokens';

export default function Emergency() {
  const { t } = useT();
  const { session } = useSession();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [hasOne, setHasOne] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!session) return;
    supabase
      .rpc('my_profile')
      .select('emergency_name, emergency_phone')
      .maybeSingle()
      .then(({ data }) => {
        if (!data?.emergency_phone) return;
        setName(data.emergency_name ?? '');
        setPhone(formatPhone(data.emergency_phone));
        setHasOne(true);
      });
  }, [session]);

  async function save() {
    if (!session) return;
    const cleanName = name.trim();
    const normalized = normalizeContactPhone(phone);
    if (cleanName.length < 2) return setError(t('emergencyBadName'));
    if (!normalized) return setError(t('emergencyBadPhone'));
    setSaving(true);
    setError(null);
    const { error: err } = await supabase
      .from('profiles')
      .update({ emergency_name: cleanName, emergency_phone: normalized })
      .eq('id', session.user.id);
    setSaving(false);
    if (err) return setError(t('somethingWrong'));
    goBack();
  }

  async function remove() {
    if (!session) return;
    setSaving(true);
    // Auto-share has no one to share with any more, so it goes off too.
    const { error: err } = await supabase
      .from('profiles')
      .update({ emergency_name: null, emergency_phone: null, auto_share: false })
      .eq('id', session.user.id);
    setSaving(false);
    if (err) return setError(t('somethingWrong'));
    goBack();
  }

  return (
    <Screen
      back
      scroll
      footer={
        <>
          <Button label={t('save')} onPress={save} loading={saving} disabled={!name.trim() || !phone.trim()} />
          {hasOne ? <TextLink label={t('emergencyRemove')} onPress={remove} disabled={saving} /> : null}
        </>
      }
    >
      <Title>{t('emergencyTitle')}</Title>
      <Body muted>{t('emergencyIntro')}</Body>
      <View style={{ gap: space.md }}>
        <Field
          label={t('emergencyName')}
          placeholder={t('emergencyNameHint')}
          value={name}
          onChangeText={setName}
          maxLength={60}
          autoCapitalize="words"
          textContentType="name"
        />
        <Field
          label={t('emergencyPhone')}
          placeholder="059 123 4567"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          ltr
        />
      </View>
      {error ? <Body error>{error}</Body> : null}
    </Screen>
  );
}
