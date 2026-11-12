// The map, full screen: you can pan and zoom. From the Checkpoints tab's map button it shows
// every checkpoint in the West Bank; from a trip's map, that trip's two towns and its checkpoints.

import { useLocalSearchParams } from 'expo-router';
import { useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CheckpointsMap, RouteMap } from '@/components/route-map';
import { BackButton, TopBar } from '@/components/ui';
import type { City } from '@/lib/trip-form';
import { useTheme } from '@/theme/theme';

export default function FullMap() {
  const { c: colors } = useTheme();
  const params = useLocalSearchParams<{ origin?: City; destination?: City; checkpoints?: string }>();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const ids = params.checkpoints ? params.checkpoints.split(',').filter(Boolean) : undefined;
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      {params.origin && params.destination ? (
        <RouteMap
          origin={params.origin}
          destination={params.destination}
          checkpointIds={ids}
          height={height}
          topInset={insets.top + 60}
          labels
          interactive
        />
      ) : (
        <CheckpointsMap height={height} topInset={insets.top + 60} />
      )}
      <View style={{ position: 'absolute', left: 0, right: 0, top: insets.top }}>
        <TopBar start={<BackButton />} />
      </View>
    </View>
  );
}
