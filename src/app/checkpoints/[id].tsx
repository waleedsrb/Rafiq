// One checkpoint: its status, the last hour of reports, and one tap to report it.

import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { STATUS_LOOK, StatusCircle, StatusWord, useAgo, type Overview } from '@/components/checkpoint-badge';
import { Body, Button, Label, ListRow, Screen, SectionTitle, TextLink, Title, ltr, useFont } from '@/components/ui';
import { STATUSES, type CheckpointStatus } from '@/lib/checkpoints';
import { formatTime } from '@/lib/format';
import type { StringKey } from '@/i18n/strings';
import { useSession, useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { colors, space } from '@/theme/tokens';

type Report = { created_at: string; status: CheckpointStatus; source: 'passenger' | 'driver' | 'channel' };

export default function CheckpointDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useT();
  const { f } = useFont();
  const ago = useAgo();
  const [cp, setCp] = useState<Overview | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [sending, setSending] = useState<CheckpointStatus | null>(null);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const { session } = useSession();
  const [following, setFollowing] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const [overview, recent, follow] = await Promise.all([
      supabase.rpc('checkpoint_overview'),
      supabase.rpc('checkpoint_recent', { p_checkpoint_id: id }),
      supabase.from('checkpoint_follows').select('checkpoint_id').eq('checkpoint_id', id).maybeSingle(),
    ]);
    setFollowing(!!follow.data);
    setCp(((overview.data as Overview[] | null) ?? []).find((r) => r.id === id) ?? null);
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
    }
  }

  if (!cp) return <Screen back>{null}</Screen>;

  return (
    <Screen
      back
      scroll
      footer={
        <View style={{ gap: space.sm }}>
          <Label>{t('howIsItNow')}</Label>
          <View style={styles.buttons}>
            {STATUSES.map((s) => (
              <View key={s} style={{ flex: 1 }}>
                <Button variant="secondary" label={t(STATUS_LOOK[s].word)} onPress={() => report(s)} loading={sending === s} disabled={!!sending} />
              </View>
            ))}
          </View>
          {note ? (
            <Body small error={note.error} muted={!note.error} style={{ textAlign: 'center' }}>
              {note.text}
            </Body>
          ) : null}
        </View>
      }
    >
      <Body muted small>
        {t('onTheRoad')}
      </Body>
      <Title>{lang === 'ar' ? cp.name_ar : cp.name_en}</Title>
      <View style={styles.statusRow}>
        <StatusCircle status={cp.status} size={32} />
        <StatusWord status={cp.status} />
        {cp.last_report_at ? <Body muted small>· {ago(cp.last_report_at, now)}</Body> : null}
      </View>

      {following !== null ? (
        <ListRow
          last
          icon="bell"
          title={t(following ? 'followingCheckpoint' : 'followCheckpoint')}
          subtitle={t('followCheckpointNote')}
          trailing={<TextLink label={t(following ? 'unfollow' : 'follow')} onPress={toggleFollow} />}
        />
      ) : null}

      <View style={styles.sectionHead}>
        <SectionTitle>{t('lastHour')}</SectionTitle>
        <Body muted small>
          {ltr(reports.length)} {t('reportsWord')}
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

const styles = StyleSheet.create({
  buttons: { flexDirection: 'row', gap: space.sm },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: space.md },
  time: { width: 48, fontSize: 15, color: colors.ink },
});
