// While the driver's trip is underway, send the car's position about once a minute,
// so a Share my trip link can show where the car is (report_position() in the database).
//
// Foreground only for now: if the driver locks the phone or leaves the app, updates pause
// until they come back. Background updates need a development build (see store builds).

import * as Location from 'expo-location';
import { useEffect } from 'react';

import { supabase } from '@/lib/supabase';

export function useDriverPosition(tripId: string | null, active: boolean) {
  useEffect(() => {
    if (!tripId || !active) return;
    let sub: Location.LocationSubscription | null = null;
    let stopped = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || stopped) return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 60_000, distanceInterval: 100 },
        (pos) => {
          supabase
            .rpc('report_position', {
              p_trip_id: tripId,
              p_lat: Number(pos.coords.latitude.toFixed(6)),
              p_lng: Number(pos.coords.longitude.toFixed(6)),
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
}
