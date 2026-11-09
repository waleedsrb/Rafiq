// "Checkpoints on your way": every checkpoint on the route, in driving order, with its status.
// Shown while a trip is on the road. Live location comes later (slice 12), so this is the
// whole road, not "the next one ahead".

import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { StatusCircle, StatusWord, useAgo, type Overview } from '@/components/checkpoint-badge';
import { ListRow, SectionTitle } from '@/components/ui';
import { onRamallahNablusRoad } from '@/lib/places';
import { useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import type { City } from '@/lib/trip-form';

type Row = Overview & { road_order: number | null };

/**
 * `reportedOnly` keeps just the checkpoints someone reported on recently (Home uses it,
 * so the list is short and every line is news); `limit` caps how many show.
 */
export function RouteCheckpoints({ origin, destination, reportedOnly, limit }: { origin: City; destination: City; reportedOnly?: boolean; limit?: number }) {
  const { t, lang } = useT();
  const ago = useAgo();
  const [rows, setRows] = useState<Row[]>([]);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('checkpoint_overview');
    // Only the Ramallah - Nablus road for now (the rest of the West Bank has no road_order),
    // and only for a trip along it. Drivers will pick their own checkpoints in the next step.
    const way = onRamallahNablusRoad(origin, destination);
    const list = way ? ((data as Row[] | null) ?? []).filter((r) => r.road_order != null) : [];
    // road_order counts from Ramallah, so reverse it when leaving from the Nablus side.
    list.sort((a, b) => (way === 'forward' ? (a.road_order ?? 0) - (b.road_order ?? 0) : (b.road_order ?? 0) - (a.road_order ?? 0)));
    const shown = reportedOnly ? list.filter((r) => r.status) : list;
    setRows(limit ? shown.slice(0, limit) : shown);
    setNow(new Date());
  }, [origin, destination, reportedOnly, limit]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  if (rows.length === 0) return null;
  return (
    <View>
      <SectionTitle>{t('checkpointsOnRoute')}</SectionTitle>
      {rows.map((r, i) => (
        <ListRow
          key={r.id}
          last={i === rows.length - 1}
          leading={<StatusCircle status={r.status} size={36} />}
          title={lang === 'ar' ? r.name_ar : r.name_en}
          subtitle={r.last_report_at ? ago(r.last_report_at, now) : t('noRecentReports')}
          trailing={r.status ? <StatusWord status={r.status} /> : undefined}
          onPress={() => router.push({ pathname: '/checkpoints/[id]', params: { id: r.id } })}
        />
      ))}
    </View>
  );
}
