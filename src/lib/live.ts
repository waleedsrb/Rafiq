import { useEffect, useRef, useState } from 'react';

import type { SeatCounts } from './seat-line';
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

/**
 * Live seat counts for one trip (confirmed, waiting for the driver, in line).
 * Riders can't read other people's bookings, so the database keeps these numbers in
 * trip_seat_counts and Realtime sends every change.
 */
export function useSeatCounts(tripId?: string | null) {
  const [counts, setCounts] = useState<SeatCounts | null>(null);

  useEffect(() => {
    if (!tripId) return;
    let live = true;
    const read = () =>
      supabase
        .from('trip_seat_counts')
        .select('confirmed, waiting, in_line, line_room')
        .eq('trip_id', tripId)
        .maybeSingle()
        .then(({ data }) => {
          if (live) setCounts((data as SeatCounts | null) ?? null);
        });
    read();
    const channel = supabase
      .channel(`seats:${tripId}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_seat_counts', filter: `trip_id=eq.${tripId}` }, read)
      .subscribe();
    return () => {
      live = false;
      supabase.removeChannel(channel);
    };
  }, [tripId]);

  return counts;
}

/** The same live seat counts for a list of trips (search results), by trip id. */
export function useSeatCountsFor(tripIds: string[]) {
  const [byTrip, setByTrip] = useState<Record<string, SeatCounts>>({});
  const key = [...tripIds].sort().join(',');

  useEffect(() => {
    if (!key) return;
    const ids = key.split(',');
    let live = true;
    const read = () =>
      supabase
        .from('trip_seat_counts')
        .select('trip_id, confirmed, waiting, in_line, line_room')
        .in('trip_id', ids)
        .then(({ data }) => {
          if (!live) return;
          const next: Record<string, SeatCounts> = {};
          for (const row of (data as (SeatCounts & { trip_id: string })[] | null) ?? []) next[row.trip_id] = row;
          setByTrip(next);
        });
    read();
    const wanted = new Set(ids);
    const channel = supabase
      .channel(`seats:list:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_seat_counts' }, (payload) => {
        const id = (payload.new as { trip_id?: string } | null)?.trip_id;
        if (id && wanted.has(id)) read();
      })
      .subscribe();
    return () => {
      live = false;
      supabase.removeChannel(channel);
    };
  }, [key]);

  return byTrip;
}
