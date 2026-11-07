// Record a funnel step in app_events. Fire and forget: a failed log must never
// block someone from signing up, so errors are only printed, not thrown.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';

import { supabase } from '@/lib/supabase';

export type EventName =
  | 'signup_started'
  | 'signup_phone_submitted'
  | 'signup_code_verified'
  | 'signup_profile_completed';

let installId: string | null = null;

async function getInstallId(): Promise<string> {
  if (installId) return installId;
  const stored = await AsyncStorage.getItem('rafiq.install_id');
  installId = stored ?? randomUUID();
  if (!stored) await AsyncStorage.setItem('rafiq.install_id', installId);
  return installId;
}

export async function track(name: EventName, props: Record<string, unknown> = {}) {
  try {
    const [id, { data }] = await Promise.all([getInstallId(), supabase.auth.getSession()]);
    const { error } = await supabase.from('app_events').insert({
      install_id: id,
      user_id: data.session?.user.id ?? null,
      name,
      props,
    });
    if (error) console.warn('track failed', name, error.message);
  } catch (e) {
    console.warn('track failed', name, e);
  }
}
