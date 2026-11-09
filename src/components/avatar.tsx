// A person's circle: their profile photo when it's shown to you, otherwise their initial.

import { Image, View } from 'react-native';

import { IconCircle } from '@/components/ui';
import { useAvatarUrl } from '@/lib/avatar';
import { colors } from '@/theme/tokens';

export function Avatar({ path, name, size = 40 }: { path?: string | null; name: string; size?: number }) {
  const url = useAvatarUrl(path);
  if (!url) return <IconCircle letter={name.trim().charAt(0)} size={size} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: colors.sunken }}>
      <Image source={{ uri: url }} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />
    </View>
  );
}
