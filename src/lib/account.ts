// Deleting your account, from the phone's side. The database does the real work in
// delete_my_account(); the phone first removes the ID photos it uploaded, because SQL
// isn't allowed to delete stored files.

import { forgetPush } from './push';
import { supabase } from './supabase';

export async function deleteMyAccount(userId: string): Promise<{ ok: boolean }> {
  // 1. ID photos live in the private "verification" bucket under "<user id>/".
  const bucket = supabase.storage.from('verification');
  const { data: files } = await bucket.list(userId, { limit: 100 });
  if (files && files.length > 0) {
    await bucket.remove(files.map((f) => `${userId}/${f.name}`));
  }

  // 2. Stop this phone's pushes while we are still signed in.
  await forgetPush();

  // 3. Cancel what is open, anonymise the profile, delete the sign-in.
  const { error } = await supabase.rpc('delete_my_account');
  if (error) return { ok: false };

  // 4. The sign-in no longer exists on the server, so just forget it on the phone.
  await supabase.auth.signOut({ scope: 'local' });
  return { ok: true };
}
