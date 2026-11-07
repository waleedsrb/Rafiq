// The bell: how many messages you haven't opened yet, kept live.

import { useCallback, useEffect, useState } from 'react';

import { useSession } from './session';
import { supabase } from './supabase';

/** Unread messages in your inbox. Updates the moment a new one arrives. */
export function useUnreadCount(): { unread: number; refresh: () => void } {
  const { session } = useSession();
  const userId = session?.user.id;
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(() => {
    if (!userId) return;
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null)
      .then(({ count }) => setUnread(count ?? 0));
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    refresh();
    // Realtime still applies Row Level Security, so this only hears your own rows.
    const channel = supabase
      .channel(`notifications:${userId}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  return { unread, refresh };
}
