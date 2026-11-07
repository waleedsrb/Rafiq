// Checkpoints map: the whole Ramallah - Nablus road with every checkpoint in its status
// colour. Opened from the map button on the Checkpoints tab.

import { RouteMap } from '@/components/route-map';
import { BackButton, TopBar } from '@/components/ui';
import { useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme/tokens';

export default function CheckpointsMap() {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <RouteMap origin="ramallah" destination="nablus" height={height} topInset={insets.top + 60} labels />
      <View style={{ position: 'absolute', left: 0, right: 0, top: insets.top }}>
        <TopBar start={<BackButton />} />
      </View>
    </View>
  );
}
