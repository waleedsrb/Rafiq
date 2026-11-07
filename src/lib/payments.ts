// Card helpers and the pretend gateway (slice 6).
//
// The real card number never leaves the phone. A gateway's SDK turns it into a "token"
// that can only be used for this payment, and only the token reaches our database.
// The pretend gateway below copies that shape so swapping in a real one later only
// changes this file and request_seat()'s authorize step.

export type CardBrand = 'visa' | 'mastercard' | 'card';

export type CardInput = { number: string; expiry: string; cvc: string };
export type Tokenized = { token: string; brand: CardBrand; last4: string };

/** Test cards for the pretend gateway. */
export const TEST_CARD = '4242 4242 4242 4242';
export const DECLINE_CARD = '4000 0000 0000 0002';

export const digitsOnly = (s: string) => s.replace(/\D/g, '');

/** "4242424242424242" -> "4242 4242 4242 4242" (max 19 digits). */
export function formatCardNumber(input: string): string {
  return digitsOnly(input).slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ');
}

/** "1228" -> "12/28". */
export function formatExpiry(input: string): string {
  const d = digitsOnly(input).slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

export function cardBrand(number: string): CardBrand {
  const d = digitsOnly(number);
  if (/^4/.test(d)) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(d)) return 'mastercard';
  return 'card';
}

/** The Luhn check: catches most typos in a card number (a mistyped digit or two swapped). */
export function luhnValid(number: string): boolean {
  const d = digitsOnly(number);
  if (d.length < 12 || d.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

/** Expiry must be MM/YY and not in the past (a card works until the end of its month). */
export function expiryValid(expiry: string, now: Date): boolean {
  const m = /^(\d{2})\/(\d{2})$/.exec(expiry);
  if (!m) return false;
  const month = Number(m[1]);
  const year = 2000 + Number(m[2]);
  if (month < 1 || month > 12) return false;
  return new Date(year, month, 1) > now; // first day of the month after expiry
}

export type CardProblem = 'number' | 'expiry' | 'cvc';

export function checkCard(card: CardInput, now: Date): CardProblem | null {
  if (!luhnValid(card.number)) return 'number';
  if (!expiryValid(card.expiry, now)) return 'expiry';
  if (!/^\d{3,4}$/.test(card.cvc)) return 'cvc';
  return null;
}

/** The pretend gateway: makes a token like a real SDK would. 4000…0002 plays a declined card. */
export function fakeTokenize(card: CardInput): Tokenized {
  const d = digitsOnly(card.number);
  const last4 = d.slice(-4);
  const token = d === digitsOnly(DECLINE_CARD) ? 'tok_fake_decline' : `tok_fake_${last4}${Date.now().toString(36)}`;
  return { token, brand: cardBrand(d), last4 };
}
