// Checkpoints tab: every checkpoint in the West Bank with its current status.
// The status comes from checkpoint_overview() in the database (weighted majority of the last
// 30 minutes); a status only one reporter has given is marked "not confirmed yet".
//
// The list is long (the whole West Bank), so the useful part comes first:
// - a search field (either name, vowel marks and spelling forms don't matter),
// - the ones you follow (bell on a checkpoint's page),
// - the ones someone reported in the last 2 hours, newest first,
// - then all of them by governorate, north to south.

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { StatusCircle, StatusWord, useAgo, type Overview } from '@/components/checkpoint-badge';
import { Icon } from '@/components/icon';
import { SkeletonList } from '@/components/skeleton';
import { Body, GlassButton, ListRow, SectionTitle, TabScreen, inputAlign, ltr, useFont } from '@/components/ui';
import { byGovernorate, confidence, matchesQuery, reportsKey } from '@/lib/checkpoints';
import { useSession, useT } from '@/lib/session';
import { checkpointsQuery, followsQuery } from '@/lib/queries';
import { useCached } from '@/lib/use-cached';
import { makeStyles, useTheme } from '@/theme/theme';

export default function Checkpoints() {
  const { c: colors } = useTheme();
  const styles = useStyles();
  const { t, lang } = useT();
  const { session } = useSession();
  const { f, rtl } = useFont();
  const ago = useAgo();
  // From the cache (src/lib/cache.ts), so the list is there as the tab opens; the tabs
  // prefetch it at start, and each checkpoint's page opens from the same answer.
  const overview = useCached(checkpointsQuery());
  const followed_ = useCached(session ? followsQuery(session.user.id) : null);
  const rows = overview.data ?? null;
  const follows = useMemo(() => new Set(followed_.data ?? []), [followed_.data]);
  const [q, setQ] = useState('');
  const [now, setNow] = useState(() => new Date());
  const { refresh: refreshOverview } = overview;
  const { refresh: refreshFollows } = followed_;

  // Fresh on every visit (useCached), and every minute while the tab is open.
  useFocusEffect(
    useCallback(() => {
      setNow(new Date());
      const timer = setInterval(() => {
        void refreshOverview().then(() => setNow(new Date()));
        void refreshFollows();
      }, 60_000);
      return () => clearInterval(timer);
    }, [refreshOverview, refreshFollows]),
  );

  const all = rows ?? [];
  const found = useMemo(() => all.filter((r) => matchesQuery(r, q)), [all, q]);
  const searching = q.trim().length > 0;
  const followed = found.filter((r) => follows.has(r.id));
  const recent = found.filter((r) => r.last_report_at && !follows.has(r.id)).sort((a, b) => (b.last_report_at ?? '').localeCompare(a.last_report_at ?? ''));
  const groups = useMemo(() => byGovernorate(found, lang), [found, lang]);
  const newest = all.map((r) => r.last_report_at).filter(Boolean).sort().pop() ?? null;

  const row = (r: Overview, last: boolean) => (
    <ListRow
      key={r.id}
      last={last}
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
  );
  const section = (title: string, list: Overview[]) =>
    list.length ? (
      <View key={title}>
        <SectionTitle>{title}</SectionTitle>
        {list.map((r, i) => row(r, i === list.length - 1))}
      </View>
    ) : null;

  return (
    <TabScreen
      title={t('tabCheckpoints')}
      action={<GlassButton icon="mapTrifold" label={t('checkpointsMap')} onPress={() => router.push('/checkpoints/map')} />}
    >
      <Body muted small>
        {t('checkpointsAllWestBank').replace('{n}', ltr(all.length))}
        {newest ? ` · ${t('updatedAgo')} ${ago(newest, now)}` : ''}
      </Body>
      <View style={[styles.search, { flexDirection: 'row' }]}>
        <Icon name="search" size={18} color={colors.inkSecondary} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={t('searchCheckpoints')}
          placeholderTextColor={colors.inkSecondary}
          accessibilityLabel={t('searchCheckpoints')}
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={[styles.input, { fontFamily: f.regular, textAlign: inputAlign(rtl) }]}
        />
        {searching ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('clear')} onPress={() => setQ('')} hitSlop={14}>
            <Icon name="x" size={16} color={colors.inkSecondary} />
          </Pressable>
        ) : null}
      </View>

      {rows && searching && found.length === 0 ? (
        <Body muted small style={{ marginTop: 12 }}>
          {t('noCheckpointFound')}
        </Body>
      ) : null}
      {rows === null && !overview.failed ? <SkeletonList rows={6} /> : null}
      {section(t('checkpointsFollowing'), followed)}
      {searching ? null : section(t('checkpointsReported'), recent)}
      {groups.map((g) => section(g.name ?? t('checkpointsOtherArea'), g.rows))}
    </TabScreen>
  );
}

const useStyles = makeStyles((colors) => ({
  search: {
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 14,
    backgroundColor: colors.fill,
    marginTop: 12,
  },
  input: { flex: 1, fontSize: 16, color: colors.ink, paddingVertical: 0 },
}));
