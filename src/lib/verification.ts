// ID checks (slice 5). The rules live in the database (see 20261107080000_verification.sql);
// this file only loads the current state and uploads photos.

import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { base64ToBytes } from '@/lib/base64';
import { supabase } from '@/lib/supabase';

export type CheckKind = 'passenger' | 'driver';
export type CheckState = 'none' | 'pending' | 'rejected' | 'approved';

/** Which photos each kind of check needs, in order. */
export const PHOTO_SLOTS = {
  passenger: ['id'],
  driver: ['id', 'licence', 'car'],
} as const satisfies Record<CheckKind, readonly string[]>;
export type PhotoSlot = (typeof PHOTO_SLOTS)[CheckKind][number];

export type CheckStatus = {
  state: CheckState;
  reason: string | null; // why it was rejected
  hasCar: boolean; // drivers need a car before asking for a check
};

/**
 * Where someone stands for one kind of check. Reloads whenever the screen comes into view,
 * so coming back from "Your car" or after an admin decision shows the new state.
 */
export function useCheckStatus(userId: string | undefined, kind: CheckKind) {
  const [status, setStatus] = useState<CheckStatus | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const [profileRes, carRes, lastRes] = await Promise.all([
      supabase.from('profiles').select('id_verified_at').eq('id', userId).maybeSingle(),
      supabase.from('driver_details').select('verified_at').eq('driver_id', userId).maybeSingle(),
      supabase
        .from('verifications')
        .select('status, reject_reason')
        .eq('user_id', userId)
        .eq('kind', kind)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const verified = kind === 'passenger' ? !!profileRes.data?.id_verified_at : !!carRes.data?.verified_at;
    const last = lastRes.data as { status: CheckState; reject_reason: string | null } | null;
    setStatus({
      // A driver who changed their car has an old "approved" request but isn't verified any more.
      state: verified ? 'approved' : last && last.status !== 'approved' ? last.status : 'none',
      reason: last?.status === 'rejected' ? last.reject_reason : null,
      hasCar: !!carRes.data,
    });
  }, [userId, kind]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return { status, reload: load };
}

/** Upload one photo into the private bucket, under the person's own folder. Returns its path. */
export async function uploadCheckPhoto(userId: string, slot: PhotoSlot, base64: string, mimeType = 'image/jpeg') {
  const ext = mimeType === 'image/png' ? 'png' : 'jpg';
  const path = `${userId}/${slot}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('verification').upload(path, base64ToBytes(base64), { contentType: mimeType });
  if (error) throw error;
  return path;
}
