// ID check: a passenger sends a photo of their ID before their first booking;
// a driver sends ID, licence and car photos before their first trip.
// An admin approves or rejects it (see /admin). The database enforces the rule.

import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Body, Button, IconCircle, Screen, Title, useFont } from '@/components/ui';
import type { StringKey } from '@/i18n/strings';
import { goBack } from '@/lib/nav';
import { askForPhoto, type Picked } from '@/lib/photo-pick';
import { useSession, useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { slotsFor, uploadCheckPhoto, useCheckStatus, type CheckKind, type PhotoSlot } from '@/lib/verification';
import { makeStyles, useTheme } from '@/theme/theme';
import { radii, space } from '@/theme/tokens';

const SLOT_ICON: Record<PhotoSlot, IconName> = { id: 'identificationCard', licence: 'identificationCard', car: 'car' };

export default function Verify() {
  const { c: colors } = useTheme();
  const styles = useStyles();
  const params = useLocalSearchParams<{ kind?: string }>();
  const kind: CheckKind = params.kind === 'driver' ? 'driver' : 'passenger';
  const { t } = useT();
  const { f } = useFont();
  const { session, profile, refreshProfile } = useSession();
  const { status, reload } = useCheckStatus(session?.user.id, kind);
  const [photos, setPhotos] = useState<Partial<Record<PhotoSlot, Picked>>>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ID already verified? A driver then sends only the licence and car.
  const idVerified = !!profile?.id_verified_at;
  const slots = slotsFor(kind, idVerified);
  const allPicked = slots.every((s) => photos[s]);

  // Take or choose the photo for one slot (camera/photos pop-up first on a phone).
  async function choose(slot: PhotoSlot) {
    const res = await askForPhoto({
      title: t(`slot_${slot}` as StringKey),
      labels: { take: t('takePhoto'), choose: t('choosePhoto'), cancel: t('cancel') },
    });
    if (res === 'denied') return setError(t('photoPermission'));
    if (!res) return;
    setError(null);
    setPhotos((p) => ({ ...p, [slot]: res }));
  }

  async function send() {
    if (!session || !allPicked) return;
    setSending(true);
    setError(null);
    try {
      const paths: string[] = [];
      for (const s of slots) {
        const p = photos[s]!;
        paths.push(await uploadCheckPhoto(session.user.id, s, p.base64, p.mimeType));
      }
      const { error: err } = await supabase.from('verifications').insert({ user_id: session.user.id, kind, photos: paths });
      if (err) throw err;
      setPhotos({});
      await reload();
    } catch {
      setError(t('somethingWrong'));
    } finally {
      setSending(false);
    }
  }

  async function finish() {
    await refreshProfile();
    goBack();
  }

  if (!status) return <Screen back>{null}</Screen>;

  // Already decided or waiting: a calm status page.
  if (status.state === 'approved' || status.state === 'pending') {
    const approved = status.state === 'approved';
    return (
      <Screen back footer={<Button label={t('done')} onPress={finish} />}>
        <View style={styles.statusBlock}>
          <IconCircle icon={approved ? 'sealCheck' : 'hourglass'} size={72} />
          <Title>{t(approved ? 'checkApprovedTitle' : 'checkPendingTitle')}</Title>
          <Body muted style={{ textAlign: 'center' }}>
            {approved ? t(kind === 'driver' ? 'checkApprovedDriver' : 'checkApprovedPassenger') : t('checkPendingBody')}
          </Body>
        </View>
      </Screen>
    );
  }

  const needsCar = kind === 'driver' && !status.hasCar;

  return (
    <Screen
      back
      scroll
      footer={
        needsCar ? (
          <Button label={t('addYourCar')} icon="carProfile" onPress={() => router.push('/car')} />
        ) : (
          <Button label={t('sendForReview')} onPress={send} loading={sending} disabled={!allPicked} />
        )
      }
    >
      <Title>{t(kind === 'driver' ? 'verifyDriverTitle' : 'verifyPassengerTitle')}</Title>
      <Body muted>{t(kind === 'driver' ? (idVerified ? 'verifyDriverBodyIdDone' : 'verifyDriverBody') : 'verifyPassengerBody')}</Body>

      {status.state === 'rejected' ? (
        <View style={styles.rejected}>
          <Body signal>{t('checkRejectedTitle')}</Body>
          {status.reason ? <Body>{status.reason}</Body> : null}
        </View>
      ) : null}

      {needsCar ? (
        <Body>{t('needCarFirst')}</Body>
      ) : (
        <View style={{ gap: space.md }}>
          {slots.map((slot) => {
            const p = photos[slot];
            return (
              <Pressable
                key={slot}
                accessibilityRole="button"
                accessibilityLabel={`${t(`slot_${slot}` as StringKey)}: ${p ? t('changePhoto') : t('addPhoto')}`}
                onPress={() => choose(slot)}
                style={({ pressed }) => [styles.slot, !p && styles.slotEmpty, pressed && { opacity: 0.6 }]}
              >
                {p ? (
                  <Image source={{ uri: p.uri }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty]}>
                    <Icon name={SLOT_ICON[slot]} size={26} color={colors.inkSecondary} />
                  </View>
                )}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.slotTitle, { fontFamily: f.medium }]}>
                    {t(`slot_${slot}` as StringKey)}
                  </Text>
                  <View style={[styles.slotAction, { flexDirection: 'row' }]}>
                    <Icon name={p ? 'check' : 'camera'} size={16} color={p ? colors.statusOpen : colors.inkSecondary} />
                    <Text style={[styles.slotSub, { fontFamily: f.regular }, p && { color: colors.statusOpen }]}>
                      {p ? t('changePhoto') : t('addPhoto')}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
          <View style={[styles.privacy, { flexDirection: 'row' }]}>
            <Icon name="shieldCheck" size={18} color={colors.inkSecondary} />
            <Body muted small style={{ flex: 1 }}>
              {t('photosPrivate')}
            </Body>
          </View>
        </View>
      )}

      {error ? <Body error>{error}</Body> : null}
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  statusBlock: { alignItems: 'center', gap: space.md, paddingTop: space.xl },
  rejected: { backgroundColor: colors.claySoft, borderRadius: radii.md, padding: space.md, gap: 4 },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: 10,
    borderRadius: radii.container,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  slotEmpty: { borderStyle: 'dashed', borderColor: colors.lineStrong },
  thumb: { width: 72, height: 54, borderRadius: radii.sm, backgroundColor: colors.sunken },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  slotTitle: { fontSize: 16, color: colors.ink },
  slotAction: { alignItems: 'center', gap: 6 },
  slotSub: { fontSize: 14, color: colors.inkSecondary },
  privacy: { alignItems: 'center', gap: space.sm, marginTop: space.xs },
}));
