// Emergency contact: one person who can be sent your trip link (Share my trip and
// the Emergency button use it, slice 12). Stored on your profile row.

import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Body, Button, Field, Screen, TextLink, Title } from '@/components/ui';
import { goBack } from '@/lib/nav';
import { formatPhone, normalizeContactPhone } from '@/lib/phone';
import { useSession, useT } from '@/lib/session';
import { detailsQuery, type MyDetails } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import { useCached } from '@/lib/use-cached';
import { space } from '@/theme/tokens';

export default function Emergency() {
  const { t } = useT();
  const { session } = useSession();
  // Account already loaded these, so the form opens filled in (src/lib/cache.ts).
  const details = useCached(session ? detailsQuery(session.user.id) : null);
  const saved = details.data;
  const [name, setName] = useState(saved?.emergency_phone ? (saved.emergency_name ?? '') : '');
  const [phone, setPhone] = useState(saved?.emergency_phone ? formatPhone(saved.emergency_phone) : '');
  const hasOne = !!saved?.emergency_phone;
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Opened before that answer came? Fill in once it lands, unless you've started typing.
  const filled = useRef(saved !== undefined);
  useEffect(() => {
    if (filled.current || saved === undefined) return;
    filled.current = true;
    if (!saved?.emergency_phone || name || phone) return;
    setName(saved.emergency_name ?? '');
    setPhone(formatPhone(saved.emergency_phone));
  }, [saved]); // eslint-disable-line react-hooks/exhaustive-deps

  // After a save, Account and Settings show the new name straight away.
  const remember = (patch: Partial<MyDetails>) => details.set((old) => (old ? { ...old, ...patch } : old) as MyDetails | null);

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
    remember({ emergency_name: cleanName, emergency_phone: normalized });
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
    remember({ emergency_name: null, emergency_phone: null });
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
