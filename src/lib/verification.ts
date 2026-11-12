// ID checks (slice 5). The rules live in the database (see 20261107080000_verification.sql);
// this file only loads the current state and uploads photos.

import { base64ToBytes } from '@/lib/base64';
import { checkQuery } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import { useCached } from '@/lib/use-cached';
import type { CheckKind, PhotoSlot } from '@/lib/check-status';

export { PHOTO_SLOTS, slotsFor, type CheckKind, type CheckState, type CheckStatus, type PhotoSlot } from '@/lib/check-status';

/**
 * Where someone stands for one kind of check. Reloads whenever the screen comes into view,
 * so coming back from "Your car" or after an admin decision shows the new state. Account
 * loads both kinds, so the ID check page opens with its answer already there.
 */
export function useCheckStatus(userId: string | undefined, kind: CheckKind) {
  const { data, failed, refresh } = useCached(userId ? checkQuery(userId, kind) : null);
  return { status: data ?? null, failed, reload: refresh };
}

/** Upload one photo into the private bucket, under the person's own folder. Returns its path. */
export async function uploadCheckPhoto(userId: string, slot: PhotoSlot, base64: string, mimeType = 'image/jpeg') {
  const ext = mimeType === 'image/png' ? 'png' : 'jpg';
  const path = `${userId}/${slot}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('verification').upload(path, base64ToBytes(base64), { contentType: mimeType });
  if (error) throw error;
  return path;
}
