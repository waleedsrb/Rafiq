// Profile photos. Optional for now; settings.profile_photo_required can make them required
// (see 20261109000000_profile_photos.sql).
//
// The files live in the private "avatars" bucket. Who may open whose photo is decided by the
// database (can_see_avatar()): by default only you, admins, and the two people on an accepted
// booking. So the phone simply asks for a link; if the answer is no, it shows the initial.

import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { base64ToBytes } from '@/lib/base64';
import { confirm } from '@/lib/dialog';
import type { Picked } from '@/lib/photo-pick';
import { supabase } from '@/lib/supabase';

const BUCKET = 'avatars';
const LINK_SECONDS = 60 * 60;

// Signed links, kept for a little less than they last so a screen never shows a dead one.
const links = new Map<string, { url: string; until: number }>();

export async function avatarUrl(path: string): Promise<string | null> {
  const hit = links.get(path);
  if (hit && hit.until > Date.now()) return hit.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, LINK_SECONDS);
  if (error || !data?.signedUrl) return null; // not allowed to see it (yet), or it's gone
  links.set(path, { url: data.signedUrl, until: Date.now() + (LINK_SECONDS - 300) * 1000 });
  return data.signedUrl;
}

/** The photo link for a path, or null while loading / when there is none / when it's not shown to you. */
export function useAvatarUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(() => (path ? (links.get(path)?.url ?? null) : null));
  useEffect(() => {
    let live = true;
    if (!path) {
      setUrl(null);
      return;
    }
    avatarUrl(path).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [path]);
  return url;
}

/** Upload a new photo, point the profile at it, then remove the old file. Returns the new path. */
export async function setAvatar(userId: string, photo: Picked, oldPath: string | null) {
  const ext = photo.mimeType === 'image/png' ? 'png' : 'jpg';
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const bucket = supabase.storage.from(BUCKET);
  const { error } = await bucket.upload(path, base64ToBytes(photo.base64), { contentType: photo.mimeType });
  if (error) throw error;
  const { error: err } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', userId);
  if (err) {
    await bucket.remove([path]);
    throw err;
  }
  if (oldPath) await bucket.remove([oldPath]);
  return path;
}

/** Remove your photo: the profile forgets it, then the file is deleted. */
export async function removeAvatar(userId: string, path: string) {
  const { error } = await supabase.from('profiles').update({ avatar_path: null }).eq('id', userId);
  if (error) throw error;
  links.delete(path);
  await supabase.storage.from(BUCKET).remove([path]);
}

/** Every file in your folder (used when deleting the account). */
export async function removeAllAvatars(userId: string) {
  const bucket = supabase.storage.from(BUCKET);
  const { data: files } = await bucket.list(userId, { limit: 100 });
  if (files && files.length > 0) await bucket.remove(files.map((f) => `${userId}/${f.name}`));
}

/** Whether a profile photo is required right now (settings.profile_photo_required). */
export async function photoRequired(): Promise<boolean> {
  const { data, error } = await supabase.rpc('setting_on', { p_key: 'profile_photo_required' });
  return !error && data === true;
}

/**
 * Before booking or posting: true if it may go ahead. When a photo is required and you have
 * none, it asks you to add one and opens Account (the database would refuse anyway).
 */
export async function photoGate(hasPhoto: boolean, text: { title: string; body: string; yes: string; no: string }) {
  if (hasPhoto || !(await photoRequired())) return true;
  const add = await confirm({ ...text, tone: 'neutral' });
  if (add) router.push('/account');
  return false;
}

/** The words for photoGate(), from the screen's translator. */
export function photoGateText(t: (k: 'photoGateTitle' | 'photoNeeded' | 'addProfilePhoto' | 'notNow') => string) {
  return { title: t('photoGateTitle'), body: t('photoNeeded'), yes: t('addProfilePhoto'), no: t('notNow') };
}
