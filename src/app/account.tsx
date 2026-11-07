// Account: who you are, your language, your car (for drivers), sign out.

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { Dock, IconCircle, ListRow, Screen, SectionTitle, Title, ltr } from '@/components/ui';
import { formatPhone } from '@/lib/phone';
import { forgetPush } from '@/lib/push';
import { useSession, useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { useCheckStatus } from '@/lib/verification';
import type { StringKey } from '@/i18n/strings';

export default function Account() {
  const { t, lang } = useT();
  const { profile, session, refreshProfile } = useSession();
  const [car, setCar] = useState<{ car_model: string; car_color: string } | null>(null);
  const idCheck = useCheckStatus(session?.user.id, 'passenger').status;
  const driverCheck = useCheckStatus(session?.user.id, 'driver').status;

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      supabase
        .from('driver_details')
        .select('car_model, car_color')
        .eq('driver_id', session.user.id)
        .maybeSingle()
        .then(({ data }) => setCar(data ?? null));
    }, [session]),
  );

  async function switchLanguage() {
    if (!session) return;
    await supabase.from('profiles').update({ language: lang === 'ar' ? 'en' : 'ar' }).eq('id', session.user.id);
    await refreshProfile();
  }

  const name = profile?.full_name ?? '';

  return (
    <Screen scroll overlay={<Dock current="profile" />} contentStyle={{ paddingTop: 72 }}>
      <Title>{t('accountTitle')}</Title>
      <ListRow
        last
        leading={<IconCircle letter={name.charAt(0)} size={56} />}
        title={name}
        subtitle={session?.user.phone ? ltr(formatPhone(session.user.phone)) : undefined}
      />

      <View>
        <ListRow icon="globe" title={t('languageRow')} subtitle={t('languageName')} onPress={switchLanguage} />
        <ListRow
          icon="identificationCard"
          title={t('idCheckRow')}
          subtitle={idCheck ? t(`checkState_${idCheck.state}` as StringKey) : undefined}
          onPress={() => router.push({ pathname: '/verify', params: { kind: 'passenger' } })}
        />
        <SectionTitle>{t('forDrivers')}</SectionTitle>
        <ListRow
          icon="carProfile"
          title={car ? t('yourCar') : t('addYourCar')}
          subtitle={car ? `${car.car_model} · ${car.car_color}` : undefined}
          onPress={() => router.push('/car')}
        />
        {car ? (
          <ListRow
            icon="sealCheck"
            title={t('driverCheckRow')}
            subtitle={driverCheck ? t(`checkState_${driverCheck.state}` as StringKey) : undefined}
            onPress={() => router.push({ pathname: '/verify', params: { kind: 'driver' } })}
          />
        ) : null}
        <ListRow
          last
          icon="signOut"
          title={t('signOut')}
          onPress={async () => {
            await forgetPush();
            await supabase.auth.signOut();
          }}
        />
      </View>
    </Screen>
  );
}
