// The bell: how many messages you haven't opened yet, kept live.

import { useCallback, useEffect, useRef, useState } from 'react';

import { useSession } from './session';
import { supabase } from './supabase';

// Successful inbox actions refresh every mounted bell, even when Realtime is delayed
// or a DELETE event cannot be filtered by user_id (the old row may contain only its id).
const listeners = new Set<(userId: string) => void>();
export function inboxChanged(userId: string) {
  for (const listener of listeners) listener(userId);
}

/** Unread messages in your inbox. Updates when a message arrives or you read/delete one. */
export function useUnreadCount(): { unread: number; refresh: () => void } {
  const { session } = useSession();
  const userId = session?.user.id;
  const [unread, setUnread] = useState(0);
  const request = useRef(0);

  const refresh = useCallback(() => {
    const version = ++request.current;
    if (!userId) { setUnread(0); return; }
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null)
      .then(({ count, error }) => {
        if (version === request.current && !error) setUnread(count ?? 0);
      }, () => { /* Keep the last known count on a transport failure. */ });
  }, [userId]);

  useEffect(() => {
    setUnread(0);
    refresh();
    if (!userId) return;
    const changed = (id: string) => { if (id === userId) refresh(); };
    listeners.add(changed);
    const channel = supabase
      .channel(`notifications:${userId}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, refresh)
      .subscribe();
    return () => {
      ++request.current;
      listeners.delete(changed);
      supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  return { unread, refresh };
}
