// Where trips start and end on the map. Each city has a centre square: the default pickup
// (a driver can pick another spot when posting, see src/lib/pickup.ts) and where the
// route line starts and ends for trips posted before pickups existed.
import type { City } from './trip-form';

export type LatLng = { latitude: number; longitude: number };

export const CITY_POINT: Record<City, LatLng> = {
  ramallah: { latitude: 31.9038, longitude: 35.2034 }, // Al-Manara Square
  nablus: { latitude: 32.2211, longitude: 35.2544 }, // Martyrs Square
};

/** The centre square's name, as a string key (the pickup offered when nothing else is known). */
export const CITY_SQUARE: Record<City, 'squareRamallah' | 'squareNablus'> = {
  ramallah: 'squareRamallah',
  nablus: 'squareNablus',
};
