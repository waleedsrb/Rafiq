// Checkpoints tab: every checkpoint on the road with its current status.
// The status comes from checkpoint_overview() in the database (weighted majority of the last
// 30 minutes); a status only one reporter has given is marked "not confirmed yet".

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { StatusCircle, StatusWord } from '@/components/checkpoint-badge';
import { Body, GlassButton, ListRow, TabScreen, ltr } from '@/components/ui';
import { useAgo, type Overview } from '@/components/checkpoint-badge';
import { confidence, reportsKey } from '@/lib/checkpoints';
import { useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export default function Checkpoints() {
  const { t, lang } = useT();
  const ago = useAgo();
  const [rows, setRows] = useState<Overview[] | null>(null);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('checkpoint_overview');
    // Only the Ramallah - Nablus road for now; the whole West Bank comes with the new tab.
    setRows(((data as (Overview & { road_order: number | null })[] | null) ?? []).filter((r) => r.road_order != null));
    setNow(new Date());
  }, []);

  // Fresh on every visit, and every minute while the tab is open.
  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, 60_000);
      return () => clearInterval(timer);
    }, [load]),
  );

  const newest = rows?.map((r) => r.last_report_at).filter(Boolean).sort().pop() ?? null;

  return (
    <TabScreen
      title={t('tabCheckpoints')}
      action={<GlassButton icon="mapTrifold" label={t('checkpointsMap')} onPress={() => router.push('/checkpoints/map')} />}
    >
      <Body muted small>
        {t('onTheRoad')}
        {newest ? ` · ${t('updatedAgo')} ${ago(newest, now)}` : ''}
      </Body>
      <View>
        {rows?.map((r, i) => (
          <ListRow
            key={r.id}
            last={i === rows.length - 1}
            leading={<StatusCircle status={r.status} />}
            title={lang === 'ar' ? r.name_ar : r.name_en}
            subtitle={
              r.last_report_at
                ? `${r.reports_30m > 0 ? `${ltr(r.reports_30m)} ${t(reportsKey(r.reports_30m))} · ` : ''}${ago(r.last_report_at, now)}${
                    confidence(r) === 'unconfirmed' ? ` · ${t('statusUnconfirmed')}` : ''
                  }`
                : t('noRecentReports')
            }
            trailing={r.status ? <StatusWord status={r.status} /> : undefined}
            onPress={() => router.push({ pathname: '/checkpoints/[id]', params: { id: r.id } })}
          />
        ))}
      </View>
    </TabScreen>
  );
}
