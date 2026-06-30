// Shared helper for the admin "Generate Strong Password" affordances (provision company / invite
// user). Kept in one place so the three admin surfaces don't each carry a copy.
const PASSWORD_CHARS =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+';

export function generatePassword(length = 16): string {
  return Array.from({ length }, () =>
    PASSWORD_CHARS.charAt(Math.floor(Math.random() * PASSWORD_CHARS.length)),
  ).join('');
}
