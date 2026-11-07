// The three big numbers on a profile: Trips · Reliable · Rating. Used on Your profile
// and on someone else's page. "–" until there is something to show.

import { StyleSheet, Text, View } from 'react-native';

import { ltr, useFont } from '@/components/ui';
import { useT } from '@/lib/session';
import { ratingText, reliabilityText, type Stats } from '@/lib/stats';
import { colors, space } from '@/theme/tokens';

export function StatsRow({ stats }: { stats: Stats }) {
  const { t } = useT();
  const { f } = useFont();
  const cells: [string, string][] = [
    [String(stats.completed_trips ?? 0), t('statTrips')],
    [reliabilityText(stats) ?? '–', t('statReliable')],
    [ratingText(stats) ?? '–', t('statRating')],
  ];
  return (
    <View style={styles.stats}>
      {cells.map(([value, label], i) => (
        <View key={label} style={[styles.stat, i > 0 && styles.statLine]}>
          <Text style={[styles.value, { fontFamily: f.bold }]}>{ltr(value)}</Text>
          <Text style={[styles.label, { fontFamily: f.regular }]}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stats: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.hairline,
  },
  stat: { flex: 1, paddingVertical: space.md, alignItems: 'center', gap: 2 },
  statLine: { borderStartWidth: 1, borderColor: colors.hairline },
  value: { fontSize: 22, lineHeight: 28, color: colors.ink },
  label: { fontSize: 13, lineHeight: 18, color: colors.inkSecondary },
});
