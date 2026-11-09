// The map behind "Where do you meet riders?": move the map and the pin in the middle
// marks the pickup. The pin never moves; the map slides under it (like Apple Maps'
// "move the map to adjust"), so it's easy to place with one thumb.
//
// The map only covers the part of the screen above the trip card, so its middle (where
// the pin sits, and what onMove reports: the region's centre) is what you can actually see.

import { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import MapView from 'react-native-maps';

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
  const height = visibleBottom + 28; // the card's rounded corners overlap the map a little

  useEffect(() => {
    ref.current?.animateToRegion({ ...center, latitudeDelta: SPAN, longitudeDelta: SPAN }, 280);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.key]);

  return (
    <View style={{ height, backgroundColor: colors.sunken }}>
      <MapView
        ref={ref}
        style={StyleSheet.absoluteFill}
        initialRegion={{ ...center, latitudeDelta: SPAN, longitudeDelta: SPAN }}
        mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        showsBuildings={false}
        showsTraffic={false}
        onRegionChangeComplete={(r) => onMove({ latitude: r.latitude, longitude: r.longitude })}
      />
      <View pointerEvents="none" style={[styles.pinWrap, { top: height / 2 - PIN }]}>
        <View style={styles.pin}>
          <Icon name="mapPin" size={22} color={colors.onInk} />
        </View>
        <View style={styles.stem} />
        <View style={styles.dot} />
      </View>
    </View>
  );
}

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
