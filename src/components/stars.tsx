// Stars for ratings: a row you can tap (StarPicker) and a small read-only line (Stars).

import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { tapFeel } from '@/lib/haptics';
import { useT } from '@/lib/session';
import { colors } from '@/theme/tokens';

export function StarPicker({ value, onChange, size = 40, label }: { value: number; onChange: (n: number) => void; size?: number; label?: string }) {
  const { t } = useT();
  return (
    <View
      style={[styles.row, size < 40 && { gap: 8 }]}
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 1, max: 5, now: value }}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          accessibilityRole="button"
          accessibilityLabel={`${n} ${t('starsWord')}`}
          hitSlop={6}
          onPress={() => {
            tapFeel();
            onChange(n);
          }}
          style={({ pressed }) => pressed && { transform: [{ scale: 0.92 }] }}
        >
          <Icon name={n <= value ? 'starFill' : 'star'} size={size} color={n <= value ? colors.ink : colors.lineStrong} />
        </Pressable>
      ))}
    </View>
  );
}

/** "★★★★☆" small, for lists. */
export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <View style={[styles.row, { gap: 2 }]} accessibilityLabel={`${value}/5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} name={n <= value ? 'starFill' : 'star'} size={size} color={n <= value ? colors.ink : colors.lineStrong} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
});
