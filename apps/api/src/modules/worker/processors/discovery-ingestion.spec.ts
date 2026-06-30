import type { ExtensionCaptureItemInput, ManualDiscoveryInput } from '@radar/contracts';
import {
  addSkippedRow,
  buildCsvRecords,
  createIngestionResult,
  normalizeCsvRecord,
  normalizeExtensionItem,
  normalizeManualEntry,
  parseCsv,
  updateIngestionResult,
} from './discovery-ingestion';

// P2-12 QA — ingestion + CSV + extension normalization/dedup/idempotency.
// Pure functions only: no Supabase, no network. The RPC-side dedup is exercised in DB tests.

describe('parseCsv', () => {
  it('parses simple rows and trims line endings (LF + CRLF)', () => {
    expect(parseCsv('a,b\r\nc,d\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('keeps commas and newlines inside quoted cells', () => {
    expect(parseCsv('"Smith, Co","line1\nline2"')).toEqual([['Smith, Co', 'line1\nline2']]);
  });

  it('unescapes doubled quotes', () => {
    expect(parseCsv('"He said ""hi"""')).toEqual([['He said "hi"']]);
  });

  it('skips fully blank lines but preserves ragged/malformed rows', () => {
    expect(parseCsv('a,b,c\n\nd,e\n')).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e'],
    ]);
  });

  it('returns an empty array for empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });
});

describe('buildCsvRecords', () => {
  it('maps header aliases to canonical fields (case/spacing-insensitive)', () => {
    const text = 'Company Name,E-mail,Budget\nAcme,JO@acme.com,5000\n';
    const records = buildCsvRecords(text, true);
    expect(records).toHaveLength(1);
    expect(records[0]!.rowNumber).toBe(2);
    expect(records[0]!.values.company_name).toBe('Acme');
    expect(records[0]!.values.e_mail).toBe('JO@acme.com');
    expect(records[0]!.values.budget).toBe('5000');
  });

  it('falls back to positional default headers when there is no header row', () => {
    const records = buildCsvRecords('Landing page,Some details,Acme\n', false);
    expect(records[0]!.rowNumber).toBe(1);
    // COLUMN_ORDER → first alias: title, description, company...
    expect(records[0]!.values.title).toBe('Landing page');
    expect(records[0]!.values.company_name).toBe('Acme');
  });

  it('returns no records for an empty file', () => {
    expect(buildCsvRecords('', true)).toEqual([]);
  });
});

describe('normalizeCsvRecord', () => {
  const fileName = 'leads.csv';

  it('normalizes fields, lowercases email, strips phone, title-cases country', () => {
    const record = {
      rowNumber: 2,
      values: {
        title: '  Need a site  ',
        company: 'Acme Inc',
        email: 'JANE@ACME.COM',
        phone: '+1 (555) 010-0199',
        website: 'Acme.com/',
        country: 'united states',
        budget: '$5,000',
        source: 'LinkedIn',
      },
    };
    const out = normalizeCsvRecord(record, 'csv', fileName);
    expect('candidate' in out).toBe(true);
    if (!('candidate' in out)) return;
    const c = out.candidate;
    expect(c.title).toBe('Need a site');
    expect(c.companyName).toBe('Acme Inc');
    expect(c.email).toBe('jane@acme.com');
    expect(c.phone).toBe('15550100199');
    expect(c.website).toBe('https://acme.com');
    expect(c.country).toBe('United States');
    expect(c.budgetHint).toBe(5000);
    expect(c.source).toBe('linkedin'); // exact-match source value overrides the default
    expect(c.dedupHash).toMatch(/^[a-f0-9]{64}$/);
    expect(c.rawPayload._ingestionChannel).toBe('csv');
    expect(c.rawPayload._rowNumber).toBe(2);
  });

  it('falls back to the default source when the row has none/unknown (incl. non-canonical multi-word)', () => {
    const none = normalizeCsvRecord({ rowNumber: 2, values: { company: 'Acme' } }, 'website', fileName);
    if (!('candidate' in none)) throw new Error('expected candidate');
    expect(none.candidate.source).toBe('website');

    // "Up Work" normalizes to "up_work" which is not a canonical source → fallback to default.
    const unknown = normalizeCsvRecord({ rowNumber: 3, values: { company: 'Acme', source: 'Up Work' } }, 'csv', fileName);
    if (!('candidate' in unknown)) throw new Error('expected candidate');
    expect(unknown.candidate.source).toBe('csv');
  });

  it('skips a row with no identifying fields (warning)', () => {
    const out = normalizeCsvRecord({ rowNumber: 7, values: { budget: '5000' } }, 'csv', fileName);
    expect('warning' in out).toBe(true);
    if ('warning' in out) expect(out.warning).toContain('Row 7');
  });

  it('produces a stable dedup hash for equal identifying inputs (idempotency)', () => {
    const a = normalizeCsvRecord({ rowNumber: 2, values: { company: 'Acme', email: 'a@acme.com' } }, 'csv', fileName);
    const b = normalizeCsvRecord({ rowNumber: 9, values: { company: 'Acme', email: 'A@ACME.COM' } }, 'csv', 'other.csv');
    if (!('candidate' in a) || !('candidate' in b)) throw new Error('expected candidates');
    expect(a.candidate.dedupHash).toBe(b.candidate.dedupHash);
  });
});

describe('normalizeManualEntry', () => {
  it('normalizes fields and stamps the manual channel + notes', () => {
    const entry: ManualDiscoveryInput = {
      source: 'manual',
      title: 'Landing page redesign',
      email: 'Owner@Acme.com',
      website: 'https://www.acme.com/',
      notes: 'warm intro',
    };
    const c = normalizeManualEntry(entry);
    expect(c.email).toBe('owner@acme.com');
    expect(c.website).toBe('https://acme.com');
    expect(c.rawPayload._ingestionChannel).toBe('manual');
    expect(c.rawPayload.notes).toBe('warm intro');
    expect(c.dedupHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('yields a null dedup hash when no identifying fields are present', () => {
    const c = normalizeManualEntry({ source: 'manual', description: 'just a note' });
    expect(c.dedupHash).toBeNull();
  });
});

describe('normalizeExtensionItem', () => {
  const ctx = { parserVersion: 'linkedin-v1', capturedUrl: 'https://linkedin.com/jobs', capturedAt: '2026-06-23T10:00:00.000Z', itemIndex: 0 };

  it('normalizes a captured item and records parser provenance', () => {
    const item: ExtensionCaptureItemInput = {
      title: 'Senior React Dev',
      companyName: 'Acme',
      url: 'https://linkedin.com/jobs/123',
      raw: { snippet: 'visible text' },
    };
    const out = normalizeExtensionItem(item, 'linkedin', ctx);
    if (!('candidate' in out)) throw new Error('expected candidate');
    const c = out.candidate;
    expect(c.source).toBe('linkedin');
    expect(c.website).toBe('https://linkedin.com/jobs/123'); // falls back to url
    expect(c.rawPayload._parserVersion).toBe('linkedin-v1');
    expect(c.rawPayload._capturedUrl).toBe(ctx.capturedUrl);
    expect(c.dedupHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('skips an item with no identifying fields', () => {
    const out = normalizeExtensionItem({ raw: {} }, 'linkedin', { ...ctx, itemIndex: 3 });
    expect('warning' in out).toBe(true);
    if ('warning' in out) expect(out.warning).toContain('Item 3');
  });
});

describe('ingestion result accumulators', () => {
  it('counts inserted / exact / fuzzy decisions and collects inserted ids', () => {
    const result = createIngestionResult('batch-1', null);
    updateIngestionResult(result, 'inserted', 'disc-1');
    updateIngestionResult(result, 'exact_duplicate', null);
    updateIngestionResult(result, 'fuzzy_duplicate', null);
    addSkippedRow(result, 'Row 4: no identifiers');

    expect(result.totalRows).toBe(4);
    expect(result.insertedCount).toBe(1);
    expect(result.exactDuplicateCount).toBe(1);
    expect(result.fuzzyDuplicateCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(result.discoveryIds).toEqual(['disc-1']);
    expect(result.warnings).toHaveLength(1);
  });
});
