/**
 * Normalizes pasted or typed Indian mobile phone input by stripping non-digits
 * before limiting to 10 digits, preserving the 10-digit subscriber number when
 * formatted prefixes like +91, 91, or leading 0 are pasted.
 */
export function normalizePhoneInput(rawValue: string, previousValue = ''): string {
  const digits = rawValue.replace(/\D/g, '');
  if (!digits) {
    return '';
  }

  const hadNonDigits = /\D/.test(rawValue);
  const trimmed = rawValue.trim();

  if (
    digits.length >= 12 &&
    digits.startsWith('91') &&
    (hadNonDigits || trimmed.startsWith('+91') || previousValue.length < 10)
  ) {
    return digits.slice(2, 12);
  }

  if (
    digits.length === 11 &&
    digits.startsWith('0') &&
    (hadNonDigits || previousValue.length < 10)
  ) {
    return digits.slice(1, 11);
  }

  return digits.slice(0, 10);
}
