// Where trips start and end. A trip's origin and destination are place ids from the places
// table ('osm-n246843686' is Ramallah). The West Bank places also ship inside the app
// (src/data/places.ts, made by scripts/map-data/build_seed.py), so naming a town or putting
// it on the map never waits for the server. Searching goes to the server (search_places),
// because only it knows the places outside the West Bank, to flag them.
import { PLACES as ROWS } from '../data/places.ts';

export type LatLng = { latitude: number; longitude: number };
export type Lang = 'ar' | 'en';
export type Place = { id: string; ar: string; en: string; point: LatLng; governorate: string };

export const RAMALLAH = 'osm-n246843686';
export const NABLUS = 'osm-n293546203';

// Trips saved before places existed said 'ramallah' or 'nablus'.
const OLD: Record<string, string> = { ramallah: RAMALLAH, nablus: NABLUS };

/** A West Bank place, or null when the app doesn't know the id. */
export function place(id: string | null | undefined): Place | null {
  if (!id) return null;
  const key = OLD[id] ?? id;
  const r = ROWS[key];
  return r ? { id: key, ar: r[0], en: r[1], point: { latitude: r[2], longitude: r[3] }, governorate: r[4] } : null;
}

/** The place's name in the app's language ("Ramallah" / "رام الله"). */
export function placeName(id: string | null | undefined, lang: Lang | string): string {
  const p = place(id);
  if (!p) return '';
  return lang === 'ar' ? p.ar : p.en;
}

/** Where the place is on the map (its centre). Ramallah if the id is unknown, so a map always has somewhere to look. */
export function placePoint(id: string | null | undefined): LatLng {
  return place(id)?.point ?? CENTRES[RAMALLAH].point;
}

/** "Ramallah → Nablus", the arrow following the reading direction. */
export function routeName(origin: string, destination: string, lang: Lang | string): string {
  return `${placeName(origin, lang)} ${lang === 'ar' ? '←' : '→'} ${placeName(destination, lang)}`;
}

// Towns whose centre square people know by name. Elsewhere the centre is "<town> centre".
const CENTRES: Record<string, { point: LatLng; ar: string; en: string }> = {
  [RAMALLAH]: { point: { latitude: 31.9038, longitude: 35.2034 }, ar: 'دوار المنارة', en: 'Al-Manara Square' },
  [NABLUS]: { point: { latitude: 32.2211, longitude: 35.2544 }, ar: 'دوار الشهداء', en: 'Martyrs Square' },
};

/** The town centre: the default pickup, and where a trip without a pickup starts on the map. */
export function centrePoint(id: string | null | undefined): LatLng {
  const key = id ? (OLD[id] ?? id) : RAMALLAH;
  return CENTRES[key]?.point ?? placePoint(key);
}

/** The town centre's name, e.g. "Al-Manara Square", or "Birzeit centre" where there is no famous square. */
export function centreName(id: string | null | undefined, lang: Lang | string): string {
  const key = id ? (OLD[id] ?? id) : RAMALLAH;
  const c = CENTRES[key];
  if (c) return lang === 'ar' ? c.ar : c.en;
  const name = placeName(key, lang);
  return lang === 'ar' ? `وسط ${name}` : `${name} centre`;
}

/** Straight-line distance in km (the same flat-earth sum as the server's search). */
export function kmBetween(a: LatLng, b: LatLng): number {
  return Math.sqrt(((a.latitude - b.latitude) * 111) ** 2 + ((a.longitude - b.longitude) * 94.5) ** 2);
}

/** Distance between two places in km, or null if either is unknown. */
export function placeKm(a: string, b: string): number | null {
  const pa = place(a);
  const pb = place(b);
  return pa && pb ? kmBetween(pa.point, pb.point) : null;
}

/**
 * The four checkpoints we placed by hand sit on the Ramallah - Nablus road (road_order 1-4,
 * from Ramallah). They only belong on a trip that runs along that road: 'forward' from the
 * Ramallah side to the Nablus side, 'back' the other way, null for any other trip. Until
 * drivers pick their own checkpoints (next step), other trips show none rather than guess.
 */
export function onRamallahNablusRoad(origin: string, destination: string): 'forward' | 'back' | null {
  const near = (id: string, town: string) => {
    const km = placeKm(id, town);
    return km !== null && km <= 15;
  };
  if (near(origin, RAMALLAH) && near(destination, NABLUS)) return 'forward';
  if (near(origin, NABLUS) && near(destination, RAMALLAH)) return 'back';
  return null;
}
