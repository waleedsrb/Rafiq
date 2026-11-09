// Notifications: every push you were sent, also when the phone was off or push was
// switched off. Opening the screen marks them read; tapping one opens its screen.

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Body, GlassButton, IconCircle, Label, ListRow, Screen, Title, TopBar, BackButton, useFont } from '@/components/ui';
import { groupInbox, inboxIcon, needsYou, type InboxGroup, type Notification } from '@/lib/inbox';
import { formatDay, shortTime } from '@/lib/format';
import { useT } from '@/lib/session';
import { openTrip } from '@/lib/trip-layer';
import { supabase } from '@/lib/supabase';
import { colors, space } from '@/theme/tokens';

const GROUP_LABEL = { today: 'today', week: 'thisWeek', earlier: 'earlier' } as const satisfies Record<InboxGroup, string>;

export default function Notifications() {
  const { t, lang } = useT();
  const { f, rtl } = useFont();
  const [rows, setRows] = useState<Notification[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      supabase
        .from('notifications')
        .select('id, kind, title, body, url, created_at, read_at')
        .order('created_at', { ascending: false })
        .limit(100)
        .then(({ data }) => {
          if (!live) return;
          // Show what was unread as unread this time, then mark it all read.
          setRows((data as Notification[] | null) ?? []);
          supabase.rpc('mark_notifications_read');
        });
      return () => {
        live = false;
      };
    }, []),
  );

  const now = new Date();
  const when = (iso: string) => {
    const d = new Date(iso);
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay ? shortTime(d) : `${formatDay(d, lang)} · ${shortTime(d)}`;
  };

  return (
    <Screen
      scroll
      top={
        <TopBar
          start={<BackButton />}
          end={<GlassButton icon="gear" label={t('notificationSettings')} onPress={() => router.push('/settings')} />}
        />
      }
    >
      <Title>{t('notificationsTitle')}</Title>

      {rows !== null && rows.length === 0 ? (
        <View style={styles.empty}>
          <IconCircle icon="bell" size={56} />
          <Body muted style={{ textAlign: 'center' }}>
            {t('notificationsEmpty')}
          </Body>
        </View>
      ) : null}

      {groupInbox(rows ?? [], now).map(({ group, rows: items }) => (
        <View key={group} style={{ gap: space.xs }}>
          <Label>{t(GROUP_LABEL[group])}</Label>
          <View>
            {items.map((n, i) => (
              <ListRow
                key={n.id}
                last={i === items.length - 1}
                icon={inboxIcon(n.kind)}
                title={
                  <Text
                    style={[
                      styles.title,
                      { fontFamily: f.medium, textAlign: rtl ? 'right' : 'left' },
                      needsYou(n) && { color: colors.clay },
                    ]}
                  >
                    {n.title}
                  </Text>
                }
                subtitle={`${n.body} · ${when(n.created_at)}`}
                trailing={n.read_at ? <View style={styles.dotSpace} /> : <View style={styles.dot} accessibilityLabel={t('unread')} />}
                onPress={n.url ? () => openUrl(n.url!) : undefined}
              />
            ))}
          </View>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 16, lineHeight: 22, color: colors.ink },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.clay },
  dotSpace: { width: 8 },
  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl },
});

/** A trip opens as the card over this page; anything else is a page of its own. */
function openUrl(url: string) {
  const trip = /^\/trips\/([0-9a-f-]{36})$/i.exec(url);
  if (trip) openTrip(trip[1]);
  else router.push(url as never);
}
