// The map, full screen: you can pan and zoom. Opened from the map button on the
// Checkpoints tab (the whole road) or by tapping the map on a trip (that trip's direction).

import { useLocalSearchParams } from 'expo-router';
import { useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteMap } from '@/components/route-map';
import { BackButton, TopBar } from '@/components/ui';
import type { City } from '@/lib/trip-form';
import { colors } from '@/theme/tokens';

export default function FullMap() {
  const params = useLocalSearchParams<{ origin?: City }>();
  const origin: City = params.origin === 'nablus' ? 'nablus' : 'ramallah';
  const destination: City = origin === 'ramallah' ? 'nablus' : 'ramallah';
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <RouteMap origin={origin} destination={destination} height={height} topInset={insets.top + 60} labels interactive />
      <View style={{ position: 'absolute', left: 0, right: 0, top: insets.top }}>
        <TopBar start={<BackButton />} />
      </View>
    </View>
  );
}
