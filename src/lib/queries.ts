// The reads more than one page needs, named once, so they share one cache entry
// (src/lib/cache.ts). Account loads your car, details and checks; when you then open
// Your car, Settings, Emergency contact or the ID check, the answer is already there.
//
// Each key includes the user id, so one person's data can never show for another.

import type { Overview } from '@/components/checkpoint-badge';
import type { Query } from '@/lib/cache';
import { checkStatus, type CheckKind, type CheckStatus, type LastRequest } from '@/lib/check-status';
import { monthRange, type EarningRow } from '@/lib/earnings';
import type { Notification } from '@/lib/inbox';
import type { Stats } from '@/lib/stats';
import type { City } from '@/lib/trip-form';
import { supabase } from '@/lib/supabase';

/** Supabase hands errors back instead of throwing; the cache needs a throw to keep the old answer. */
function must<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

export type MyCar = { car_model: string; car_color: string; plate: string; verified_at: string | null };

export const carQuery = (me: string): Query<MyCar | null> => ({
  key: `car:${me}`,
  fetch: async () =>
    must(await supabase.from('driver_details').select('car_model, car_color, plate, verified_at').eq('driver_id', me).maybeSingle()) as MyCar | null,
});

/** Your own profile fields that only you can read (my_profile()), beyond what the session holds. */
export type MyDetails = {
  created_at: string;
  emergency_name: string | null;
  emergency_phone: string | null;
  notify_trips: boolean;
  notify_alerts: boolean;
  notify_checkpoints: boolean;
  ask_near_checkpoints: boolean;
};

export const detailsQuery = (me: string): Query<MyDetails | null> => ({
  key: `details:${me}`,
  fetch: async () =>
    must(
      await supabase
        .rpc('my_profile')
        .select('created_at, emergency_name, emergency_phone, notify_trips, notify_alerts, notify_checkpoints, ask_near_checkpoints')
        .maybeSingle(),
    ) as MyDetails | null,
});

export const statsQuery = (person: string): Query<Stats | null> => ({
  key: `stats:${person}`,
  fetch: async () => {
    const data = must(await supabase.rpc('person_stats', { p_person: person }));
    const row = Array.isArray(data) ? data[0] : data;
    return (row as Stats | undefined) ?? null;
  },
});

/** Where you stand for the ID check or the driver check. */
export const checkQuery = (me: string, kind: CheckKind): Query<CheckStatus> => ({
  key: `check:${kind}:${me}`,
  fetch: async () => {
    const [profile, car, last] = await Promise.all([
      supabase.from('profiles').select('id_verified_at').eq('id', me).maybeSingle(),
      supabase.from('driver_details').select('verified_at').eq('driver_id', me).maybeSingle(),
      supabase
        .from('verifications')
        .select('status, reject_reason')
        .eq('user_id', me)
        .eq('kind', kind)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const p = must(profile);
    const c = must(car);
    return checkStatus({
      kind,
      idVerifiedAt: p?.id_verified_at ?? null,
      car: c ? { verifiedAt: c.verified_at ?? null } : null,
      last: must(last) as LastRequest | null,
    });
  },
});

/** This month's earnings (a driver's Earnings page). */
export const earningsQuery = (me: string, today = new Date()): Query<EarningRow[]> => {
  const { from, to } = monthRange(today);
  return {
    key: `earnings:${me}:${from.toISOString()}`,
    fetch: async () =>
      (must(await supabase.rpc('my_earnings', { p_from: from.toISOString(), p_to: to.toISOString() })) as EarningRow[] | null) ?? [],
  };
};

// ---- My trips ----

type ListTrip = {
  id: string;
  origin: City;
  destination: City;
  departs_at: string;
  seats_total: number;
  price_ils: number;
  finished_at: string | null;
};
export type MyDriverTrip = ListTrip & { bookings: { status: string }[] };
export type MyBooking = { id: string; status: string; trips: ListTrip };
export type MyTrips = {
  drives: MyDriverTrip[];
  seats: MyBooking[];
  pastSeats: MyBooking[];
  pastDrives: MyDriverTrip[];
  /** booking id -> stars you gave */
  given: Record<string, number>;
};

// Trips that left in the last few hours stay in Upcoming until they finish (trip day).
const LOOKBACK_MS = 5 * 60 * 60 * 1000;
const TRIP_COLS = 'id, origin, destination, departs_at, seats_total, price_ils, finished_at';

/** Everything the My trips tab lists, on both sides. */
export const myTripsQuery = (me: string): Query<MyTrips> => ({
  key: `my-trips:${me}`,
  fetch: async () => {
    const since = new Date(Date.now() - LOOKBACK_MS).toISOString();
    const [driveRes, seatRes, pastSeats, pastDrives, mine] = await Promise.all([
      supabase
        .from('trips')
        .select(`${TRIP_COLS}, bookings(status)`)
        .eq('driver_id', me)
        .is('cancelled_at', null)
        .is('finished_at', null)
        .gte('departs_at', since)
        .order('departs_at'),
      supabase
        .from('bookings')
        .select(`id, status, trips!inner(${TRIP_COLS})`)
        .eq('passenger_id', me)
        .is('trips.finished_at', null)
        .gte('trips.departs_at', since),
      supabase
        .from('bookings')
        .select(`id, status, trips!inner(${TRIP_COLS})`)
        .eq('passenger_id', me)
        .in('status', ['completed', 'no_show', 'not_confirmed', 'disputed'])
        .limit(30),
      supabase
        .from('trips')
        .select(`${TRIP_COLS}, bookings(status)`)
        .eq('driver_id', me)
        .not('finished_at', 'is', null)
        .order('departs_at', { ascending: false })
        .limit(30),
      supabase.from('ratings').select('booking_id, stars').eq('rater_id', me),
    ]);
    const seats = (must(seatRes) as unknown as MyBooking[] | null) ?? [];
    seats.sort((a, b) => a.trips.departs_at.localeCompare(b.trips.departs_at));
    return {
      drives: (must(driveRes) as unknown as MyDriverTrip[] | null) ?? [],
      seats,
      pastSeats: (must(pastSeats) as unknown as MyBooking[] | null) ?? [],
      pastDrives: (must(pastDrives) as unknown as MyDriverTrip[] | null) ?? [],
      given: Object.fromEntries(((must(mine) as { booking_id: string; stars: number }[] | null) ?? []).map((r) => [r.booking_id, r.stars])),
    };
  },
});

// ---- Checkpoints ----

/** Every checkpoint with its current status (the Checkpoints tab and each checkpoint's page). */
export const checkpointsQuery = (): Query<Overview[]> => ({
  key: 'checkpoints:overview',
  fetch: async () => (must(await supabase.rpc('checkpoint_overview')) as Overview[] | null) ?? [],
});

/** The checkpoints you follow (bell on a checkpoint's page). */
export const followsQuery = (me: string): Query<string[]> => ({
  key: `checkpoint-follows:${me}`,
  fetch: async () =>
    ((must(await supabase.from('checkpoint_follows').select('checkpoint_id').eq('user_id', me)) as { checkpoint_id: string }[] | null) ?? []).map(
      (r) => r.checkpoint_id,
    ),
});

// ---- Notifications ----

/** Your inbox, newest first (the bell on Home). */
export const inboxQuery = (me: string): Query<Notification[]> => ({
  key: `inbox:${me}`,
  fetch: async () =>
    (must(
      await supabase
        .from('notifications')
        .select('id, kind, title, body, title_ar, body_ar, title_en, body_en, url, created_at, read_at')
        .eq('user_id', me)
        .order('created_at', { ascending: false })
        .limit(100),
    ) as Notification[] | null) ?? [],
});

// ---- Someone's page ----

export type PublicProfile = {
  name: string;
  id_verified: boolean;
  member_since: string;
  deleted: boolean;
  car_model: string | null;
  car_color: string | null;
  driver_verified: boolean;
  driving_since: string | null;
  founding_driver: boolean;
};

export type Review = {
  stars: number;
  tags: string[] | null;
  note: string | null;
  created_at: string;
  rater_first_name: string;
};

export type Person = { profile: PublicProfile | null; avatarPath: string | null; reviews: Review[] };

/** What someone's page shows (their numbers come from statsQuery). */
export const personQuery = (id: string): Query<Person> => ({
  key: `person:${id}`,
  fetch: async () => {
    const [profile, avatar, reviews] = await Promise.all([
      supabase.rpc('public_profile', { p_person: id }),
      // The photo itself only opens if you may see it (see can_see_avatar()).
      supabase.from('profiles').select('avatar_path').eq('id', id).maybeSingle(),
      supabase.rpc('person_reviews', { p_person: id, p_limit: 20 }),
    ]);
    const row = must(profile);
    return {
      profile: ((Array.isArray(row) ? row[0] : row) as PublicProfile | undefined) ?? null,
      avatarPath: (must(avatar) as { avatar_path: string | null } | null)?.avatar_path ?? null,
      reviews: (must(reviews) as Review[] | null) ?? [],
    };
  },
});

// ---- The trip card (a passenger's view) ----

export type CardTrip = {
  id: string;
  driver_id: string;
  origin: City;
  destination: City;
  departs_at: string;
  seats_total: number;
  price_ils: number;
  cancelled_at: string | null;
  cancelled_late: boolean | null;
  cancel_reason: string | null;
  started_at: string | null;
  finished_at: string | null;
  // Where the driver meets riders (null on trips posted before pickups: the city square).
  pickup_label: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  // The checkpoints the driver goes through (empty on trips posted before Nov 10).
  checkpoint_ids: string[] | null;
  profiles: { display_name: string; avatar_path: string | null }; // the driver, joined through trips.driver_id
  trip_series: { weekdays: number[]; stopped_at: string | null } | null; // set when the trip repeats weekly
};
export type CardBooking = {
  id: string;
  status: string;
  respond_by: string | null;
  accepted_at: string | null;
  created_at: string;
  here_at: string | null;
};
export type TripCard = { trip: CardTrip; booking: CardBooking | null };

/** One trip and your seat on it. Lists start this as your finger lands, so the card opens filled. */
export const tripCardQuery = (tripId: string, me: string): Query<TripCard> => ({
  key: `trip-card:${tripId}:${me}`,
  fetch: async () => {
    const [trip, booking] = await Promise.all([
      supabase
        .from('trips')
        .select(
          'id, driver_id, origin, destination, departs_at, seats_total, price_ils, cancelled_at, cancelled_late, cancel_reason, started_at, finished_at, pickup_label, pickup_lat, pickup_lng, checkpoint_ids, profiles!trips_driver_id_fkey(display_name, avatar_path), trip_series(weekdays, stopped_at)',
        )
        .eq('id', tripId)
        .single(),
      supabase
        .from('bookings')
        .select('id, status, respond_by, accepted_at, created_at, here_at')
        .eq('trip_id', tripId)
        .eq('passenger_id', me)
        .maybeSingle(),
    ]);
    return { trip: must(trip) as unknown as CardTrip, booking: must(booking) as CardBooking | null };
  },
});

// ---- A trip you drive (the driver's trip page) ----

export type DrivenTrip = {
  id: string;
  origin: City;
  destination: City;
  departs_at: string;
  price_ils: number;
  seats_total: number;
  cancelled_at: string | null;
  trip_series: { id: string; weekdays: number[]; stopped_at: string | null } | null; // weekly pattern, if any
  started_at: string | null;
  finished_at: string | null;
  pickup_label: string | null; // where you meet riders (null: the city square)
  pickup_lat: number | null;
  pickup_lng: number | null;
  checkpoint_ids: string[] | null; // the checkpoints on the way (empty before Nov 10)
};
export type RiderRequest = {
  id: string;
  status: string;
  seats: number;
  respond_by: string | null;
  created_at: string;
  here_at: string | null;
  boarded_at: string | null;
  passenger_id: string;
  profiles: { display_name: string; avatar_path: string | null }; // the passenger
};
export type DriverTripData = { trip: DrivenTrip; requests: RiderRequest[] };

export const driverTripQuery = (tripId: string): Query<DriverTripData> => ({
  key: `driver-trip:${tripId}`,
  fetch: async () => {
    const [trip, requests] = await Promise.all([
      supabase
        .from('trips')
        .select(
          'id, origin, destination, departs_at, price_ils, seats_total, cancelled_at, started_at, finished_at, pickup_label, pickup_lat, pickup_lng, checkpoint_ids, trip_series(id, weekdays, stopped_at)',
        )
        .eq('id', tripId)
        .single(),
      supabase
        .from('bookings')
        .select('id, status, seats, respond_by, created_at, here_at, boarded_at, passenger_id, profiles!bookings_passenger_id_fkey(display_name, avatar_path)')
        .eq('trip_id', tripId)
        .order('created_at'),
    ]);
    return { trip: must(trip) as unknown as DrivenTrip, requests: (must(requests) as unknown as RiderRequest[] | null) ?? [] };
  },
});
