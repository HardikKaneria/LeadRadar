/**
 * Simple Regex-based PII redactor.
 * Replaces emails and phone numbers with [EMAIL REDACTED] and [PHONE REDACTED].
 */

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
// Matches various phone formats like +1-800-555-0199, (555) 123-4567, etc.
const PHONE_REGEX = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;

export function redactPii(text: string | undefined): string | undefined {
  if (!text) return text;
  return text
    .replace(EMAIL_REGEX, '[EMAIL REDACTED]')
    .replace(PHONE_REGEX, '[PHONE REDACTED]');
}
