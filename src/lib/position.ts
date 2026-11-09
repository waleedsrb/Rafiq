// While the driver's trip is underway, follow the car's position:
// - drive mode uses it (next checkpoint, distance, arrival time), so it updates every few seconds;
// - a Share my trip link shows where the car is, so it's sent to the database about once a
//   minute (report_position() in the database).
//
// Foreground only for now: if the driver locks the phone or leaves the app, updates pause
// until they come back. Background updates need a development build (see store builds).

import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import type { LatLng } from '@/lib/places';
import { supabase } from '@/lib/supabase';

const REPORT_EVERY_MS = 55_000;

export function useDriverPosition(tripId: string | null, active: boolean): LatLng | null {
  const [at, setAt] = useState<LatLng | null>(null);
  useEffect(() => {
    if (!tripId || !active) return;
    let sub: Location.LocationSubscription | null = null;
    let stopped = false;
    let lastReport = 0;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || stopped) return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 5_000, distanceInterval: 25 },
        (pos) => {
          const latitude = Number(pos.coords.latitude.toFixed(6));
          const longitude = Number(pos.coords.longitude.toFixed(6));
          setAt({ latitude, longitude });
          if (Date.now() - lastReport < REPORT_EVERY_MS) return;
          lastReport = Date.now();
          supabase
            .rpc('report_position', {
              p_trip_id: tripId,
              p_lat: latitude,
              p_lng: longitude,
              p_accuracy_m: pos.coords.accuracy != null ? Math.round(pos.coords.accuracy) : null,
            })
            .then(() => {});
        },
      );
      if (stopped) sub.remove();
    })().catch(() => {});
    return () => {
      stopped = true;
      sub?.remove();
    };
  }, [tripId, active]);
  return active ? at : null;
}
