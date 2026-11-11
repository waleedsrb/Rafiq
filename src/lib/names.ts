// How a name is shown to other people: first name + last initial ("Mohammad A.").

export function shortName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1].charAt(0)}.` : parts[0];
}

/** How a car is named on a trip card: "White Kia Picanto" / "كيا بيكانتو أبيض" (Arabic puts the colour after). */
export function carName(model: string | null, color: string | null, lang: 'ar' | 'en'): string {
  const m = model?.trim() ?? '';
  const c = color?.trim() ?? '';
  if (!m) return '';
  if (!c) return m;
  return lang === 'en' ? `${c} ${m}` : `${m} ${c}`;
}
