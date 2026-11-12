// One checkpoint: its status (and whether it's confirmed), the last hour of reports, and
// press-and-hold to report it (a stray tap sends nothing).

import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { StatusCircle, StatusWord, useAgo, type Overview } from '@/components/checkpoint-badge';
import { FollowBell } from '@/components/follow-bell';
import { HoldToReport } from '@/components/hold-to-report';
import { Skeleton, SkeletonGroup } from '@/components/skeleton';
import { Body, Label, ListRow, Screen, SectionTitle, Title, ltr, useFont } from '@/components/ui';
import { STATUSES, confidence, governorate, reportsKey, type CheckpointStatus } from '@/lib/checkpoints';
import { formatTime } from '@/lib/format';
import { warnFeel } from '@/lib/haptics';
import type { StringKey } from '@/i18n/strings';
import { useSession, useT } from '@/lib/session';
import { cache } from '@/lib/cache';
import { checkpointsQuery, followsQuery } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import { makeStyles } from '@/theme/theme';
import { radii, space } from '@/theme/tokens';

type Report = { created_at: string; status: CheckpointStatus; source: 'passenger' | 'driver' | 'channel' };

export default function CheckpointDetail() {
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useT();
  const { f } = useFont();
  const ago = useAgo();
  const { session } = useSession();
  // Opened from the Checkpoints tab, which already has every status: draw it at once.
  const [cp, setCp] = useState<Overview | null>(() => cache.get<Overview[]>(checkpointsQuery().key)?.find((r) => r.id === id) ?? null);
  const [reports, setReports] = useState<Report[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [sending, setSending] = useState<CheckpointStatus | null>(null);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [following, setFollowing] = useState<boolean | null>(() => {
    const mine = session ? cache.get<string[]>(followsQuery(session.user.id).key) : undefined;
    return mine && id ? mine.includes(id) : null;
  });

  const load = useCallback(async () => {
    if (!id) return;
    const [overview, recent, follow] = await Promise.all([
      supabase.rpc('checkpoint_overview'),
      supabase.rpc('checkpoint_recent', { p_checkpoint_id: id }),
      supabase.from('checkpoint_follows').select('checkpoint_id').eq('checkpoint_id', id).maybeSingle(),
    ]);
    setFollowing(!!follow.data);
    const all = (overview.data as Overview[] | null) ?? null;
    if (all) cache.set(checkpointsQuery().key, all); // the tab shows the same fresh answer
    setCp((all ?? []).find((r) => r.id === id) ?? null);
    setReports((recent.data as Report[] | null) ?? []);
    setNow(new Date());
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, 60_000);
      return () => clearInterval(timer);
    }, [load]),
  );

  async function report(status: CheckpointStatus) {
    if (!id) return;
    setSending(status);
    setNote(null);
    const { error } = await supabase.from('checkpoint_reports').insert({ checkpoint_id: id, status });
    setSending(null);
    if (error) {
      warnFeel();
      return setNote({ text: error.message.includes('just reported') ? t('justReported') : t('somethingWrong'), error: true });
    }
    setNote({ text: t('thanksReport') });
    await load();
  }

  // Follow: a push when this checkpoint's status changes.
  async function toggleFollow() {
    if (!id || !session || following === null) return;
    const next = !following;
    setFollowing(next); // feels instant; put it back if saving fails
    const { error } = next
      ? await supabase.from('checkpoint_follows').insert({ user_id: session.user.id, checkpoint_id: id })
      : await supabase.from('checkpoint_follows').delete().eq('checkpoint_id', id).eq('user_id', session.user.id);
    if (error && error.code !== '23505') {
      setFollowing(!next);
      setNote({ text: t('somethingWrong'), error: true });
      return;
    }
    // The tab's "Following" group changes with it.
    cache.set<string[]>(followsQuery(session.user.id).key, (old) =>
      next ? [...(old ?? []).filter((x) => x !== id), id] : (old ?? []).filter((x) => x !== id),
    );
  }

  if (!cp)
    return (
      <Screen back>
        <SkeletonGroup style={{ gap: space.md }}>
          <Skeleton width={90} height={12} />
          <Skeleton width="65%" height={30} radius={10} />
          <Skeleton width={140} height={32} radius={16} />
          <Skeleton width="100%" height={120} radius={radii.container} style={{ marginTop: space.md }} />
        </SkeletonGroup>
      </Screen>
    );

  return (
    <Screen
      back
      scroll
      footer={
        <View style={{ gap: space.sm }}>
          <Label>{t('howIsItNow')}</Label>
          <View style={styles.buttons}>
            {STATUSES.map((s) => (
              <HoldToReport
                key={s}
                style={{ flex: 1 }}
                status={s}
                onComplete={report}
                onTooShort={() => setNote({ text: t('holdLonger') })}
                busy={sending === s}
                disabled={!!sending && sending !== s}
              />
            ))}
          </View>
          {!note ? (
            <Body small muted style={{ textAlign: 'center' }}>
              {t('holdToReport')}
            </Body>
          ) : null}
          {note ? (
            <Body small error={note.error} muted={!note.error} style={{ textAlign: 'center' }}>
              {note.text}
            </Body>
          ) : null}
        </View>
      }
    >
      <Body muted small>
        {governorate(cp.governorate, lang).name ?? t('checkpointsOtherArea')}
      </Body>
      <Title>{lang === 'ar' ? cp.name_ar : cp.name_en}</Title>
      <View style={styles.statusRow}>
        <StatusCircle status={cp.status} size={32} />
        <StatusWord status={cp.status} />
        {cp.last_report_at ? <Body muted small>· {ago(cp.last_report_at, now)}</Body> : null}
      </View>
      {confidence(cp) ? (
        <Body small muted={confidence(cp) === 'unconfirmed'}>
          {t(confidence(cp) === 'confirmed' ? 'statusConfirmed' : 'statusUnconfirmed')}
        </Body>
      ) : null}

      {following !== null ? (
        <ListRow
          last
          leading={<FollowBell following={following} onToggle={toggleFollow} />}
          title={t(following ? 'followingCheckpoint' : 'followCheckpoint')}
          subtitle={t('followCheckpointNote')}
        />
      ) : null}

      <View style={styles.sectionHead}>
        <SectionTitle>{t('lastHour')}</SectionTitle>
        <Body muted small>
          {ltr(reports.length)} {t(reportsKey(reports.length))}
        </Body>
      </View>
      {reports.length === 0 ? <Body muted>{t('noReportsYet')}</Body> : null}
      <View>
        {reports.map((r, i) => (
          <ListRow
            key={`${r.created_at}-${i}`}
            last={i === reports.length - 1}
            leading={<Text style={[styles.time, { fontFamily: f.bold }]}>{ltr(formatTime(new Date(r.created_at), 'en'))}</Text>}
            title={<StatusWord status={r.status} />}
            subtitle={t(`source_${r.source}` as StringKey)}
          />
        ))}
      </View>
      <Body muted small>
        {t('statusRule')}
      </Body>
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  buttons: { flexDirection: 'row', gap: space.sm, zIndex: -1 }, // the growing circle stays behind the text around it
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: space.md },
  time: { width: 48, fontSize: 15, color: colors.ink },
}));
