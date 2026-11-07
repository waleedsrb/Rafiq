// Where trips start and end on the map. One meeting point per city for now
// (the squares the mockups name); real pickup spots come with the pickup feature.
import type { City } from './trip-form';

export type LatLng = { latitude: number; longitude: number };

export const CITY_POINT: Record<City, LatLng> = {
  ramallah: { latitude: 31.9038, longitude: 35.2034 }, // Al-Manara Square
  nablus: { latitude: 32.2211, longitude: 35.2544 }, // Martyrs Square
};
