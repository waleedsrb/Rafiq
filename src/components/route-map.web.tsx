// react-native-maps has no web version. The web build (used only for quick checks)
// shows a plain porcelain block where the map would be.
import { View } from 'react-native';

import type { City } from '@/lib/trip-form';
import { useTheme } from '@/theme/theme';

export function useWayCheckpoints(_: { origin: City; destination: City; start?: { latitude: number; longitude: number } | null; ids?: string[] | null; refreshMs?: number }) {
  return [] as never[];
}

export function RouteMap({ height = 300 }: { checkpoints?: unknown[]; checkpointIds?: string[] | null; origin: City; destination: City; height?: number; topInset?: number; bottomInset?: number; labels?: boolean; interactive?: boolean; onExpand?: () => void; start?: { latitude: number; longitude: number }; car?: { latitude: number; longitude: number } | null; dark?: boolean }) {
  const { c: colors } = useTheme();
  return <View style={{ height, backgroundColor: colors.sunken }} />;
}

export function CheckpointsMap({ height }: { height: number; topInset?: number }) {
  const { c: colors } = useTheme();
  return <View style={{ height, backgroundColor: colors.sunken }} />;
}
