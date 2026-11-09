// Visiting the inbox preserves unread messages. Opening one marks only that message
// read; swiping reveals explicit Read/Delete actions without opening its destination.

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Body, GlassButton, IconCircle, Label, ListRow, Screen, Title, TopBar, BackButton, useFont } from '@/components/ui';
import { NotificationSwipe } from '@/components/notification-swipe';
import { applyInboxChange, groupInbox, inboxIcon, needsYou, type InboxGroup, type Notification } from '@/lib/inbox';
import { formatDay, shortTime } from '@/lib/format';
import { tapFeel } from '@/lib/haptics';
import { inboxChanged } from '@/lib/notifications';
import { useSession, useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { openTrip } from '@/lib/trip-layer';
import { colors, sizes, space } from '@/theme/tokens';

const GROUP_LABEL = { today: 'today', week: 'thisWeek', earlier: 'earlier' } as const satisfies Record<InboxGroup, string>;

export default function Notifications() {
  const { t, lang } = useT();
  const { session } = useSession();
  const userId = session?.user.id;
  const [rows, setRows] = useState<Notification[] | null>(null);
  const [error, setError] = useState<'notificationLoadFailed' | 'notificationActionFailed' | null>(null);
  const [busy, setBusy] = useState<ReadonlySet<number>>(new Set());
  const pending = useRef(new Set<number>());
  const request = useRef(0);
  const focusVersion = useRef(0);
  const focused = useRef(false);
  const activeUser = useRef(userId);
  activeUser.current = userId;

  const load = useCallback(async () => {
    const version = ++request.current;
    setError(null);
    if (!userId) { setRows([]); return; }
    try {
      const { data, error: failure } = await supabase
        .from('notifications')
        .select('id, kind, title, body, url, created_at, read_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (version !== request.current) return;
      if (failure) throw failure;
      setRows((data as Notification[] | null) ?? []);
    } catch {
      if (version === request.current) setError('notificationLoadFailed');
    }
  }, [userId]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    ++focusVersion.current;
    setRows(null);
    void load();
    return () => { focused.current = false; ++focusVersion.current; ++request.current; };
  }, [load]));

  const act = async (n: Notification, action: 'read' | 'delete', open = false) => {
    if (!userId || pending.current.has(n.id)) return;
    const version = focusVersion.current;
    const isCurrent = () => activeUser.current === userId && focused.current && focusVersion.current === version;
    pending.current.add(n.id);
    setBusy(new Set(pending.current));
    setError(null);
    tapFeel();
    try {
      if (action === 'delete') {
        const { data, error: failure } = await supabase.rpc('delete_notification', { p_id: n.id });
        if (failure || data !== true) throw failure ?? new Error('Notification not deleted');
        if (isCurrent()) {
          ++request.current;
          setRows((current) => current && applyInboxChange(current, { type: 'delete', id: n.id }));
        }
      } else if (!n.read_at) {
        const { data, error: failure } = await supabase.rpc('mark_notification_read', { p_id: n.id });
        if (failure || typeof data !== 'string') throw failure ?? new Error('Notification not read');
        if (isCurrent()) {
          ++request.current;
          setRows((current) => current && applyInboxChange(current, { type: 'read', id: n.id, readAt: data }));
        }
      }
      inboxChanged(userId);
      if (!isCurrent() && focused.current && activeUser.current === userId) void load();
      if (open && n.url && isCurrent()) openUrl(n.url);
    } catch {
      if (isCurrent()) setError('notificationActionFailed');
    } finally {
      pending.current.delete(n.id);
      setBusy(new Set(pending.current));
    }
  };

  const now = new Date();
  const when = (iso: string) => {
    const d = new Date(iso);
    return d.toDateString() === now.toDateString() ? shortTime(d) : `${formatDay(d, lang)} · ${shortTime(d)}`;
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}><Screen scroll top={<TopBar start={<BackButton />} end={<GlassButton icon="gear" label={t('notificationSettings')} onPress={() => router.push('/settings')} />} />}>
      <Title>{t('notificationsTitle')}</Title>
      {rows === null && !error ? <ActivityIndicator color={colors.ink} accessibilityLabel={t('notificationsTitle')} /> : null}
      {error ? <View style={styles.error} accessibilityRole="alert">
        <Body>{t(error)}</Body>
        {rows === null ? <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.retry}><Body>{t('notificationRetry')}</Body></Pressable> : null}
      </View> : null}
      {rows && rows.length > 0 ? <Body muted>{t('notificationSwipeHint')}</Body> : null}
      {rows?.length === 0 ? <View style={styles.empty}>
        <IconCircle icon="bell" size={56} />
        <Body muted style={{ textAlign: 'center' }}>{t('notificationsEmpty')}</Body>
      </View> : null}
      {groupInbox(rows ?? [], now).map(({ group, rows: items }) => (
        <View key={group} style={{ gap: space.xs }}>
          <Label>{t(GROUP_LABEL[group])}</Label>
          {items.map((n, i) => <InboxRow key={n.id} n={n} subtitle={`${n.body} · ${when(n.created_at)}`} last={i === items.length - 1}
            busy={busy.has(n.id)} onOpen={() => void act(n, 'read', true)} onRead={() => void act(n, 'read')} onDelete={() => void act(n, 'delete')} />)}
        </View>
      ))}
    </Screen></GestureHandlerRootView>
  );
}

function InboxRow({ n, subtitle, last, busy, onOpen, onRead, onDelete }: {
  n: Notification; subtitle: string; last: boolean; busy: boolean;
  onOpen: () => void; onRead: () => void; onDelete: () => void;
}) {
  const { t } = useT();
  const { f, rtl } = useFont();
  const content = (onRowPress: () => void) => <View accessible={Platform.OS !== 'web'} accessibilityRole={Platform.OS === 'web' ? undefined : 'button'} onAccessibilityTap={busy ? undefined : onOpen} accessibilityLabel={`${n.title}. ${subtitle}. ${t(n.read_at ? 'notificationRead' : 'unread')}`}
      accessibilityState={{ busy, disabled: busy }} accessibilityActions={[{ name: 'activate' }, ...(!n.read_at ? [{ name: 'markRead', label: t('notificationMarkRead') }] : []), { name: 'delete', label: t('notificationDelete') }]}
      onAccessibilityAction={({ nativeEvent }) => {
        if (busy) return;
        if (nativeEvent.actionName === 'markRead') onRead();
        else if (nativeEvent.actionName === 'delete') onDelete();
        else if (nativeEvent.actionName === 'activate') onOpen();
      }}>
      <ListRow last={last} icon={inboxIcon(n.kind)} title={<Text style={[styles.title, { fontFamily: n.read_at ? f.regular : f.medium, textAlign: rtl ? 'right' : 'left' }, needsYou(n) && { color: colors.clay }]}>{n.title}</Text>}
        subtitle={subtitle} trailing={busy ? <ActivityIndicator size="small" color={colors.ink} /> : n.read_at ? <View style={styles.dotSpace} /> : <View style={styles.dot} />}
        onPress={busy ? undefined : onRowPress} />
    </View>;
  return <NotificationSwipe id={n.id} busy={busy} canRead={!n.read_at} readLabel={t('notificationMarkRead')} deleteLabel={t('notificationDelete')} onRead={onRead} onDelete={onDelete} onOpen={onOpen}>{content}</NotificationSwipe>;
}

const styles = StyleSheet.create({
  title: { fontSize: 16, lineHeight: 22, color: colors.ink },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.clay },
  dotSpace: { width: 8 },
  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl },
  error: { gap: space.sm, paddingVertical: space.md },
  retry: { minHeight: sizes.touch, justifyContent: 'center' },
});


/** Preserve the existing in-place trip card for trip notification destinations. */
function openUrl(url: string) {
  const trip = /^\/trips\/([0-9a-f-]{36})$/i.exec(url);
  if (trip) openTrip(trip[1]);
  else router.push(url as never);
}
