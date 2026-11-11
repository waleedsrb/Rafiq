// The map behind "Where do you meet riders?": move the map and the pin in the middle
// marks the pickup. The pin never moves; the map slides under it (like Apple Maps'
// "move the map to adjust"), so it's easy to place with one thumb.
//
// The map fills the whole screen, like the route map on a trip, so it is still there behind
// the card when the card is folded down to its bar. (It used to stop at the card's top edge,
// which left a bare grey block under it once the card was folded away.) The pin, though,
// sits in the middle of the part you can see above the card at its middle height, so what
// onMove reports is the point under the pin's tip, not the map's centre.

import { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import MapView, { type Region } from 'react-native-maps';

import { Icon } from '@/components/icon';
import type { LatLng } from '@/lib/places';
import { colors, shadows } from '@/theme/tokens';

// About 600 m across: close enough to see the street, far enough to see the square.
const SPAN = 0.006;

export function PickupMap({
  center,
  onMove,
  visibleBottom,
}: {
  /** Where the map should be; a new `key` moves it there (a spot was tapped). */
  center: LatLng & { key: number };
  /** The pin's place after the driver moved the map. */
  onMove: (at: LatLng) => void;
  /** Where the card starts (window y): the map stops there. */
  visibleBottom: number;
}) {
  const ref = useRef<MapView>(null);
  const { width: W, height: H } = useWindowDimensions();
  // The pin's tip: the middle of what you see above the card (whose rounded corners overlap
  // the map a little), so it is where the old, shorter map had its centre.
  const tipY = (visibleBottom + 28) / 2;
  // How far the tip is above the map's centre, in points.
  const above = H / 2 - tipY;
  // Degrees of latitude per point. The map reports its real span as it moves; until then,
  // work it out from the width (the map fits SPAN across, and a degree of latitude is
  // longer on screen than one of longitude by 1/cos(latitude)).
  const perPt = useRef(degPerPt(center.latitude, W));
  const centreFor = (at: LatLng): Region => ({
    latitude: at.latitude - above * perPt.current,
    longitude: at.longitude,
    latitudeDelta: SPAN * (H / W),
    longitudeDelta: SPAN,
  });

  useEffect(() => {
    ref.current?.animateToRegion(centreFor(center), 280);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.key]);

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.sunken }]}>
      <MapView
        ref={ref}
        style={StyleSheet.absoluteFill}
        initialRegion={centreFor(center)}
        mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        showsBuildings={false}
        showsTraffic={false}
        onRegionChangeComplete={(r) => {
          if (r.latitudeDelta > 0) perPt.current = r.latitudeDelta / H;
          onMove({ latitude: r.latitude + above * perPt.current, longitude: r.longitude });
        }}
      />
      <View pointerEvents="none" style={[styles.pinWrap, { top: tipY - PIN }]}>
        <View style={styles.pin}>
          <Icon name="mapPin" size={22} color={colors.onInk} />
        </View>
        <View style={styles.stem} />
        <View style={styles.dot} />
      </View>
    </View>
  );
}

/** Degrees of latitude per point on a map SPAN degrees of longitude wide. */
const degPerPt = (latitude: number, width: number) => (SPAN / width) * Math.cos((latitude * Math.PI) / 180);

const PIN = 52; // from the pin's top to its point
const styles = StyleSheet.create({
  pinWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pin: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.card,
    ...shadows.float,
  },
  stem: { width: 3, height: 12, backgroundColor: colors.ink },
  dot: { width: 8, height: 4, borderRadius: 4, backgroundColor: 'rgba(23,25,28,0.3)' },
});
