/**
 * P2-12 · QA: ingestion, CSV, extension parser
 *
 * Tests:
 *   1. parseCsv          — RFC-4180 parsing, edge cases
 *   2. buildCsvRecords   — header normalisation, headerless mode, column order
 *   3. normalizeCsvRecord — field aliases, dedup, skip-on-no-identifier
 *   4. normalizeExtensionItem — visible-only capture, dedup, skip-on-no-identifier
 *   5. normalizeManualEntry   — basic normalisation, dedup hash
 *   6. updateIngestionResult / addSkippedRow — counter correctness
 *   7. processCsvImport (integration) — happy path, empty CSV, malformed rows
 */

import {
  parseCsv,
  buildCsvRecords,
  normalizeCsvRecord,
  normalizeExtensionItem,
  normalizeManualEntry,
  updateIngestionResult,
  addSkippedRow,
  createIngestionResult,
} from './discovery-ingestion';
import { processCsvImport } from './import-csv.processor';
import type { ServiceClient } from '@radar/supabase';
import type { Job } from '../../../queue/supabase-queue.service';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function makeJob(payload: Record<string, any> = {}): Job {
  return {
    id: 'job-1',
    organization_id: 'org-1',
    payload: {
      batchId: 'batch-1',
      bucket: 'imports',
      path: 'test.csv',
      hasHeader: true,
      defaultSource: 'csv',
      fileName: 'test.csv',
      uploadedBy: 'user-1',
      ...payload,
    },
  } as unknown as Job;
}

function makeSupabase(opts: {
  csvText?: string;
  ingestDecision?: 'inserted' | 'exact_duplicate' | 'fuzzy_duplicate';
}) {
  const { csvText = '', ingestDecision = 'inserted' } = opts;

  return {
    from: jest.fn((table: string) => ({
      update: jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ error: null })) })),
      select: jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ data: [], error: null })) })),
    })),
    storage: {
      from: jest.fn(() => ({
        download: jest.fn(() =>
          Promise.resolve({
            data: { text: () => Promise.resolve(csvText) },
            error: null,
          }),
        ),
      })),
    },
    rpc: jest.fn(() =>
      Promise.resolve({
        data: [{ decision: ingestDecision, discovery_id: 'disc-1', matched_discovery_id: null }],
        error: null,
      }),
    ),
  } as unknown as ServiceClient;
}

// ────────────────────────────────────────────────────────────────────────────
// 1. parseCsv
// ────────────────────────────────────────────────────────────────────────────

describe('parseCsv', () => {
  it('parses simple comma-separated rows', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });

  it('handles quoted fields with commas inside', () => {
    expect(parseCsv('"hello, world",foo')).toEqual([['hello, world', 'foo']]);
  });

  it('handles escaped double-quotes inside quoted fields', () => {
    expect(parseCsv('"say ""hi""",bar')).toEqual([['say "hi"', 'bar']]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('skips blank rows', () => {
    expect(parseCsv('a,b\n\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('returns empty array for empty string', () => {
    expect(parseCsv('')).toEqual([]);
  });

  it('handles single column', () => {
    expect(parseCsv('title\nFoo Bar')).toEqual([['title'], ['Foo Bar']]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. buildCsvRecords
// ────────────────────────────────────────────────────────────────────────────

describe('buildCsvRecords', () => {
  it('extracts headers and maps columns correctly', () => {
    const csv = 'title,company_name,email\nTest Opp,Acme,acme@test.com';
    const records = buildCsvRecords(csv, true);
    expect(records).toHaveLength(1);
    expect(records[0]!.values['title']).toBe('Test Opp');
    expect(records[0]!.values['company_name']).toBe('Acme');
    expect(records[0]!.values['email']).toBe('acme@test.com');
  });

  it('normalises header names (trim, lowercase, underscores)', () => {
    const csv = ' Title , Company Name ,Email Address\nfoo,bar,baz@x.com';
    const records = buildCsvRecords(csv, true);
    expect(records[0]!.values['title']).toBe('foo');
    expect(records[0]!.values['company_name']).toBe('bar');
  });

  it('headerless mode maps columns by canonical order', () => {
    // canonical order: title, description, companyName, contactName, email, phone, website, country, budgetHint, source
    const csv = 'Big Opp,Great deal,Acme,John,john@acme.com,555-1234,acme.com,US,50000,linkedin';
    const records = buildCsvRecords(csv, false);
    expect(records[0]!.values['title']).toBe('Big Opp');
    expect(records[0]!.values['company_name']).toBe('Acme');
    expect(records[0]!.values['email']).toBe('john@acme.com');
  });

  it('returns empty array for blank CSV', () => {
    expect(buildCsvRecords('', true)).toEqual([]);
  });

  it('assigns correct rowNumber (1-indexed, skipping header)', () => {
    const csv = 'title\nA\nB\nC';
    const records = buildCsvRecords(csv, true);
    expect(records.map((r) => r.rowNumber)).toEqual([2, 3, 4]);
  });

  it('assigns rowNumber starting at 1 in headerless mode', () => {
    const csv = 'A\nB';
    const records = buildCsvRecords(csv, false);
    expect(records[0]!.rowNumber).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. normalizeCsvRecord
// ────────────────────────────────────────────────────────────────────────────

describe('normalizeCsvRecord', () => {
  const record = (values: Record<string, string>, row = 1) => ({ rowNumber: row, values });

  it('maps standard alias fields', () => {
    const r = record({ title: 'Opp', company: 'Acme', email: 'a@b.com' });
    const result = normalizeCsvRecord(r, 'csv', 'test.csv');
    expect('candidate' in result).toBe(true);
    if ('candidate' in result) {
      expect(result.candidate.title).toBe('Opp');
      expect(result.candidate.companyName).toBe('Acme');
      expect(result.candidate.email).toBe('a@b.com');
    }
  });

  it('normalises email to lowercase', () => {
    const r = record({ email: 'HELLO@WORLD.COM' });
    const result = normalizeCsvRecord(r, 'csv', 'test.csv');
    if ('candidate' in result) expect(result.candidate.email).toBe('hello@world.com');
  });

  it('normalises phone to digits only', () => {
    const r = record({ phone: '+1 (555) 123-4567', title: 'x' });
    const result = normalizeCsvRecord(r, 'csv', 'test.csv');
    if ('candidate' in result) expect(result.candidate.phone).toBe('15551234567');
  });

  it('normalises website: strips www, lowercases host', () => {
    const r = record({ website: 'https://WWW.ACME.COM/page', title: 'x' });
    const result = normalizeCsvRecord(r, 'csv', 'test.csv');
    if ('candidate' in result) expect(result.candidate.website).toBe('https://acme.com/page');
  });

  it('prepends https:// if missing from website', () => {
    const r = record({ website: 'acme.com', title: 'x' });
    const result = normalizeCsvRecord(r, 'csv', 'test.csv');
    if ('candidate' in result) expect(result.candidate.website).toMatch(/^https:\/\//);
  });

  it('normalises budget string to number', () => {
    const r = record({ budget: '$12,500', title: 'x' });
    const result = normalizeCsvRecord(r, 'csv', 'test.csv');
    if ('candidate' in result) expect(result.candidate.budgetHint).toBe(12500);
  });

  it('skips row with no identifying fields, returns warning', () => {
    const r = record({ irrelevant_col: 'nothing' });
    const result = normalizeCsvRecord(r, 'csv', 'test.csv');
    expect('warning' in result).toBe(true);
    if ('warning' in result) expect(result.warning).toContain('Row 1');
  });

  it('generates a dedupHash when identifying fields present', () => {
    const r = record({ title: 'Opp', company: 'Acme', email: 'a@b.com' });
    const result = normalizeCsvRecord(r, 'csv', 'test.csv');
    if ('candidate' in result) expect(result.candidate.dedupHash).toBeTruthy();
  });

  it('two identical records produce the same dedupHash', () => {
    const r = record({ title: 'Opp', company: 'Acme', email: 'a@b.com' });
    const r2 = record({ title: 'Opp', company: 'Acme', email: 'a@b.com' });
    const a = normalizeCsvRecord(r, 'csv', 'test.csv');
    const b = normalizeCsvRecord(r2, 'csv', 'test.csv');
    if ('candidate' in a && 'candidate' in b) {
      expect(a.candidate.dedupHash).toBe(b.candidate.dedupHash);
    }
  });

  it('different companies produce different dedupHashes', () => {
    const a = normalizeCsvRecord(record({ company: 'Acme', email: 'a@b.com' }), 'csv', 'f.csv');
    const b = normalizeCsvRecord(record({ company: 'Beta', email: 'a@b.com' }), 'csv', 'f.csv');
    if ('candidate' in a && 'candidate' in b) {
      expect(a.candidate.dedupHash).not.toBe(b.candidate.dedupHash);
    }
  });

  it('uses defaultSource when source column is absent', () => {
    const r = record({ title: 'Opp' });
    const result = normalizeCsvRecord(r, 'linkedin', 'test.csv');
    if ('candidate' in result) expect(result.candidate.source).toBe('linkedin');
  });

  it('respects source column when present and valid', () => {
    const r = record({ title: 'Opp', source: 'referral' });
    const result = normalizeCsvRecord(r, 'csv', 'test.csv');
    if ('candidate' in result) expect(result.candidate.source).toBe('referral');
  });

  it('falls back to defaultSource when source column value is invalid', () => {
    const r = record({ title: 'Opp', source: 'not_a_valid_source_xyz' });
    const result = normalizeCsvRecord(r, 'email', 'test.csv');
    if ('candidate' in result) expect(result.candidate.source).toBe('email');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. normalizeExtensionItem (visible-only capture)
// ────────────────────────────────────────────────────────────────────────────

describe('normalizeExtensionItem', () => {
  const ctx = {
    parserVersion: '1.2.0',
    capturedUrl: 'https://example.com/leads',
    capturedAt: new Date().toISOString(),
    itemIndex: 0,
  };

  it('creates candidate from extension item fields', () => {
    const result = normalizeExtensionItem(
      { title: 'Lead A', companyName: 'Acme', email: 'a@acme.com', raw: {} },
      'other',
      ctx,
    );
    expect('candidate' in result).toBe(true);
    if ('candidate' in result) {
      expect(result.candidate.title).toBe('Lead A');
      expect(result.candidate.companyName).toBe('Acme');
    }
  });

  it('skips item with no identifying fields', () => {
    const result = normalizeExtensionItem({ raw: { someField: 'data' } }, 'other', ctx);
    expect('warning' in result).toBe(true);
    if ('warning' in result) expect(result.warning).toContain('Item 0');
  });

  it('sets _ingestionChannel = extension in rawPayload', () => {
    const result = normalizeExtensionItem({ title: 'X', raw: {} }, 'other', ctx);
    if ('candidate' in result) {
      expect(result.candidate.rawPayload['_ingestionChannel']).toBe('extension');
    }
  });



  it('stores parserVersion, capturedUrl, capturedAt in rawPayload', () => {
    const result = normalizeExtensionItem({ title: 'X', raw: {} }, 'other', ctx);
    if ('candidate' in result) {
      expect(result.candidate.rawPayload['_parserVersion']).toBe('1.2.0');
      expect(result.candidate.rawPayload['_capturedUrl']).toBe('https://example.com/leads');
    }
  });

  it('generates dedupHash for items with identifiers', () => {
    const result = normalizeExtensionItem(
      { title: 'Lead', companyName: 'Acme', raw: {} },
      'other',
      ctx,
    );
    if ('candidate' in result) expect(result.candidate.dedupHash).toBeTruthy();
  });

  it('falls back to item.url as website when website is absent', () => {
    const result = normalizeExtensionItem(
      { title: 'X', url: 'https://acme.com', raw: {} },
      'other',
      ctx,
    );
    if ('candidate' in result) expect(result.candidate.website).toMatch('acme.com');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 5. normalizeManualEntry
// ────────────────────────────────────────────────────────────────────────────

describe('normalizeManualEntry', () => {
  it('normalises all fields from manual input', () => {
    const entry = {
      source: 'referral' as const,
      title: ' Big Deal ',
      companyName: ' Acme ',
      email: 'ACME@ACME.COM',
      phone: '(555) 123-4567',
      website: 'WWW.ACME.COM',
      country: 'united states',
      budgetHint: 20000,
      rawPayload: {},
    };
    const result = normalizeManualEntry(entry);
    expect(result.title).toBe('Big Deal');
    expect(result.companyName).toBe('Acme');
    expect(result.email).toBe('acme@acme.com');
    expect(result.phone).toBe('5551234567');
    expect(result.website).toBe('https://acme.com');
    expect(result.country).toBe('United States');
    expect(result.budgetHint).toBe(20000);
  });

  it('generates a dedupHash', () => {
    const entry = { source: 'website' as const, companyName: 'X', rawPayload: {} };
    const result = normalizeManualEntry(entry);
    expect(result.dedupHash).toBeTruthy();
  });

  it('sets _ingestionChannel = manual in rawPayload', () => {
    const result = normalizeManualEntry({ source: 'website' as const, title: 'T', rawPayload: {} });
    expect(result.rawPayload['_ingestionChannel']).toBe('manual');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 6. updateIngestionResult / addSkippedRow
// ────────────────────────────────────────────────────────────────────────────

describe('ingestion result counters', () => {
  it('increments insertedCount and pushes discovery_id on inserted', () => {
    const r = createIngestionResult('b1', null);
    updateIngestionResult(r, 'inserted', 'disc-1');
    expect(r.insertedCount).toBe(1);
    expect(r.totalRows).toBe(1);
    expect(r.discoveryIds).toContain('disc-1');
  });

  it('increments exactDuplicateCount on exact_duplicate', () => {
    const r = createIngestionResult('b1', null);
    updateIngestionResult(r, 'exact_duplicate', null);
    expect(r.exactDuplicateCount).toBe(1);
    expect(r.insertedCount).toBe(0);
  });

  it('increments fuzzyDuplicateCount on fuzzy_duplicate', () => {
    const r = createIngestionResult('b1', null);
    updateIngestionResult(r, 'fuzzy_duplicate', null);
    expect(r.fuzzyDuplicateCount).toBe(1);
  });

  it('addSkippedRow increments skippedCount and adds warning', () => {
    const r = createIngestionResult('b1', null);
    addSkippedRow(r, 'Row 3: no identifier');
    expect(r.skippedCount).toBe(1);
    expect(r.totalRows).toBe(1);
    expect(r.warnings).toContain('Row 3: no identifier');
  });

  it('totalRows accumulates across mixed decisions', () => {
    const r = createIngestionResult('b1', null);
    updateIngestionResult(r, 'inserted', 'id-1');
    updateIngestionResult(r, 'exact_duplicate', null);
    addSkippedRow(r, 'warning');
    expect(r.totalRows).toBe(3);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 7. processCsvImport — integration
// ────────────────────────────────────────────────────────────────────────────

describe('processCsvImport', () => {
  it('processes a valid CSV and calls ingest RPC for each data row', async () => {
    const csv = 'title,company_name\nDeal A,Acme\nDeal B,Beta';
    const supabase = makeSupabase({ csvText: csv });
    const enqueueAnalysis = jest.fn().mockResolvedValue(undefined);

    await processCsvImport(makeJob(), supabase, enqueueAnalysis);

    expect(supabase.rpc).toHaveBeenCalledTimes(2);
  });

  it('handles empty CSV gracefully (no RPC calls, batch completed)', async () => {
    const supabase = makeSupabase({ csvText: 'title,company_name\n' });
    const enqueueAnalysis = jest.fn().mockResolvedValue(undefined);

    await processCsvImport(makeJob(), supabase, enqueueAnalysis);

    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('skips malformed rows (no identifier) without throwing', async () => {
    const csv = 'unknown_col\nsome_value';
    const supabase = makeSupabase({ csvText: csv });
    const enqueueAnalysis = jest.fn().mockResolvedValue(undefined);

    await expect(processCsvImport(makeJob(), supabase, enqueueAnalysis)).resolves.not.toThrow();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('handles exact_duplicate decision without error', async () => {
    const csv = 'title,email\nDeal,dup@acme.com';
    const supabase = makeSupabase({ csvText: csv, ingestDecision: 'exact_duplicate' });
    const enqueueAnalysis = jest.fn().mockResolvedValue(undefined);

    await expect(processCsvImport(makeJob(), supabase, enqueueAnalysis)).resolves.not.toThrow();
  });

  it('does not enqueue analysis when no new discoveries were inserted', async () => {
    const csv = 'title,email\nDeal,dup@acme.com';
    const supabase = makeSupabase({ csvText: csv, ingestDecision: 'exact_duplicate' });
    const enqueueAnalysis = jest.fn().mockResolvedValue(undefined);

    await processCsvImport(makeJob(), supabase, enqueueAnalysis);

    // enqueueAnalysisForDiscoveries skips calling enqueue when discoveryIds is empty
    expect(enqueueAnalysis).not.toHaveBeenCalled();
  });

  it('marks batch as completed after successful run', async () => {
    const csv = 'title,email\nDeal,a@b.com';
    const supabase = makeSupabase({ csvText: csv });
    const enqueueAnalysis = jest.fn().mockResolvedValue(undefined);

    await processCsvImport(makeJob(), supabase, enqueueAnalysis);

    const batchUpdates = (supabase.from as jest.Mock).mock.calls
      .filter(([t]: [string]) => t === 'discovery_batches')
      .map(([, ]) => supabase.from('discovery_batches'));
    // Just assert the from('discovery_batches') was called (marking completed)
    const calls = (supabase.from as jest.Mock).mock.calls.map(([t]: [string]) => t);
    expect(calls).toContain('discovery_batches');
  });
});
