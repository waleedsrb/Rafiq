// Settings: language, which pushes you get, your emergency contact, and deleting
// your account. Switches save straight away (no Save button), like iOS Settings.
//
// Only settings that already do something are shown. Later slices add their rows
// here: checkpoint alerts and ride alerts (slices 14-15), auto-share (slice 12).

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Switch, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Body, Label, ListRow, Screen, Title, useFont } from '@/components/ui';
import { deleteMyAccount } from '@/lib/account';
import { confirm } from '@/lib/dialog';
import { useSession, useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { colors, space } from '@/theme/tokens';

type Prefs = {
  notify_trips: boolean;
  notify_alerts: boolean;
  notify_checkpoints: boolean;
  ask_near_checkpoints: boolean;
  emergency_name: string | null;
};

export default function Settings() {
  const { t, lang } = useT();
  const { f, rtl } = useFont();
  const { session, refreshProfile } = useSession();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      supabase
        .from('profiles')
        .select('notify_trips, notify_alerts, notify_checkpoints, ask_near_checkpoints, emergency_name')
        .eq('id', session.user.id)
        .maybeSingle()
        .then(({ data }) => setPrefs((data as Prefs | null) ?? null));
    }, [session]),
  );

  async function setSwitch(key: 'notify_trips' | 'notify_alerts' | 'notify_checkpoints' | 'ask_near_checkpoints', value: boolean) {
    if (!session || !prefs) return;
    setPrefs({ ...prefs, [key]: value }); // feels instant; put it back if saving fails
    const { error: err } = await supabase.from('profiles').update({ [key]: value }).eq('id', session.user.id);
    if (err) {
      setPrefs({ ...prefs, [key]: !value });
      setError(t('somethingWrong'));
    }
  }

  async function switchLanguage() {
    if (!session) return;
    await supabase.from('profiles').update({ language: lang === 'ar' ? 'en' : 'ar' }).eq('id', session.user.id);
    await refreshProfile();
  }

  async function deleteAccount() {
    if (!session) return;
    const sure = await confirm({ title: t('deleteAccountQ'), body: t('deleteAccountBody'), yes: t('deleteAccountYes'), no: t('keepAccount'), tone: 'danger' });
    if (!sure) return;
    setDeleting(true);
    setError(null);
    const { ok, midTrip } = await deleteMyAccount(session.user.id);
    // On success the sign-in is gone: the guards in _layout.tsx take you to the intro.
    if (!ok) {
      setDeleting(false);
      setError(midTrip ? t('finishTripFirst') : t('somethingWrong'));
    }
  }

  const toggle = (value: boolean, onChange: (v: boolean) => void, label: string) => (
    <Switch
      value={value}
      onValueChange={onChange}
      accessibilityLabel={label}
      trackColor={{ true: colors.ink, false: colors.lineStrong }}
      thumbColor={colors.onInk}
      ios_backgroundColor={colors.lineStrong}
    />
  );

  return (
    <Screen back scroll>
      <Title>{t('settingsTitle')}</Title>

      <View>
        <ListRow last icon="globe" title={t('languageRow')} subtitle={t('languageName')} onPress={switchLanguage} />
      </View>

      <View style={{ gap: space.xs }}>
        <Label>{t('notificationsSection')}</Label>
        <ListRow
          icon="ticket"
          title={t('notifyTrips')}
          subtitle={t('notifyTripsNote')}
          trailing={prefs ? toggle(prefs.notify_trips, (v) => setSwitch('notify_trips', v), t('notifyTrips')) : undefined}
        />
        <ListRow
          icon="bell"
          title={t('notifyAlerts')}
          subtitle={t('notifyAlertsNote')}
          trailing={prefs ? toggle(prefs.notify_alerts, (v) => setSwitch('notify_alerts', v), t('notifyAlerts')) : undefined}
        />
        <ListRow
          icon="barricade"
          title={t('notifyCheckpoints')}
          subtitle={t('notifyCheckpointsNote')}
          trailing={prefs ? toggle(prefs.notify_checkpoints, (v) => setSwitch('notify_checkpoints', v), t('notifyCheckpoints')) : undefined}
        />
        <ListRow
          last
          icon="mapPin"
          title={t('askNearCheckpoints')}
          subtitle={t('askNearCheckpointsNote')}
          trailing={prefs ? toggle(prefs.ask_near_checkpoints, (v) => setSwitch('ask_near_checkpoints', v), t('askNearCheckpoints')) : undefined}
        />
      </View>

      <View style={{ gap: space.xs }}>
        <Label>{t('safetySection')}</Label>
        <ListRow
          icon="shieldCheck"
          title={t('emergencyContact')}
          subtitle={prefs?.emergency_name ?? t('emergencyNone')}
          onPress={() => router.push('/emergency')}
        />
        <ListRow
          last
          leading={
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.sunken, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="x" size={20} color={colors.statusClosed} />
            </View>
          }
          title={
            <Text style={{ fontSize: 16, lineHeight: 22, color: colors.statusClosed, fontFamily: f.medium, textAlign: rtl ? 'right' : 'left' }}>
              {t('deleteAccount')}
            </Text>
          }
          trailing={deleting ? <Body muted small>…</Body> : <View />}
          onPress={deleting ? undefined : deleteAccount}
        />
      </View>

      {error ? <Body error>{error}</Body> : null}
    </Screen>
  );
}
