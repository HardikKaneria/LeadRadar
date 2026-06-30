import { createHash } from 'node:crypto';
import {
  DISCOVERY_SOURCES,
  type ExtensionCaptureItemInput,
  type DiscoveryIngestionResult,
  type DiscoverySource,
  type ManualDiscoveryInput,
} from '@radar/contracts';
import type { ServiceClient } from '@radar/supabase';

export interface NormalizedDiscoveryCandidate {
  source: DiscoverySource;
  rawPayload: Record<string, unknown>;
  title: string | null;
  description: string | null;
  companyName: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  country: string | null;
  budgetHint: number | null;
  dedupHash: string | null;
}

export interface CsvRecord {
  rowNumber: number;
  values: Record<string, string>;
}

interface IngestDecisionRow {
  decision: 'inserted' | 'exact_duplicate' | 'fuzzy_duplicate';
  discovery_id: string | null;
  matched_discovery_id: string | null;
}

const IDENTIFIER_FIELDS = ['title', 'description', 'companyName', 'contactName', 'email', 'phone', 'website'] as const;

const FIELD_ALIASES = {
  source: ['source', 'discovery_source', 'lead_source', 'origin'],
  title: ['title', 'opportunity', 'job_title', 'project_title', 'project', 'name'],
  description: ['description', 'details', 'summary', 'notes'],
  companyName: ['company_name', 'company', 'client', 'business', 'organization'],
  contactName: ['contact_name', 'contact', 'contact_person', 'owner'],
  email: ['email', 'contact_email'],
  phone: ['phone', 'contact_phone', 'telephone', 'mobile'],
  website: ['website', 'url', 'company_website', 'domain'],
  country: ['country', 'location', 'market'],
  budgetHint: ['budget', 'budget_hint', 'price', 'value', 'estimated_budget'],
} as const;

const COLUMN_ORDER = [
  'title',
  'description',
  'companyName',
  'contactName',
  'email',
  'phone',
  'website',
  'country',
  'budgetHint',
  'source',
] as const;

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = normalizeText(value);
  return normalized ? normalized.toLowerCase() : null;
}

function normalizePhone(value: string | null | undefined): string | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  const digits = normalized.replace(/[^\d]/g, '');
  return digits.length > 0 ? digits : null;
}

function normalizeWebsite(value: string | null | undefined): string | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  const candidate = normalized.match(/^[a-z]+:\/\//i) ? normalized : `https://${normalized}`;
  try {
    const url = new URL(candidate);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    const pathname = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
    return `https://${hostname}${pathname}`;
  } catch {
    return normalized.toLowerCase();
  }
}

function normalizeBudget(value: number | string | null | undefined): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const normalized = normalizeText(value);
  if (!normalized) return null;

  const numeric = normalized.replace(/[^0-9.-]/g, '');
  if (!numeric) return null;

  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSourceValue(value: string | null | undefined, fallback: DiscoverySource): DiscoverySource {
  const normalized = normalizeText(value);
  if (!normalized) return fallback;

  const candidate = normalized.toLowerCase().replace(/[\s-]+/g, '_') as DiscoverySource;
  return DISCOVERY_SOURCES.includes(candidate) ? candidate : fallback;
}

function buildDedupHash(candidate: Omit<NormalizedDiscoveryCandidate, 'rawPayload' | 'source'>): string | null {
  const key = [
    candidate.companyName,
    candidate.website,
    candidate.email,
    candidate.phone,
    candidate.title,
    candidate.country,
  ]
    .map((value) => value ?? '')
    .join('|');

  if (key.replace(/\|/g, '').length === 0) return null;
  return createHash('sha256').update(key).digest('hex');
}

function hasIdentifier(candidate: Pick<NormalizedDiscoveryCandidate, (typeof IDENTIFIER_FIELDS)[number]>): boolean {
  return IDENTIFIER_FIELDS.some((field) => candidate[field] != null);
}

function titleCase(value: string | null): string | null {
  if (!value) return null;
  return value
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function normalizeRowValue(row: Record<string, string>, field: keyof typeof FIELD_ALIASES): string | null {
  for (const alias of FIELD_ALIASES[field]) {
    const value = row[alias];
    if (value !== undefined) return normalizeText(value);
  }
  return null;
}

export function createIngestionResult(batchId: string, rawBlobUrl: string | null): DiscoveryIngestionResult {
  return {
    batchId,
    totalRows: 0,
    insertedCount: 0,
    exactDuplicateCount: 0,
    fuzzyDuplicateCount: 0,
    skippedCount: 0,
    discoveryIds: [],
    warnings: [],
    rawBlobUrl,
  };
}

export function updateIngestionResult(
  result: DiscoveryIngestionResult,
  decision: IngestDecisionRow['decision'],
  discoveryId: string | null,
): void {
  result.totalRows += 1;

  if (decision === 'inserted') {
    result.insertedCount += 1;
    if (discoveryId) result.discoveryIds.push(discoveryId);
    return;
  }

  if (decision === 'exact_duplicate') {
    result.exactDuplicateCount += 1;
    return;
  }

  result.fuzzyDuplicateCount += 1;
}

export function addSkippedRow(result: DiscoveryIngestionResult, warning: string): void {
  result.totalRows += 1;
  result.skippedCount += 1;
  result.warnings.push(warning);
}

export async function markJobRun(
  supabase: ServiceClient,
  jobRunId: string,
  patch: {
    status?: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'retrying';
    progress?: number;
    error?: string | null;
    result?: DiscoveryIngestionResult | Record<string, unknown> | null;
    started_at?: string | null;
    finished_at?: string | null;
  },
): Promise<void> {
  await supabase.from('job_runs').update(patch).eq('id', jobRunId);
}

export async function markBatch(
  supabase: ServiceClient,
  batchId: string,
  patch: {
    status?: 'pending' | 'processing' | 'completed' | 'failed';
    item_count?: number;
    error?: string | null;
  },
): Promise<void> {
  await supabase.from('discovery_batches').update(patch).eq('id', batchId);
}

export function normalizeManualEntry(entry: ManualDiscoveryInput): NormalizedDiscoveryCandidate {
  const candidate: NormalizedDiscoveryCandidate = {
    source: entry.source,
    rawPayload: {
      ...entry.rawPayload,
      _ingestionChannel: 'manual',
      notes: entry.notes ?? null,
    },
    title: normalizeText(entry.title),
    description: normalizeText(entry.description),
    companyName: normalizeText(entry.companyName),
    contactName: normalizeText(entry.contactName),
    email: normalizeEmail(entry.email),
    phone: normalizePhone(entry.phone),
    website: normalizeWebsite(entry.website),
    country: titleCase(normalizeText(entry.country)),
    budgetHint: normalizeBudget(entry.budgetHint),
    dedupHash: null,
  };
  candidate.dedupHash = buildDedupHash(candidate);
  return candidate;
}

export function normalizeCsvRecord(
  record: CsvRecord,
  defaultSource: DiscoverySource,
  fileName: string,
): { candidate: NormalizedDiscoveryCandidate } | { warning: string } {
  const source = normalizeSourceValue(normalizeRowValue(record.values, 'source'), defaultSource);
  const candidate: NormalizedDiscoveryCandidate = {
    source,
    rawPayload: {
      ...record.values,
      _ingestionChannel: 'csv',
      _fileName: fileName,
      _rowNumber: record.rowNumber,
    },
    title: normalizeRowValue(record.values, 'title'),
    description: normalizeRowValue(record.values, 'description'),
    companyName: normalizeRowValue(record.values, 'companyName'),
    contactName: normalizeRowValue(record.values, 'contactName'),
    email: normalizeEmail(normalizeRowValue(record.values, 'email')),
    phone: normalizePhone(normalizeRowValue(record.values, 'phone')),
    website: normalizeWebsite(normalizeRowValue(record.values, 'website')),
    country: titleCase(normalizeRowValue(record.values, 'country')),
    budgetHint: normalizeBudget(normalizeRowValue(record.values, 'budgetHint')),
    dedupHash: null,
  };

  if (!hasIdentifier(candidate)) {
    return { warning: `Row ${record.rowNumber}: skipped because it has no identifying fields.` };
  }

  candidate.dedupHash = buildDedupHash(candidate);
  return { candidate };
}

export function normalizeExtensionItem(
  item: ExtensionCaptureItemInput,
  fallbackSource: DiscoverySource,
  context: {
    parserVersion: string;
    capturedUrl: string;
    capturedAt: string;
    itemIndex: number;
  },
): { candidate: NormalizedDiscoveryCandidate } | { warning: string } {
  const candidate: NormalizedDiscoveryCandidate = {
    source: fallbackSource,
    rawPayload: {
      ...item.raw,
      _ingestionChannel: 'extension',
      _parserVersion: context.parserVersion,
      _capturedUrl: context.capturedUrl,
      _capturedAt: context.capturedAt,
      _itemIndex: context.itemIndex,
      _itemUrl: item.url ?? null,
    },
    title: normalizeText(item.title),
    description: normalizeText(item.description),
    companyName: normalizeText(item.companyName),
    contactName: normalizeText(item.contactName),
    email: normalizeEmail(item.email),
    phone: normalizePhone(item.phone),
    website: normalizeWebsite(item.website ?? item.url),
    country: titleCase(normalizeText(item.country)),
    budgetHint: normalizeBudget(item.budgetHint),
    dedupHash: null,
  };

  if (!hasIdentifier(candidate)) {
    return { warning: `Item ${context.itemIndex}: skipped because it has no identifying fields.` };
  }

  candidate.dedupHash = buildDedupHash(candidate);
  return { candidate };
}

export async function ingestCandidate(
  supabase: ServiceClient,
  organizationId: string,
  batchId: string,
  createdBy: string,
  candidate: NormalizedDiscoveryCandidate,
): Promise<IngestDecisionRow> {
  const { data, error } = await supabase.rpc('ingest_discovery_candidate', {
    p_org: organizationId,
    p_batch: batchId,
    p_source: candidate.source,
    p_raw_payload: candidate.rawPayload,
    p_title: candidate.title,
    p_description: candidate.description,
    p_company_name: candidate.companyName,
    p_contact_name: candidate.contactName,
    p_email: candidate.email,
    p_phone: candidate.phone,
    p_website: candidate.website,
    p_country: candidate.country,
    p_budget_hint: candidate.budgetHint,
    p_dedup_hash: candidate.dedupHash,
    p_created_by: createdBy,
  });

  if (error) {
    throw new Error(`Failed to ingest discovery candidate: ${error.message}`);
  }

  const row = (Array.isArray(data) ? data[0] : data) as IngestDecisionRow | null;
  if (!row) {
    throw new Error('Discovery ingestion RPC returned no result');
  }

  return row;
}

export async function waitForStorageObject(
  supabase: ServiceClient,
  bucket: string,
  path: string,
  maxAttempts = 24,
  delayMs = 5000,
): Promise<string> {
  let lastMessage = 'CSV upload was not found in object storage.';

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (data) return await data.text();

    if (error && !/not found/i.test(error.message)) {
      throw new Error(`Failed to read CSV upload: ${error.message}`);
    }

    lastMessage = error?.message ?? lastMessage;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error(lastMessage);
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ',') {
      row.push(cell);
      cell = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') {
        i += 1;
      }

      row.push(cell);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function buildCsvRecords(text: string, hasHeader: boolean): CsvRecord[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];

  const headers = hasHeader
    ? rows[0]!.map(normalizeHeader)
    : COLUMN_ORDER.map((header) => FIELD_ALIASES[header]?.[0] ?? header);

  const startIndex = hasHeader ? 1 : 0;
  return rows.slice(startIndex).map((values, index) => {
    const record: Record<string, string> = {};

    headers.forEach((header, columnIndex) => {
      record[header] = values[columnIndex]?.trim() ?? '';
    });

    return {
      rowNumber: startIndex + index + 1,
      values: record,
    };
  });
}
