// Checkpoints tab: every checkpoint on the road with its current status.
// The status comes from checkpoint_overview() in the database (majority of the last 30 minutes).

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { StatusCircle, StatusWord } from '@/components/checkpoint-badge';
import { Body, Dock, GlassButton, ListRow, Screen, Title, TopBar, ltr } from '@/components/ui';
import { useAgo, type Overview } from '@/components/checkpoint-badge';
import { useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export default function Checkpoints() {
  const { t, lang } = useT();
  const ago = useAgo();
  const [rows, setRows] = useState<Overview[] | null>(null);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('checkpoint_overview');
    setRows((data as Overview[] | null) ?? []);
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
    <Screen
      scroll
      top={<TopBar end={<GlassButton icon="mapPin" label={t('checkpointsMap')} onPress={() => router.push('/checkpoints/map')} />} />}
      overlay={<Dock current="checkpoints" />}
    >
      <Title>{t('tabCheckpoints')}</Title>
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
                ? `${r.reports_30m > 0 ? `${ltr(r.reports_30m)} ${t('reportsWord')} · ` : ''}${ago(r.last_report_at, now)}`
                : t('noRecentReports')
            }
            trailing={r.status ? <StatusWord status={r.status} /> : undefined}
            onPress={() => router.push({ pathname: '/checkpoints/[id]', params: { id: r.id } })}
          />
        ))}
      </View>
    </Screen>
  );
}
