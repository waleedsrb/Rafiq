// "Checkpoints on your way": the trip's checkpoints, in driving order, with their status.
// A trip lists the ones its driver confirmed when posting (or changed later with "Change my
// way"); an older trip on the Ramallah - Nablus road shows the four hand-placed ones.

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { StatusCircle, StatusWord, useAgo } from '@/components/checkpoint-badge';
import { useWayCheckpoints } from '@/components/route-map';
import { ListRow, SectionTitle } from '@/components/ui';
import type { LatLng } from '@/lib/places';
import { useT } from '@/lib/session';
import type { City } from '@/lib/trip-form';

/**
 * `reportedOnly` keeps just the checkpoints someone reported on recently (Home uses it,
 * so the list is short and every line is news); `limit` caps how many show.
 */
export function RouteCheckpoints({
  origin,
  destination,
  start,
  ids,
  reportedOnly,
  limit,
}: {
  origin: City;
  destination: City;
  start?: LatLng | null;
  /** The trip's own checkpoints (trips.checkpoint_ids). */
  ids?: string[] | null;
  reportedOnly?: boolean;
  limit?: number;
}) {
  const { t } = useT();
  const ago = useAgo();
  const way = useWayCheckpoints({ origin, destination, start, ids, refreshMs: 60_000 });
  const [now, setNow] = useState(() => new Date());
  useEffect(() => setNow(new Date()), [way]);

  const shown = reportedOnly ? way.filter((c) => c.status) : way;
  const rows = limit ? shown.slice(0, limit) : shown;
  if (rows.length === 0) return null;
  return (
    <View>
      <SectionTitle>{t('checkpointsOnRoute')}</SectionTitle>
      {rows.map((c, i) => (
        <ListRow
          key={c.id}
          last={i === rows.length - 1}
          leading={<StatusCircle status={c.status} size={36} />}
          title={c.name}
          subtitle={c.reportedAt ? ago(c.reportedAt, now) : t('noRecentReports')}
          trailing={c.status ? <StatusWord status={c.status} /> : undefined}
          onPress={() => router.push({ pathname: '/checkpoints/[id]', params: { id: c.id } })}
        />
      ))}
    </View>
  );
}
