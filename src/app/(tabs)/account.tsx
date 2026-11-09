// Account tab = "Your profile": who you are, your numbers, and everything that isn't a trip
// (ID check, car, emergency contact, settings).

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { StatsRow } from '@/components/stats-row';
import { Body, ListRow, TabScreen, ltr, useFont } from '@/components/ui';
import { removeAvatar, setAvatar } from '@/lib/avatar';
import { askForPhoto } from '@/lib/photo-pick';
import { formatPhone } from '@/lib/phone';
import { forgetPush } from '@/lib/push';
import { useSession, useT } from '@/lib/session';
import type { Stats } from '@/lib/stats';
import { supabase } from '@/lib/supabase';
import { useCheckStatus } from '@/lib/verification';
import type { StringKey } from '@/i18n/strings';
import { colors, space } from '@/theme/tokens';

type Extra = { created_at: string; emergency_name: string | null };

export default function Account() {
  const { t, lang } = useT();
  const { f, rtl } = useFont();
  const { profile, session, refreshProfile } = useSession();
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [car, setCar] = useState<{ car_model: string; car_color: string; plate: string } | null>(null);
  const [extra, setExtra] = useState<Extra | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const idCheck = useCheckStatus(session?.user.id, 'passenger').status;
  const driverCheck = useCheckStatus(session?.user.id, 'driver').status;

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      const me = session.user.id;
      supabase
        .from('driver_details')
        .select('car_model, car_color, plate')
        .eq('driver_id', me)
        .maybeSingle()
        .then(({ data }) => setCar(data ?? null));
      supabase
        .from('profiles')
        .select('created_at, emergency_name')
        .eq('id', me)
        .maybeSingle()
        .then(({ data }) => setExtra((data as Extra | null) ?? null));
      // Trips, reliability and rating (trip day, slice 9).
      supabase.rpc('person_stats', { p_person: me }).then(({ data, error }) => {
        const row = Array.isArray(data) ? data[0] : data;
        setStats(error || !row ? null : (row as Stats));
      });
    }, [session]),
  );

  const name = profile?.full_name ?? '';
  const avatarPath = profile?.avatar_path ?? null;

  // Add, change or remove the profile photo.
  async function editPhoto() {
    if (!session || photoBusy) return;
    const res = await askForPhoto({
      title: t(avatarPath ? 'profilePhoto' : 'addProfilePhoto'),
      labels: { take: t('takePhoto'), choose: t('choosePhoto'), cancel: t('cancel') },
      square: true,
      extra: avatarPath ? [{ label: t('removePhoto'), value: 'remove' as const, icon: 'x' }] : [],
    });
    if (res === 'denied') return setPhotoError(t('photoPermission'));
    if (!res) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      if (res === 'remove') await removeAvatar(session.user.id, avatarPath!);
      else await setAvatar(session.user.id, res, avatarPath);
      await refreshProfile();
    } catch {
      setPhotoError(t('somethingWrong'));
    } finally {
      setPhotoBusy(false);
    }
  }
  const verified = !!profile?.id_verified_at;
  const since = extra
    ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB', { month: 'long', year: 'numeric' }).format(
        new Date(extra.created_at),
      )
    : null;
  const role = car ? t('rolePassengerDriver') : t('rolePassenger');
  const align = { textAlign: rtl ? ('right' as const) : ('left' as const) };

  return (
    <TabScreen
      title={t('yourProfile')}
      // Who you are stays put; only the rows from "My car" down scroll.
      fixed={
        <>
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(avatarPath ? 'profilePhoto' : 'addProfilePhoto')}
              onPress={editPhoto}
              style={{ opacity: photoBusy ? 0.5 : 1 }}
            >
              <Avatar path={avatarPath} name={name} size={72} />
              <View style={styles.cameraBadge}>
                <Icon name="camera" size={14} color={colors.onInk} />
              </View>
            </Pressable>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={styles.nameLine}>
                <Text style={[styles.name, { fontFamily: f.bold }, align]}>{name}</Text>
                {verified ? <Icon name="sealCheck" size={20} color={colors.statusOpen} /> : null}
              </View>
              <Text style={[styles.meta, { fontFamily: f.regular }, align]}>
                {since ? `${role} · ${t('memberSince')} ${since}` : role}
              </Text>
              {session?.user.phone ? (
                <Text style={[styles.meta, { fontFamily: f.regular }, align]}>{ltr(formatPhone(session.user.phone))}</Text>
              ) : null}
            </View>
          </View>
          {photoError ? <Body error>{photoError}</Body> : null}
          {stats ? <StatsRow stats={stats} /> : null}
        </>
      }
    >
      <View>
        {avatarPath ? null : (
          <ListRow icon="camera" title={t('addProfilePhoto')} subtitle={t('profilePhotoWhy')} onPress={editPhoto} />
        )}
        <ListRow
          icon="carProfile"
          title={car ? t('myCar') : t('addYourCar')}
          subtitle={car ? `${car.car_model} · ${car.car_color} · ${ltr(car.plate)}` : undefined}
          onPress={() => router.push('/car')}
        />
        <ListRow
          icon="identificationCard"
          title={t('idCheckRow')}
          subtitle={idCheck ? t(`checkState_${idCheck.state}` as StringKey) : undefined}
          onPress={() => router.push({ pathname: '/verify', params: { kind: 'passenger' } })}
        />
        {car ? (
          <ListRow icon="wallet" title={t('earningsTitle')} subtitle={t('earningsRowSub')} onPress={() => router.push('/earnings')} />
        ) : null}
        {car ? (
          <ListRow
            icon="sealCheck"
            title={t('driverCheckRow')}
            subtitle={driverCheck ? t(`checkState_${driverCheck.state}` as StringKey) : undefined}
            onPress={() => router.push({ pathname: '/verify', params: { kind: 'driver' } })}
          />
        ) : null}
        <ListRow
          icon="shieldCheck"
          title={t('emergencyContact')}
          subtitle={extra?.emergency_name ?? t('emergencyNone')}
          onPress={() => router.push('/emergency')}
        />
        <ListRow icon="gear" title={t('settingsTitle')} subtitle={t('settingsSubtitle')} onPress={() => router.push('/settings')} />
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
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 20, lineHeight: 26, color: colors.ink, flexShrink: 1 },
  meta: { fontSize: 13, lineHeight: 18, color: colors.inkSecondary },
  cameraBadge: {
    position: 'absolute',
    bottom: -2,
    end: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.ink,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
