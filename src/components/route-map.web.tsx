// react-native-maps has no web version. The web build (used only for quick checks)
// shows a plain porcelain block where the map would be.
import { View } from 'react-native';

import type { City } from '@/lib/trip-form';
import { colors } from '@/theme/tokens';

export function RouteMap({ height = 300 }: { origin: City; destination: City; height?: number; topInset?: number; labels?: boolean }) {
  return <View style={{ height, backgroundColor: colors.sunken }} />;
}
