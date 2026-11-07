// The map at the top of trip screens: the road from one city to the other,
// with every checkpoint on it in its current status colour.
// Real map (react-native-maps): Apple Maps on iPhone, Google Maps on Android.
// Google takes our quiet "graphite" style; Apple Maps can't be restyled, so iPhone
// gets its muted standard map instead.

import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, type MapStyleElement } from 'react-native-maps';

import { STATUS_LOOK } from '@/components/checkpoint-badge';
import { GlassButton, useFont } from '@/components/ui';
import type { CheckpointStatus } from '@/lib/checkpoints';
import { CITY_POINT, type LatLng } from '@/lib/places';
import { useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import type { City } from '@/lib/trip-form';
import { colors, radii, space } from '@/theme/tokens';

export type MapCheckpoint = LatLng & { id: string; name: string; status: CheckpointStatus | null; order: number };

/** Checkpoints with their place and current status, in road order (Ramallah first). */
export function useMapCheckpoints() {
  const { lang } = useT();
  const [rows, setRows] = useState<MapCheckpoint[]>([]);
  useEffect(() => {
    Promise.all([
      supabase.from('checkpoints').select('id, name_ar, name_en, road_order, lat, lng'),
      supabase.rpc('checkpoint_overview'),
    ]).then(([places, overview]) => {
      const status = new Map(
        ((overview.data as { id: string; status: CheckpointStatus | null }[] | null) ?? []).map((o) => [o.id, o.status]),
      );
      const list = ((places.data as
        | { id: string; name_ar: string; name_en: string; road_order: number; lat: number | null; lng: number | null }[]
        | null) ?? [])
        .filter((p) => p.lat !== null && p.lng !== null)
        .map((p) => ({
          id: p.id,
          name: lang === 'ar' ? p.name_ar : p.name_en,
          order: p.road_order,
          latitude: Number(p.lat),
          longitude: Number(p.lng),
          status: status.get(p.id) ?? null,
        }))
        .sort((a, b) => a.order - b.order);
      setRows(list);
    });
  }, [lang]);
  return rows;
}

export function RouteMap({
  origin,
  destination,
  height = 300,
  topInset = 0,
  labels,
  interactive,
  onExpand,
}: {
  /** Pan and zoom (the full-screen map). */
  interactive?: boolean;
  /** Tap the map (or its expand button) to open it full screen. */
  onExpand?: () => void;
  /** Show each checkpoint's name and status under its dot (the full-screen map). */
  labels?: boolean;
  origin: City;
  destination: City;
  height?: number;
  /** Space taken by the floating top bar, so the route isn't hidden under it. */
  topInset?: number;
}) {
  const { t } = useT();
  const { f, rtl } = useFont();
  const ref = useRef<MapView>(null);
  const checkpoints = useMapCheckpoints();
  const from = CITY_POINT[origin];
  const to = CITY_POINT[destination];
  // Checkpoints are stored Ramallah-first; flip them when driving the other way.
  const onRoad = origin === 'ramallah' ? checkpoints : [...checkpoints].reverse();
  const line = [from, ...onRoad, to];

  const fit = () =>
    ref.current?.fitToCoordinates(line, {
      edgePadding: { top: topInset + 40, bottom: 56, left: 48, right: 48 },
      animated: false,
    });
  useEffect(() => {
    fit();
    // Re-fit once the checkpoints arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkpoints.length, origin]);

  return (
    <View style={{ height }}>
      <MapView
        ref={ref}
        style={StyleSheet.absoluteFill}
        onMapReady={fit}
        customMapStyle={Platform.OS === 'android' ? GRAPHITE : undefined}
        mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
        // Small maps are a picture of the route (tap to expand); the full-screen one moves.
        scrollEnabled={!!interactive}
        zoomEnabled={!!interactive}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        showsPointsOfInterests={false}
        showsBuildings={false}
        showsTraffic={false}
      >
        <Polyline coordinates={line} strokeColor={colors.ink} strokeWidth={4} lineJoin="round" lineCap="round" />
        <Marker coordinate={from} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
          <View style={[styles.end, styles.start]} />
        </Marker>
        <Marker coordinate={to} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
          <View style={styles.end} />
        </Marker>
        {onRoad.map((c) => (
          <Marker key={c.id} coordinate={c} anchor={{ x: 0.5, y: labels ? 0.2 : 0.5 }} title={c.name} tracksViewChanges={!!labels}>
            <View style={styles.pin}>
              <View
                style={[
                  styles.checkpoint,
                  {
                    backgroundColor: c.status
                      ? c.status === 'crowded'
                        ? colors.statusCrowdedDot
                        : STATUS_LOOK[c.status].color
                      : colors.lineStrong,
                  },
                ]}
              />
              {labels ? (
                <View style={styles.label}>
                  <Text style={[styles.labelText, { fontFamily: f.medium }]}>
                    {c.name}
                    {c.status ? (
                      <Text style={{ color: STATUS_LOOK[c.status].color }}> {t(STATUS_LOOK[c.status].word)}</Text>
                    ) : null}
                  </Text>
                </View>
              ) : null}
            </View>
          </Marker>
        ))}
      </MapView>
      {onExpand ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('openMap')}
            onPress={onExpand}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.expand, rtl ? { left: space.screen } : { right: space.screen }]}>
            <GlassButton icon="arrowsOut" label={t('openMap')} onPress={onExpand} />
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Start: hollow ring. End: solid square. Same marks as the route card.
  end: { width: 14, height: 14, borderRadius: 3, backgroundColor: colors.ink, borderWidth: 2, borderColor: colors.card },
  start: { borderRadius: 7, backgroundColor: colors.card, borderColor: colors.ink, borderWidth: 3 },
  // Sits just above the sheet that overlaps the bottom of the map.
  expand: { position: 'absolute', bottom: radii.sheet + 12 },
  pin: { alignItems: 'center', gap: 4 },
  label: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  labelText: { fontSize: 12, color: colors.ink },
  checkpoint: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.card },
});

// Google Maps style: porcelain land, white roads, grey labels, no shop or transit clutter.
const GRAPHITE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#EDEBE6' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6B6E73' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#F7F6F3' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#D9D6CF' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#D7DCE0' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#E9E7E1' }] },
];
