// Account tab = "Your profile": who you are, your numbers, and everything that isn't a trip
// (car, emergency contact, settings). Steps still to do (photo, ID check, driver check) sit
// in their own group at the top and disappear once done; the seal by your name stays.

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import * as Updates from 'expo-updates';
import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { StatsRow } from '@/components/stats-row';
import { Body, IconCircle, ListRow, SectionTitle, TabScreen, ltr, useFont } from '@/components/ui';
import { accountSteps, type StepKey } from '@/lib/account-steps';
import type { CheckState } from '@/lib/check-status';
import { removeAvatar, setAvatar } from '@/lib/avatar';
import { sendTestCrash } from '@/lib/crash';
import { askForPhoto } from '@/lib/photo-pick';
import { formatPhone } from '@/lib/phone';
import { forgetPush } from '@/lib/push';
import { useSession, useT } from '@/lib/session';
import type { Stats } from '@/lib/stats';
import { supabase } from '@/lib/supabase';
import { useCheckStatus } from '@/lib/verification';
import type { StringKey } from '@/i18n/strings';
import { makeStyles, useTheme } from '@/theme/theme';
import { space } from '@/theme/tokens';

const STEP_TITLE: Record<StepKey, StringKey> = { photo: 'addProfilePhoto', id: 'idCheckRow', driver: 'driverCheckRow' };
const STEP_SUB: Record<StepKey, StringKey> = { photo: 'stepPhotoSub', id: 'stepIdSub', driver: 'stepDriverSub' };

/** What a step needs: why it's there, or (once sent) where it stands. Clay only when it needs you again. */
function StepSubtitle({ stepKey, state }: { stepKey: StepKey; state: CheckState }) {
  const { c: colors } = useTheme();
  const styles = useStyles();
  const { t } = useT();
  const { f } = useFont();
  const text = state === 'pending' || state === 'rejected' ? t(`checkState_${state}` as StringKey) : t(STEP_SUB[stepKey]);
  return (
    <Text style={[styles.meta, { fontFamily: f.regular }, state === 'rejected' && { color: colors.clay }]}>{text}</Text>
  );
}

type Extra = { created_at: string; emergency_name: string | null };

export default function Account() {
  const { c: colors } = useTheme();
  const styles = useStyles();
  const { t, lang } = useT();
  const { f } = useFont();
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
        .rpc('my_profile')
        .select('created_at, emergency_name')
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

  // Steps still to do; each one leaves the list once it's done.
  const steps = accountSteps({
    hasPhoto: !!avatarPath,
    id: idCheck?.state ?? null,
    driver: driverCheck?.state ?? null,
    hasCar: !!car,
  });
  function openStep(key: StepKey) {
    if (key === 'photo') editPhoto();
    else router.push({ pathname: '/verify', params: { kind: key === 'driver' ? 'driver' : 'passenger' } });
  }

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
              <Avatar path={avatarPath} name={name} seed={session?.user.id} size={72} />
              <View style={styles.cameraBadge}>
                <Icon name="camera" size={14} color={colors.onInk} />
              </View>
            </Pressable>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={styles.nameLine}>
                <Text style={[styles.name, { fontFamily: f.bold }]}>{name}</Text>
                {verified ? <Icon name="sealCheck" size={20} color={colors.statusOpen} /> : null}
              </View>
              <Text style={[styles.meta, { fontFamily: f.regular }]}>
                {since ? `${role} · ${t('memberSince')} ${since}` : role}
              </Text>
              {session?.user.phone ? (
                <Text style={[styles.meta, { fontFamily: f.regular }]}>{ltr(formatPhone(session.user.phone))}</Text>
              ) : null}
            </View>
          </View>
          {photoError ? <Body error>{photoError}</Body> : null}
          {stats ? <StatsRow stats={stats} /> : null}
        </>
      }
    >
      {steps.length > 0 ? (
        <View style={styles.steps}>
          <View style={styles.stepsHead}>
            <SectionTitle>{t('stepsTitle')}</SectionTitle>
            <Text style={[styles.meta, { fontFamily: f.regular }]}>{t('stepsLeft').replace('{n}', String(steps.length))}</Text>
          </View>
          {steps.map((step, i) => (
            <ListRow
              key={step.key}
              last={i === steps.length - 1}
              leading={<IconCircle letter={String(i + 1)} />}
              title={t(STEP_TITLE[step.key])}
              subtitle={<StepSubtitle stepKey={step.key} state={step.state} />}
              onPress={() => openStep(step.key)}
            />
          ))}
        </View>
      ) : null}
      <View>
        <ListRow
          icon="carProfile"
          title={car ? t('myCar') : t('addYourCar')}
          subtitle={car ? `${car.car_model} · ${car.car_color} · ${ltr(car.plate)}` : undefined}
          onPress={() => router.push('/car')}
        />
        {car ? (
          <ListRow icon="wallet" title={t('earningsTitle')} subtitle={t('earningsRowSub')} onPress={() => router.push('/earnings')} />
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
      {/* Which published version this is, so a phone test can be matched to a change. */}
      {/* Long-press sends a test crash report, to check Sentry receives them. */}
      <Text style={[styles.build, { fontFamily: f.regular }]} onLongPress={sendTestCrash}>
        {buildLabel()}
      </Text>
    </TabScreen>
  );
}

function buildLabel() {
  const sha = (process.env.EXPO_PUBLIC_BUILD ?? 'dev').slice(0, 7);
  const at = Updates.createdAt;
  const when = at ? ` · ${at.toISOString().slice(0, 16).replace('T', ' ')} UTC` : '';
  return `${sha}${when}`;
}

const useStyles = makeStyles((colors) => ({
  steps: { marginBottom: space.lg },
  stepsHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  build: { fontSize: 11, color: colors.inkSecondary, textAlign: 'center', marginTop: space.lg },
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
}));
