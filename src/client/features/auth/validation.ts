/** Same rule as the server: 2–32 lowercase letters, digits, dots, dashes, underscores. */
export const USERNAME_PATTERN = /^[a-z0-9._-]{2,32}$/;

export const MIN_PASSWORD_LENGTH = 8;

/** A username suggested from a name: "Ana Maria" → "ana". */
export function suggestUsername(name: string): string {
  const first = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .split(/\s+/)[0];
  return (first ?? '').replace(/[^a-z0-9._-]/g, '').slice(0, 32);
}
