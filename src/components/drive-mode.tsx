// Drive mode: what the driver sees once the trip has started.
// Big text, few buttons, light or dark (sun/moon button; it starts dark after sunset).
//
// - Top: the next checkpoint, its status and how far it is. A closed one turns the banner
//   red, the only red on this screen, with "Going around it" under it (one tap takes it off
//   the way and tells the riders). Past the last
//   checkpoint it shows the drop-off.
// - Bottom: about when you'll arrive, who's on board, the light/dark switch, Share and
//   Emergency, and "slide when you arrive" (a slide, so a bump in the road can't end the trip).
//
// The map behind is the trip's route with the car on it (src/components/route-map.tsx).

import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { STATUS_LOOK, useAgo } from '@/components/checkpoint-badge';
import { Icon, type IconName } from '@/components/icon';
import { RouteMap, type MapCheckpoint } from '@/components/route-map';
import { SlideToConfirm } from '@/components/slide-to-confirm';
import { ltr, useFont } from '@/components/ui';
import { arrivalAt, distanceParts, nextOnRoad } from '@/lib/drive';
import { clock } from '@/lib/format';
import { distanceM } from '@/lib/pickup';
import { centreName, centrePoint, placeName, type LatLng } from '@/lib/places';
import { useT } from '@/lib/session';
import type { City } from '@/lib/trip-form';
import { useScreenCorners } from '@/theme/screen-corners';
import { colors, fonts, space } from '@/theme/tokens';

export type Rider = { id: string; name: string; avatarPath: string | null; seed: string };

/** Dark after sunset and before dawn, roughly; the driver can switch it either way. */
export function nightNow(d = new Date()) {
  const h = d.getHours();
  return h >= 18 || h < 6;
}

type Look = { ink: string; sub: string; panel: string; line: string; button: string; blur: 'light' | 'dark' };

const DAY: Look = {
  ink: colors.ink,
  sub: colors.inkSecondary,
  panel: 'rgba(247,246,243,0.86)',
  line: colors.hairline,
  button: 'rgba(23,25,28,0.06)',
  blur: 'light',
};
const NIGHT: Look = {
  ink: '#F4F3EF',
  sub: '#9A9DA2',
  panel: 'rgba(23,25,28,0.88)',
  line: 'rgba(255,255,255,0.10)',
  button: 'rgba(255,255,255,0.10)',
  blur: 'dark',
};

export function DriveMode({
  origin,
  destination,
  pickup,
  checkpoints,
  onGoAround,
  goingAround,
  startedAt,
  car,
  riders,
  dark,
  onToggleDark,
  onArrive,
  arriving,
  onShare,
  onEmergency,
  onLeave,
}: {
  origin: City;
  destination: City;
  pickup: LatLng | null;
  /** The trip's checkpoints in driving order, kept fresh by the screen. */
  checkpoints: MapCheckpoint[];
  /** Going around a closed checkpoint ahead: take it off the way (riders are told). */
  onGoAround: (checkpointId: string) => void;
  goingAround: boolean;
  startedAt: string;
  car: LatLng | null;
  riders: Rider[];
  dark: boolean;
  onToggleDark: () => void;
  onArrive: () => void;
  arriving: boolean;
  onShare: () => void;
  onEmergency: () => void;
  onLeave: () => void;
}) {
  const { t, lang } = useT();
  const { f, rtl, direction } = useFont();
  const insets = useSafeAreaInsets();
  const corners = useScreenCorners();
  const { height: H } = useWindowDimensions();
  const reduced = useReducedMotion();
  const ago = useAgo();
  const c = dark ? NIGHT : DAY;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // The trip's checkpoints, in driving order.
  const road = checkpoints;
  const start = pickup ?? centrePoint(origin);
  const dest = centrePoint(destination);
  const next = nextOnRoad(road, car, dest);
  const eta = arrivalAt(now, car, start, dest, new Date(startedAt));
  const etaClock = clock(eta);

  // The banner: the next checkpoint, or the drop-off once they're all behind you.
  const cp = next?.point ?? null;
  const closed = cp?.status === 'closed';
  const meters = cp ? next!.meters : car ? distanceM(car, dest) : null;
  const dist = meters !== null ? distanceParts(meters) : null;
  const bannerIcon: IconName = cp ? (cp.status === 'open' ? 'check' : cp.status ? 'warning' : 'barricade') : 'mapPin';
  const bannerTitle = cp ? (cp.status ? `${cp.name} · ${t(STATUS_LOOK[cp.status].word)}` : cp.name) : `${placeName(destination, lang)} · ${centreName(destination, lang)}`;
  const bannerSub = cp
    ? `${t('nextCheckpoint')} · ${cp.reportedAt ? ago(cp.reportedAt, now) : t('noRecentReport')}`
    : t('destinationPoint');
  const bannerInk = closed ? '#FFFFFF' : c.ink;
  const bannerSubInk = closed ? 'rgba(255,255,255,0.8)' : c.sub;
  const statusTint = cp?.status && !closed ? STATUS_LOOK[cp.status].color : bannerInk;

  const panelH = 250 + insets.bottom;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: dark ? '#17191C' : colors.surface }]} entering={reduced ? undefined : FadeIn.duration(320)}>
      <RouteMap
        origin={origin}
        destination={destination}
        start={pickup ?? undefined}
        car={car}
        dark={dark}
        checkpoints={road}
        height={H}
        topInset={insets.top + 110}
        bottomInset={panelH}
        interactive
      />

      {/* Top: leave drive mode, and the next checkpoint. */}
      <View style={[styles.top, { top: insets.top + 6, direction }]}>
        <RoundButton icon="x" label={t('leaveDriveMode')} onPress={onLeave} c={c} />
        <View style={[styles.banner, { backgroundColor: closed ? colors.statusClosed : c.panel }]}>
          {closed ? null : <BlurView intensity={40} tint={c.blur} style={[StyleSheet.absoluteFill, styles.round]} />}
          <View style={[styles.bannerIcon, { backgroundColor: closed ? 'rgba(255,255,255,0.2)' : c.button }]}>
            <Icon name={bannerIcon} size={22} color={closed ? '#FFFFFF' : statusTint} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text numberOfLines={1} style={[styles.bannerTitle, { fontFamily: f.bold, color: bannerInk }]}>
              {bannerTitle}
            </Text>
            <Text numberOfLines={1} style={[styles.bannerSub, { fontFamily: f.regular, color: bannerSubInk }]}>
              {bannerSub}
            </Text>
          </View>
          {dist ? (
            <Text style={[styles.dist, { color: bannerInk }]}>
              {ltr(dist.n)}
              <Text style={[styles.unit, { fontFamily: f.regular, color: bannerSubInk }]}> {t(dist.unit === 'km' ? 'kmUnit' : 'mUnit')}</Text>
            </Text>
          ) : null}
        </View>
      </View>
      {/* A closed checkpoint ahead: going around it? Change the way, so the riders know. */}
      {closed && cp ? (
        <View style={[styles.wayRow, { top: insets.top + 6 + 72 + 8, direction }]} pointerEvents="box-none">
          <Pressable
            accessibilityRole="button"
            onPress={() => onGoAround(cp.id)}
            disabled={goingAround}
            style={({ pressed }) => [styles.wayButton, { backgroundColor: c.panel }, pressed && { opacity: 0.7 }]}
          >
            <BlurView intensity={40} tint={c.blur} style={[StyleSheet.absoluteFill, { borderRadius: 22 }]} />
            <Icon name="barricade" size={18} color={c.ink} />
            <Text style={[styles.panelButtonText, { fontFamily: f.medium, color: c.ink }]}>{t('goingAroundName').replace('{name}', cp.name)}</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Bottom: arrival, riders, and the few things you can do while driving. */}
      {/* Floats a few points in from the sides and bottom, its corners concentric with the
          screen's, so the slider's round ends sit parallel to the phone's corners. */}
      <View
        style={[
          styles.panel,
          {
            left: corners.inset,
            right: corners.inset,
            bottom: corners.inset,
            borderRadius: corners.card,
            paddingBottom: Math.max(space.screen, insets.bottom - corners.inset),
            backgroundColor: c.panel,
            direction,
          },
        ]}
      >
        <BlurView intensity={50} tint={c.blur} style={[StyleSheet.absoluteFill, { borderRadius: corners.card }]} />
        <View style={styles.statsRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.eta, { color: c.ink }]}>
              {etaClock.time}
              <Text style={[styles.unit, { fontFamily: f.regular, color: c.sub }]}> {etaClock.pm ? t('pm') : t('am')}</Text>
            </Text>
            <Text style={[styles.etaLabel, { fontFamily: f.regular, color: c.sub }]}>{t('expectedArrival')}</Text>
          </View>
          <View style={styles.faces} accessibilityLabel={riders.map((r) => r.name).join(', ')}>
            {riders.slice(0, 4).map((r, i) => (
              <View key={r.id} style={[styles.face, { borderColor: dark ? '#17191C' : colors.surface }, i > 0 && (rtl ? { marginRight: -10 } : { marginLeft: -10 })]}>
                <Avatar path={r.avatarPath} name={r.name} seed={r.seed} size={36} />
              </View>
            ))}
          </View>
          <RoundButton icon={dark ? 'sun' : 'moon'} label={t(dark ? 'lightMode' : 'darkMode')} onPress={onToggleDark} c={c} />
        </View>
        <View style={styles.twoButtons}>
          <PanelButton icon="shareNetwork" label={t('shareShort')} onPress={onShare} c={c} />
          <PanelButton icon="warning" label={t('emergencyButton')} onPress={onEmergency} c={c} />
        </View>
        <SlideToConfirm label={t('slideToArrive')} onConfirm={onArrive} loading={arriving} dark={dark} />
      </View>
    </Animated.View>
  );
}

function RoundButton({ icon, label, onPress, c }: { icon: IconName; label: string; onPress: () => void; c: Look }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.roundButton, { backgroundColor: c.panel }, pressed && { opacity: 0.7 }]}
    >
      <BlurView intensity={40} tint={c.blur} style={[StyleSheet.absoluteFill, { borderRadius: 24 }]} />
      <Icon name={icon} size={22} color={c.ink} />
    </Pressable>
  );
}

function PanelButton({ icon, label, onPress, c }: { icon: IconName; label: string; onPress: () => void; c: Look }) {
  const { f } = useFont();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.panelButton, { backgroundColor: c.button }, pressed && { opacity: 0.7 }]}
    >
      <Icon name={icon} size={20} color={c.ink} />
      <Text numberOfLines={1} style={[styles.panelButtonText, { fontFamily: f.medium, color: c.ink }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: space.md, right: space.md, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  round: { borderRadius: 24 },
  wayRow: { position: 'absolute', left: space.md, right: space.md, flexDirection: 'row', justifyContent: 'center' },
  wayButton: { height: 44, borderRadius: 22, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 8, overflow: 'hidden' },
  banner: {
    flex: 1,
    minHeight: 72,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    overflow: 'hidden',
  },
  bannerIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  bannerTitle: { fontSize: 18, lineHeight: 24 },
  bannerSub: { fontSize: 13, lineHeight: 18 },
  dist: { fontFamily: fonts.en.bold, fontSize: 24 },
  unit: { fontSize: 14 },
  panel: {
    position: 'absolute',
    paddingTop: space.screen,
    paddingHorizontal: space.screen,
    gap: 14,
    overflow: 'hidden',
  },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  eta: { fontFamily: fonts.en.bold, fontSize: 40, lineHeight: 46, letterSpacing: -1 },
  etaLabel: { fontSize: 14 },
  faces: { flexDirection: 'row' },
  face: { borderWidth: 2, borderRadius: 20 },
  roundButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  twoButtons: { flexDirection: 'row', gap: space.sm },
  panelButton: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  panelButtonText: { fontSize: 15 },
});
