// Deleting your account, from the phone's side. The database does the real work in
// delete_my_account(); the phone then removes the ID and profile photos it uploaded, because SQL
// isn't allowed to delete stored files.
//
// Order matters: the files go only AFTER the database step succeeds. If they went first and
// delete_my_account() then refused (a trip in progress, a rule that blocks it), the account
// would live on with its photos gone: a profile pointing at a missing picture, and no ID photos
// left for an admin to compare. The access token stays valid for a while after the sign-in is
// deleted, so the storage calls below still pass the "your own folder" rules.

import { removeAllAvatars } from './avatar';
import { forgetPush } from './push';
import { supabase } from './supabase';

async function removeIdPhotos(userId: string) {
  // ID photos live in the private "verification" bucket under "<user id>/".
  const bucket = supabase.storage.from('verification');
  const { data: files } = await bucket.list(userId, { limit: 100 });
  if (files && files.length > 0) {
    await bucket.remove(files.map((f) => `${userId}/${f.name}`));
  }
}

export async function deleteMyAccount(userId: string): Promise<{ ok: boolean; midTrip?: boolean }> {
  // Not in the middle of a trip (the database refuses too; asking first is just quicker).
  const { error: check } = await supabase.rpc('delete_my_account_check');
  if (check?.message.includes('Finish your trip first')) return { ok: false, midTrip: true };

  // 1. Stop this phone's pushes while we are still signed in.
  await forgetPush();

  // 2. Cancel what is open, anonymise the profile, delete the sign-in.
  const { error } = await supabase.rpc('delete_my_account');
  if (error) return { ok: false, midTrip: error.message.includes('Finish your trip first') };

  // 3. Now the photos: ID photos, then the profile photo ("avatars" bucket, same folder layout).
  //    Best effort: the account is already gone, so a failure here must not undo the success.
  try {
    await removeIdPhotos(userId);
    await removeAllAvatars(userId);
  } catch {
    // Left-over files belong to a deleted account; nobody but admins can open them.
  }

  // 4. The sign-in no longer exists on the server, so just forget it on the phone.
  await supabase.auth.signOut({ scope: 'local' });
  return { ok: true };
}
