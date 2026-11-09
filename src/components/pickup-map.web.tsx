// react-native-maps has no web version. The web build (used only for quick checks)
// shows a plain block with the pin where the map would be.
import { View } from 'react-native';

import { Icon } from '@/components/icon';
import type { LatLng } from '@/lib/places';
import { colors } from '@/theme/tokens';

export function PickupMap({ visibleBottom }: { center: LatLng & { key: number }; onMove: (at: LatLng) => void; visibleBottom: number }) {
  return (
    <View style={{ height: visibleBottom + 28, backgroundColor: colors.sunken, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="mapPin" size={32} />
    </View>
  );
}
