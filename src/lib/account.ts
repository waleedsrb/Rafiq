// Deleting your account, from the phone's side. The database does the real work in
// delete_my_account(); the phone first removes the ID and profile photos it uploaded, because SQL
// isn't allowed to delete stored files.

import { removeAllAvatars } from './avatar';
import { forgetPush } from './push';
import { supabase } from './supabase';

export async function deleteMyAccount(userId: string): Promise<{ ok: boolean; midTrip?: boolean }> {
  // Not in the middle of a trip (the database refuses too; asking first keeps the photos).
  const { error: check } = await supabase.rpc('delete_my_account_check');
  if (check?.message.includes('Finish your trip first')) return { ok: false, midTrip: true };

  // 1. ID photos live in the private "verification" bucket under "<user id>/".
  const bucket = supabase.storage.from('verification');
  const { data: files } = await bucket.list(userId, { limit: 100 });
  if (files && files.length > 0) {
    await bucket.remove(files.map((f) => `${userId}/${f.name}`));
  }

  // 1b. The profile photo, in the private "avatars" bucket, same folder layout.
  await removeAllAvatars(userId);

  // 2. Stop this phone's pushes while we are still signed in.
  await forgetPush();

  // 3. Cancel what is open, anonymise the profile, delete the sign-in.
  const { error } = await supabase.rpc('delete_my_account');
  if (error) return { ok: false, midTrip: error.message.includes('Finish your trip first') };

  // 4. The sign-in no longer exists on the server, so just forget it on the phone.
  await supabase.auth.signOut({ scope: 'local' });
  return { ok: true };
}
