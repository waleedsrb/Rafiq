// ID checks (slice 5). The rules live in the database (see 20261107080000_verification.sql);
// this file only loads the current state and uploads photos.

import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { base64ToBytes } from '@/lib/base64';
import { checkStatus, type CheckKind, type CheckStatus, type LastRequest, type PhotoSlot } from '@/lib/check-status';
import { supabase } from '@/lib/supabase';

export { PHOTO_SLOTS, type CheckKind, type CheckState, type CheckStatus, type PhotoSlot } from '@/lib/check-status';

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
    setStatus(
      checkStatus({
        kind,
        idVerifiedAt: profileRes.data?.id_verified_at ?? null,
        car: carRes.data ? { verifiedAt: carRes.data.verified_at ?? null } : null,
        last: lastRes.data as LastRequest | null,
      }),
    );
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
