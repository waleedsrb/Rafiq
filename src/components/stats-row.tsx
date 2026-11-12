// The three big numbers on a profile: Trips · Reliable · Rating. Used on Your profile
// and on someone else's page. "–" until there is something to show.

import { Text, View } from 'react-native';

import { Skeleton, SkeletonGroup } from '@/components/skeleton';
import { ltr, useFont } from '@/components/ui';
import { useT } from '@/lib/session';
import { ratingText, reliabilityText, type Stats } from '@/lib/stats';
import { makeStyles } from '@/theme/theme';
import { space } from '@/theme/tokens';

export function StatsRow({ stats }: { stats: Stats }) {
  const styles = useStyles();
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

/** The same three cells while the numbers load, so nothing below jumps when they land. */
export function StatsRowSkeleton() {
  const styles = useStyles();
  return (
    <SkeletonGroup style={styles.stats}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.stat, i > 0 && styles.statLine]}>
          <Skeleton width={36} height={22} style={{ marginVertical: 3 }} />
          <Skeleton width={52} height={11} style={{ marginVertical: 3.5 }} />
        </View>
      ))}
    </SkeletonGroup>
  );
}

const useStyles = makeStyles((colors) => ({
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
}));
