// The towns you picked lately, shown first in the town list before you type
// (most people switch between the same two or three places).

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { City } from '@/lib/trip-form';

const KEY = 'rafiq.recentPlaces';
const MAX = 4;
let recent: City[] = [];

AsyncStorage.getItem(KEY)
  .then((v) => {
    if (v) recent = (JSON.parse(v) as City[]).slice(0, MAX);
  })
  .catch(() => {});

/** Newest first. */
export function recentPlaces(): City[] {
  return recent;
}

export function rememberPlace(id: City) {
  recent = [id, ...recent.filter((r) => r !== id)].slice(0, MAX);
  AsyncStorage.setItem(KEY, JSON.stringify(recent)).catch(() => {});
}
