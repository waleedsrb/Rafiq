// Car plates, typed however people type them ("7 1234 95", "٧-١٢٣٤-٩٥", "7-1234-95"),
// stored in one form: digits and capital letters joined by single dashes.
// The database checks the same pattern (driver_details.plate).

import { toWesternDigits } from './digits.ts';

export function normalizePlate(input: string): string | null {
  const cleaned = toWesternDigits(input)
    .toUpperCase()
    .trim()
    .replace(/[\s._/]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return /^[0-9A-Z-]{4,12}$/.test(cleaned) ? cleaned : null;
}
