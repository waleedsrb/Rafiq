// Turn whatever a person types into one standard form (E.164, e.g. +970591234567),
// so "0591234567", "059 123 4567" and "+970591234567" all become the same account.
//
// Palestinian mobiles: 059x (Jawwal) and 056x (Ooredoo), 10 digits starting with 0.
// Both are reachable as +970 and +972, so we accept either prefix as typed.

import { toWesternDigits } from './digits.ts';

export function normalizePhone(input: string): string | null {
  const digits = toWesternDigits(input).replace(/[\s\-()]/g, '');

  // Already international: +970 / +972 / 00970 / 00972, then 9 digits starting with 5.
  const intl = digits.match(/^(?:\+|00)(970|972)(5\d{8})$/);
  if (intl) return `+${intl[1]}${intl[2]}`;

  // Local format: 05xxxxxxxx -> +970 5xxxxxxxx
  const local = digits.match(/^0(5\d{8})$/);
  if (local) return `+970${local[1]}`;

  return null;
}

/**
 * For display: "970591234567" or "+970591234567" -> "+970 59 123 4567".
 * Supabase stores phone numbers without the plus.
 */
export function formatPhone(stored: string): string {
  const d = stored.replace(/\D/g, '');
  const m = d.match(/^(970|972)(5\d)(\d{3})(\d{4})$/);
  return m ? `+${m[1]} ${m[2]} ${m[3]} ${m[4]}` : `+${d}`;
}

/** For a tel: link. */
export function telLink(stored: string): string {
  return `tel:+${stored.replace(/\D/g, '')}`;
}
