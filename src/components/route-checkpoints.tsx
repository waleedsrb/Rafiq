// "Checkpoints on your way": every checkpoint on the route, in driving order, with its status.
// Shown while a trip is on the road. Live location comes later (slice 12), so this is the
// whole road, not "the next one ahead".

import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { StatusCircle, StatusWord, useAgo, type Overview } from '@/components/checkpoint-badge';
import { ListRow, SectionTitle } from '@/components/ui';
import { useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import type { City } from '@/lib/trip-form';

type Row = Overview & { road_order: number };

export function RouteCheckpoints({ origin }: { origin: City }) {
  const { t, lang } = useT();
  const ago = useAgo();
  const [rows, setRows] = useState<Row[]>([]);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('checkpoint_overview');
    const list = ((data as Row[] | null) ?? []).slice();
    // road_order counts from Ramallah, so reverse it when leaving from Nablus.
    list.sort((a, b) => (origin === 'ramallah' ? a.road_order - b.road_order : b.road_order - a.road_order));
    setRows(list);
    setNow(new Date());
  }, [origin]);

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
