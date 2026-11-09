// Results on a screen of their own, for links from elsewhere in the app (Home's hero,
// a driver's cancellation). Home's "Where to?" bar opens the same search in place instead
// (src/components/search-morph.tsx). The day and part of the day change right here.

import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { PlacePicker } from '@/components/place-picker';
import { RouteCard } from '@/components/route-card';
import { DayChips, SearchResults, useTripSearch } from '@/components/trip-search';
import { Screen } from '@/components/ui';
import { useT } from '@/lib/session';
import type { City } from '@/lib/trip-form';
import { parsePart, SEARCH_DAYS } from '@/lib/trip-search';
import { space } from '@/theme/tokens';

export default function Results() {
  const params = useLocalSearchParams<{ origin?: City; destination?: City; day?: string; part?: string }>();
  const day = Math.min(SEARCH_DAYS - 1, Math.max(0, Number(params.day ?? 0) || 0));
  const s = useTripSearch({ origin: params.origin, destination: params.destination, day, part: parsePart(params.part) });
  const { t } = useT();
  const [picking, setPicking] = useState<'origin' | 'destination' | null>(null);
  return (
    <Screen back scroll>
      <View style={{ gap: space.md }}>
        <RouteCard origin={s.origin} destination={s.destination} onSwap={s.swap} onPick={setPicking} />
        <DayChips s={s} />
        <SearchResults s={s} />
      </View>
      <PlacePicker
        visible={picking !== null}
        title={t(picking === 'destination' ? 'whereTo' : 'whereFrom')}
        exclude={picking === 'destination' ? s.origin : picking === 'origin' ? s.destination : undefined}
        onPick={(id) => {
          if (picking === 'origin') s.setOrigin(id);
          else s.setDestination(id);
          setPicking(null);
        }}
        onClose={() => setPicking(null)}
      />
    </Screen>
  );
}
