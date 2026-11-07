// One quiet line of trust: "★ 4.8 · 12 trips · 96% show up · Founding driver".
// Used under a driver's or passenger's name wherever someone decides whether to ride.

import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ltr, useFont } from '@/components/ui';
import { useT } from '@/lib/session';
import { isNew, ratingText, reliabilityText, tripsKey, type Stats } from '@/lib/stats';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme/tokens';

/** Stats for a list of people, keyed by person id. */
export function usePeopleStats(ids: string[]) {
  const [stats, setStats] = useState<Record<string, Stats>>({});
  const key = [...new Set(ids)].sort().join(',');
  useEffect(() => {
    if (!key) return;
    supabase.rpc('people_stats', { p_people: key.split(',') }).then(({ data }) => {
      const rows = (data as (Stats & { person_id: string })[] | null) ?? [];
      setStats(Object.fromEntries(rows.map((r) => [r.person_id, r])));
    });
  }, [key]);
  return stats;
}

/** Stats for the drivers of a list of trips (search results), keyed by trip id. */
export function useTripDriverStats(tripIds: string[]) {
  const [stats, setStats] = useState<Record<string, Stats>>({});
  const key = [...new Set(tripIds)].sort().join(',');
  useEffect(() => {
    if (!key) return;
    supabase.rpc('trips_driver_stats', { p_trip_ids: key.split(',') }).then(({ data }) => {
      const rows = (data as (Stats & { trip_id: string })[] | null) ?? [];
      setStats(Object.fromEntries(rows.map((r) => [r.trip_id, r])));
    });
  }, [key]);
  return stats;
}

export function StatsLine({ stats, showReliability = true }: { stats?: Stats; showReliability?: boolean }) {
  const { t } = useT();
  const { f } = useFont();
  if (!stats) return null;
  const parts: string[] = [];
  if (isNew(stats)) parts.push(t('newOnRafiq'));
  else {
    parts.push(`${ltr(stats.completed_trips)} ${t(tripsKey(stats.completed_trips))}`);
    const rel = reliabilityText(stats);
    if (showReliability && rel) parts.push(`${ltr(rel)} ${t('showUpWord')}`);
  }
  if (stats.founding_driver) parts.push(t('foundingDriver'));
  const rating = ratingText(stats);
  return (
    <View style={styles.row}>
      {rating ? (
        <>
          <Icon name="starFill" size={13} />
          <Text style={[styles.text, { fontFamily: f.medium, color: colors.ink }]}>{ltr(rating)}</Text>
          <Text style={[styles.text, { fontFamily: f.regular }]}>·</Text>
        </>
      ) : null}
      <Text style={[styles.text, { fontFamily: f.regular }]} numberOfLines={1}>
        {parts.join(' · ')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  text: { fontSize: 14, color: colors.inkSecondary, flexShrink: 1 },
});
