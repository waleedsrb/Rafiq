// Notifications: every push you were sent, also when the phone was off or push was
// switched off. Messages stay unread until you open one, swipe it to Read, or tap
// "Mark all as read". Tapping a message opens its page straight away; marking it read
// happens in the background. Swiping the other way deletes it, with a few seconds to undo.
//
// Every change shows on screen at once and is put back if the server says no
// ("optimistic update"), so nothing waits on the network.

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, LinearTransition, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NotificationSwipe } from '@/components/notification-swipe';
import { BackButton, Body, GlassButton, IconCircle, Label, ListRow, Screen, Title, TopBar, useFont } from '@/components/ui';
import { formatDay, shortTime } from '@/lib/format';
import { tapFeel } from '@/lib/haptics';
import { applyInboxChange, groupInbox, inboxIcon, needsYou, type InboxChange, type InboxGroup, type Notification } from '@/lib/inbox';
import { inboxChanged } from '@/lib/notifications';
import { useSession, useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { openTrip } from '@/lib/trip-layer';
import { colors, radii, sizes, space } from '@/theme/tokens';

const GROUP_LABEL = { today: 'today', week: 'thisWeek', earlier: 'earlier' } as const satisfies Record<InboxGroup, string>;
/** How long "Undo" stays before a delete is sent to the server. */
const UNDO_MS = 4000;

type Failure = 'notificationLoadFailed' | 'notificationActionFailed';

export default function Notifications() {
  const { t, lang } = useT();
  const { session } = useSession();
  const userId = session?.user.id;
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<Notification[] | null>(null);
  const [error, setError] = useState<Failure | null>(null);
  // The one delete still waiting out its Undo time.
  const [undo, setUndo] = useState<Notification | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoRow = useRef<Notification | null>(null);
  const request = useRef(0);

  const change = (c: InboxChange) => setRows((current) => current && applyInboxChange(current, c));

  const load = useCallback(async () => {
    const version = ++request.current;
    if (!userId) { setRows([]); return; }
    const { data, error: failure } = await supabase
      .from('notifications')
      .select('id, kind, title, body, url, created_at, read_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (version !== request.current) return;
    if (failure) { setError('notificationLoadFailed'); return; }
    setError(null);
    // A message waiting out its Undo stays hidden even if the server still has it.
    const hidden = undoRow.current?.id;
    setRows(((data as Notification[] | null) ?? []).filter((n) => n.id !== hidden));
  }, [userId]);

  /** Send the waiting delete now (its Undo time ran out, or you left the page). */
  const commitDelete = useCallback(() => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = null;
    const n = undoRow.current;
    undoRow.current = null;
    setUndo(null);
    if (!n || !userId) return;
    supabase.rpc('delete_notification', { p_id: n.id }).then(({ error: failure }) => {
      if (failure) {
        change({ type: 'restore', row: n });
        setError('notificationActionFailed');
      }
      inboxChanged(userId);
    });
  }, [userId]);

  // Coming back to the page refreshes the list quietly: no spinner, you keep your place.
  useFocusEffect(useCallback(() => {
    void load();
    return () => { ++request.current; commitDelete(); };
  }, [load, commitDelete]));
  useEffect(() => () => commitDelete(), [commitDelete]);

  const markRead = (n: Notification) => {
    if (n.read_at || !userId) return;
    change({ type: 'read', id: n.id, readAt: new Date().toISOString() });
    supabase.rpc('mark_notification_read', { p_id: n.id }).then(({ error: failure }) => {
      if (failure) {
        change({ type: 'unread', id: n.id });
        setError('notificationActionFailed');
        return;
      }
      inboxChanged(userId);
    });
  };

  const markAllRead = () => {
    if (!userId) return;
    tapFeel();
    change({ type: 'readAll', readAt: new Date().toISOString() });
    supabase.rpc('mark_notifications_read').then(({ error: failure }) => {
      if (failure) { setError('notificationActionFailed'); void load(); return; }
      inboxChanged(userId);
    });
  };

  const remove = (n: Notification) => {
    commitDelete(); // one Undo at a time: an earlier delete goes through now
    change({ type: 'delete', id: n.id });
    undoRow.current = n;
    setUndo(n);
    undoTimer.current = setTimeout(commitDelete, UNDO_MS);
  };

  const undoDelete = () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = null;
    const n = undoRow.current;
    undoRow.current = null;
    setUndo(null);
    if (n) change({ type: 'restore', row: n });
  };

  /** Open first; the read mark follows in the background and never holds you up. */
  const open = (n: Notification) => {
    if (n.url) openUrl(n.url);
    markRead(n);
  };

  const now = new Date();
  const when = (iso: string) => {
    const d = new Date(iso);
    return d.toDateString() === now.toDateString() ? shortTime(d) : `${formatDay(d, lang)} · ${shortTime(d)}`;
  };
  const anyUnread = rows?.some((n) => !n.read_at) ?? false;
  const layout = reduced ? undefined : LinearTransition.duration(220);

  return (
    <GestureHandlerRootView style={styles.flex}>
      <Screen
        scroll
        top={
          <TopBar
            start={<BackButton />}
            end={
              <View style={styles.topEnd}>
                {anyUnread ? <GlassButton icon="checks" label={t('notificationMarkAllRead')} onPress={markAllRead} /> : null}
                <GlassButton icon="gear" label={t('notificationSettings')} onPress={() => router.push('/settings')} />
              </View>
            }
          />
        }
        overlay={
          undo ? (
            <Animated.View
              entering={reduced ? undefined : FadeIn.duration(160)}
              exiting={reduced ? undefined : FadeOut.duration(160)}
              style={[styles.toast, { bottom: Math.max(insets.bottom, space.md) }]}
              accessibilityLiveRegion="polite"
            >
              <UndoBar label={t('notificationDeleted')} action={t('notificationUndo')} onUndo={undoDelete} />
            </Animated.View>
          ) : null
        }
      >
        <Title>{t('notificationsTitle')}</Title>

        {error ? (
          <Pressable accessibilityRole="button" onPress={() => { setError(null); void load(); }} style={styles.error}>
            <Body>{t(error)}</Body>
            <Body muted>{t('notificationRetry')}</Body>
          </Pressable>
        ) : null}

        {rows !== null && rows.length === 0 ? (
          <View style={styles.empty}>
            <IconCircle icon="bell" size={56} />
            <Body muted style={{ textAlign: 'center' }}>{t('notificationsEmpty')}</Body>
          </View>
        ) : null}

        {groupInbox(rows ?? [], now).map(({ group, rows: items }) => (
          <Animated.View key={group} layout={layout} style={{ gap: space.xs }}>
            <Label>{t(GROUP_LABEL[group])}</Label>
            <View>
              {items.map((n, i) => (
                <Animated.View key={n.id} layout={layout} exiting={reduced ? undefined : FadeOut.duration(120)}>
                  <InboxRow
                    n={n}
                    subtitle={`${n.body} · ${when(n.created_at)}`}
                    last={i === items.length - 1}
                    onOpen={() => open(n)}
                    onRead={() => markRead(n)}
                    onDelete={() => remove(n)}
                  />
                </Animated.View>
              ))}
            </View>
          </Animated.View>
        ))}
      </Screen>
    </GestureHandlerRootView>
  );
}

function InboxRow({ n, subtitle, last, onOpen, onRead, onDelete }: {
  n: Notification; subtitle: string; last: boolean;
  onOpen: () => void; onRead: () => void; onDelete: () => void;
}) {
  const { t } = useT();
  const { f, rtl } = useFont();
  const unread = !n.read_at;
  return (
    <NotificationSwipe canRead={unread} readLabel={t('notificationRead')} deleteLabel={t('notificationDelete')} onRead={onRead} onDelete={onDelete}>
      {(press) => (
        // Screen readers get the same three choices as actions on the row.
        <View
          accessible
          accessibilityRole="button"
          accessibilityLabel={`${n.title}. ${subtitle}${unread ? `. ${t('unread')}` : ''}`}
          accessibilityActions={[
            { name: 'activate' },
            ...(unread ? [{ name: 'markRead', label: t('notificationMarkRead') }] : []),
            { name: 'delete', label: t('notificationDelete') },
          ]}
          onAccessibilityAction={({ nativeEvent }) => {
            if (nativeEvent.actionName === 'markRead') onRead();
            else if (nativeEvent.actionName === 'delete') onDelete();
            else onOpen();
          }}
        >
          <ListRow
            last={last}
            icon={inboxIcon(n.kind)}
            title={
              <Text style={[styles.title, { fontFamily: unread ? f.medium : f.regular, textAlign: rtl ? 'right' : 'left' }, needsYou(n) && { color: colors.clay }]}>
                {n.title}
              </Text>
            }
            subtitle={subtitle}
            trailing={unread ? <View style={styles.dot} /> : <View style={styles.dotSpace} />}
            onPress={() => press(onOpen)}
          />
        </View>
      )}
    </NotificationSwipe>
  );
}

/** "Notification deleted · Undo" capsule at the bottom of the screen. */
function UndoBar({ label, action, onUndo }: { label: string; action: string; onUndo: () => void }) {
  const { f } = useFont();
  return (
    <View style={styles.toastInner}>
      <Text style={[styles.toastText, { fontFamily: f.regular }]}>{label}</Text>
      <Pressable accessibilityRole="button" onPress={onUndo} hitSlop={space.sm} style={styles.toastAction}>
        <Text style={[styles.toastText, { fontFamily: f.bold }]}>{action}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topEnd: { flexDirection: 'row', gap: space.sm },
  title: { fontSize: 16, lineHeight: 22, color: colors.ink },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.clay },
  dotSpace: { width: 8 },
  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl },
  error: { gap: space.xs, paddingVertical: space.sm, minHeight: sizes.touch, justifyContent: 'center' },
  toast: { position: 'absolute', left: space.screen, right: space.screen },
  toastInner: {
    minHeight: sizes.button,
    borderRadius: radii.capsule,
    backgroundColor: colors.ink,
    paddingHorizontal: space.md + space.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  toastText: { fontSize: 15, color: colors.onInk },
  toastAction: { minHeight: sizes.touch, justifyContent: 'center' },
});

/** A trip opens as the card over this page; anything else is a page of its own. */
function openUrl(url: string) {
  const trip = /^\/trips\/([0-9a-f-]{36})$/i.exec(url);
  if (trip) openTrip(trip[1]);
  else router.push(url as never);
}
