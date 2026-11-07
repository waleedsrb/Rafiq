import { useEffect, useRef } from 'react';

import { supabase } from './supabase';

/**
 * Call `onChange` whenever a booking this person can see is created or changes,
 * e.g. a driver accepts while the passenger has the trip open.
 * `filter` narrows it down, e.g. "trip_id=eq.<id>".
 */
export function useBookingChanges(onChange: () => void, filter?: string) {
  // Keep the latest callback without resubscribing on every render.
  const latest = useRef(onChange);
  latest.current = onChange;

  useEffect(() => {
    const channel = supabase
      .channel(`bookings:${filter ?? 'all'}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter }, () => latest.current())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [filter]);
}

/** Call `onChange` when one trip changes, e.g. the driver taps Start trip or Arrived. */
export function useTripChanges(onChange: () => void, tripId?: string) {
  const latest = useRef(onChange);
  latest.current = onChange;

  useEffect(() => {
    if (!tripId) return;
    const channel = supabase
      .channel(`trips:${tripId}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'trips', filter: `id=eq.${tripId}` }, () => latest.current())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId]);
}
