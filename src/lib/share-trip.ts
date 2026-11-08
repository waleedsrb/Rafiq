// Share my trip and the Emergency sheet (slice 12).
//
// share_trip() gives this person's secret link for a trip; the link opens a small web
// page (admin/share.html) where family sees the route, driver, car and, once the trip
// is underway, where the car was last seen.

import { Linking, Platform, Share } from 'react-native';

import type { StringKey } from '@/i18n/strings';
import { choose } from '@/lib/dialog';
import { EMERGENCY, shareUrl, smsLink } from '@/lib/share-link';
import { supabase } from '@/lib/supabase';

type T = (key: StringKey) => string;

export async function tripShareLink(tripId: string, lang: 'ar' | 'en'): Promise<string | null> {
  const { data, error } = await supabase.rpc('share_trip', { p_trip_id: tripId });
  return error || typeof data !== 'string' ? null : shareUrl(data, lang);
}

/** Open the share sheet with a message and, when we can make one, the live link. */
export async function shareTrip(tripId: string, message: string, lang: 'ar' | 'en', t: T) {
  const link = await tripShareLink(tripId, lang);
  const text = link ? `${message}\n${t('followLive')} ${link}` : message;
  await Share.share({ message: text }).catch(() => {});
}

/** The Emergency sheet: call for help, or send the live trip to your emergency contact. */
export async function openEmergency(tripId: string, userId: string, lang: 'ar' | 'en', t: T) {
  const { data: me } = await supabase
    .from('profiles')
    .select('emergency_name, emergency_phone')
    .eq('id', userId)
    .maybeSingle();
  const contactName = (me?.emergency_name as string | null) ?? null;
  const contactPhone = (me?.emergency_phone as string | null) ?? null;

  type Pick = 'police' | 'ambulance' | 'contact' | 'share';
  const options: { label: string; value: Pick; icon?: string }[] = [
    { label: `${t('callPolice')} ${EMERGENCY.police}`, value: 'police', icon: 'phone' },
    { label: `${t('callAmbulance')} ${EMERGENCY.ambulance}`, value: 'ambulance', icon: 'phone' },
  ];
  if (contactPhone) options.push({ label: `${t('textContact')} ${contactName ?? ''}`.trim(), value: 'contact', icon: 'shareNetwork' });
  options.push({ label: t('sendLiveTrip'), value: 'share', icon: 'shareNetwork' });

  const pick = await choose<Pick>({ title: t('sosTitle'), body: t('sosBody'), options, cancel: t('keep') });
  if (pick === 'police' || pick === 'ambulance') {
    await Linking.openURL(`tel:${EMERGENCY[pick]}`).catch(() => {});
    return;
  }
  if (pick === 'contact' || pick === 'share') {
    const link = await tripShareLink(tripId, lang);
    const text = `${t('sosMessage')}${link ? ` ${link}` : ''}`;
    if (pick === 'contact' && contactPhone) await Linking.openURL(smsLink(contactPhone, text, Platform.OS)).catch(() => {});
    else await Share.share({ message: text }).catch(() => {});
  }
}
