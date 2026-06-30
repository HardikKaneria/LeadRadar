import { redactPii } from './redact';

describe('redactPii', () => {
  // ── passthrough ────────────────────────────────────────────────────────────
  it('returns undefined when input is undefined', () => {
    expect(redactPii(undefined)).toBeUndefined();
  });

  it('returns empty string unchanged', () => {
    expect(redactPii('')).toBe('');
  });

  it('returns text with no PII unchanged', () => {
    const text = 'This is a safe message about project timelines.';
    expect(redactPii(text)).toBe(text);
  });

  // ── email redaction ────────────────────────────────────────────────────────
  it('redacts a simple email address', () => {
    expect(redactPii('Contact us at hello@example.com for support.')).toBe(
      'Contact us at [EMAIL REDACTED] for support.',
    );
  });

  it('redacts email with subdomains', () => {
    expect(redactPii('user@mail.company.co.uk')).toBe('[EMAIL REDACTED]');
  });

  it('redacts multiple emails in one string', () => {
    const result = redactPii('a@a.com and b@b.org are both involved.');
    expect(result).toBe('[EMAIL REDACTED] and [EMAIL REDACTED] are both involved.');
  });

  it('redacts email with plus-addressing', () => {
    expect(redactPii('Send to john+tag@example.com')).toContain('[EMAIL REDACTED]');
  });

  it('redacts uppercase email', () => {
    expect(redactPii('JOHN.DOE@COMPANY.COM')).toBe('[EMAIL REDACTED]');
  });

  // ── phone redaction ────────────────────────────────────────────────────────
  it('redacts US phone with dashes', () => {
    expect(redactPii('Call 555-123-4567 for info.')).toContain('[PHONE REDACTED]');
  });

  it('redacts US phone with parentheses', () => {
    expect(redactPii('Phone: (555) 123-4567')).toContain('[PHONE REDACTED]');
  });

  it('redacts international phone with country code', () => {
    expect(redactPii('Reach us at +1-800-555-0199 anytime.')).toContain('[PHONE REDACTED]');
  });

  it('redacts phone with dots', () => {
    expect(redactPii('555.123.4567')).toContain('[PHONE REDACTED]');
  });

  it('redacts multiple phones in one string', () => {
    const result = redactPii('Main: 555-111-2222. Alt: 555-333-4444.');
    expect(result?.split('[PHONE REDACTED]').length).toBeGreaterThanOrEqual(3);
  });

  // ── combined ───────────────────────────────────────────────────────────────
  it('redacts both email and phone in the same string', () => {
    const input = 'Contact john@acme.com or call (555) 987-6543.';
    const result = redactPii(input)!;
    expect(result).toContain('[EMAIL REDACTED]');
    expect(result).toContain('[PHONE REDACTED]');
    expect(result).not.toContain('john@acme.com');
    expect(result).not.toContain('987-6543');
  });

  // ── non-PII numbers stay intact ───────────────────────────────────────────
  it('does not redact short numeric strings that are not phone numbers', () => {
    const text = 'Score: 87, Budget: 5000, Priority: 3';
    const result = redactPii(text)!;
    expect(result).toBe(text);
  });

  // ── preserves surrounding non-PII content ────────────────────────────────
  it('preserves surrounding text after redaction', () => {
    const result = redactPii('Dear Alice, please email bob@corp.io with your feedback.')!;
    expect(result).toBe('Dear Alice, please email [EMAIL REDACTED] with your feedback.');
  });
});
