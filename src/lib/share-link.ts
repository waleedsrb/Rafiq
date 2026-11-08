// Share my trip links and emergency helpers that don't touch the network,
// so they can be tested on their own (see share-link.test.ts).

/** The family page lives on the same GitHub Pages site as the admin website (admin/share.html). */
export const SHARE_PAGE = 'https://waleedsrb.github.io/Rafiq/share.html';

/** Emergency numbers that work from both Palestinian and Israeli SIMs. */
export const EMERGENCY = { police: '100', ambulance: '101' } as const;

export function shareUrl(token: string, lang: 'ar' | 'en'): string {
  return `${SHARE_PAGE}?t=${encodeURIComponent(token)}${lang === 'en' ? '&lang=en' : ''}`;
}

/**
 * An sms: link that opens the Messages app with the text filled in.
 * iOS wants "&body=", Android "?body=" (a quirk of each platform's URL handling).
 */
export function smsLink(phone: string, body: string, os: 'ios' | 'android' | string): string {
  const sep = os === 'ios' ? '&' : '?';
  return `sms:${phone}${sep}body=${encodeURIComponent(body)}`;
}
