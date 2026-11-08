// Results on a screen of their own, for links from elsewhere in the app (Home's hero,
// a driver's cancellation). Home's "Where to?" bar opens the same search in place instead
// (src/components/search-morph.tsx). The day and part of the day change right here.

import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { RouteCard } from '@/components/route-card';
import { DayChips, SearchResults, useTripSearch } from '@/components/trip-search';
import { Screen } from '@/components/ui';
import type { City } from '@/lib/trip-form';
import { parsePart, SEARCH_DAYS } from '@/lib/trip-search';
import { space } from '@/theme/tokens';

export default function Results() {
  const params = useLocalSearchParams<{ origin?: City; day?: string; part?: string }>();
  const day = Math.min(SEARCH_DAYS - 1, Math.max(0, Number(params.day ?? 0) || 0));
  const s = useTripSearch({ origin: params.origin === 'nablus' ? 'nablus' : 'ramallah', day, part: parsePart(params.part) });
  return (
    <Screen back scroll>
      <View style={{ gap: space.md }}>
        <RouteCard origin={s.origin} destination={s.destination} onSwap={s.swap} />
        <DayChips s={s} />
        <SearchResults s={s} />
      </View>
    </Screen>
  );
}
