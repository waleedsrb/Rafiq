// Arabic keyboards often type Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩) or Persian ones (۰۱۲…).
// Convert both to 0-9 before reading any number a person typed.
export function toWesternDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0));
}
