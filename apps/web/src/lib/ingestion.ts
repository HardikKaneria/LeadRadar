
// Capture data layer (P2-08). Manual + CSV intake go through the thin API (see lib/api.ts);
// the signed CSV file upload goes straight to Supabase Storage with the short-lived token the
// API hands back. The CSV preview/mapping below is a UX aid only — the worker
// (apps/worker/src/processors/discovery-ingestion.ts) is the source of truth for how columns
// are aliased and rows are normalized, so keep the alias list here in sync with that file.

import type { CsvUploadTarget } from '@radar/contracts';
import { supabase } from './supabase';

/** Discovery fields the CSV importer can populate, in the order the worker emits them. */
export const CSV_FIELDS = [
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

export type CsvField = (typeof CSV_FIELDS)[number];

export const CSV_FIELD_LABELS: Record<CsvField, string> = {
  title: 'Title',
  description: 'Description',
  companyName: 'Company',
  contactName: 'Contact',
  email: 'Email',
  phone: 'Phone',
  website: 'Website',
  country: 'Country',
  budgetHint: 'Budget',
  source: 'Source',
};

// Mirror of FIELD_ALIASES in the worker. Header matching is case-insensitive and ignores
// spaces/underscores so "Company Name", "company_name" and "companyname" all match.
const FIELD_ALIASES: Record<CsvField, string[]> = {
  title: ['title', 'opportunity', 'job_title', 'project_title', 'project', 'name'],
  description: ['description', 'details', 'summary', 'notes'],
  companyName: ['company_name', 'company', 'client', 'business', 'organization'],
  contactName: ['contact_name', 'contact', 'contact_person', 'owner'],
  email: ['email', 'contact_email'],
  phone: ['phone', 'contact_phone', 'telephone', 'mobile'],
  website: ['website', 'url', 'company_website', 'domain'],
  country: ['country', 'location', 'market'],
  budgetHint: ['budget', 'budget_hint', 'price', 'value', 'estimated_budget'],
  source: ['source', 'discovery_source', 'lead_source', 'origin'],
};

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[\s_]+/g, '');
}

export interface CsvPreview {
  /** Column headers (synthesized as "Column N" when the file has no header row). */
  headers: string[];
  /** First few data rows for the preview table. */
  sampleRows: string[][];
  /** Total number of data rows detected in the file. */
  totalRows: number;
  /** Detected mapping: discovery field → matched header label (or null when unmatched). */
  mapping: Record<CsvField, string | null>;
}

/**
 * Minimal RFC-4180-ish CSV parser, enough for a client-side preview. Handles quoted fields,
 * escaped quotes, and CRLF/CR line endings. The authoritative parse happens in the worker.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

function detectMapping(headers: string[]): Record<CsvField, string | null> {
  const normalized = headers.map(normalizeHeader);
  const mapping = {} as Record<CsvField, string | null>;

  for (const field of CSV_FIELDS) {
    const aliases = FIELD_ALIASES[field].map(normalizeHeader);
    const index = normalized.findIndex((header) => aliases.includes(header));
    mapping[field] = index >= 0 ? headers[index] : null;
  }

  return mapping;
}

const PREVIEW_ROW_LIMIT = 5;

/** Read a CSV file in the browser and produce a preview + detected field mapping. */
export async function previewCsv(file: File, hasHeader: boolean): Promise<CsvPreview> {
  const text = await file.text();
  const rows = parseCsv(text);

  if (rows.length === 0) {
    return { headers: [], sampleRows: [], totalRows: 0, mapping: detectMapping([]) };
  }

  const columnCount = rows.reduce((max, r) => Math.max(max, r.length), 0);
  const headers = hasHeader
    ? rows[0].map((cell, index) => cell.trim() || `Column ${index + 1}`)
    : Array.from({ length: columnCount }, (_, index) => `Column ${index + 1}`);

  const dataRows = hasHeader ? rows.slice(1) : rows;

  return {
    headers,
    sampleRows: dataRows.slice(0, PREVIEW_ROW_LIMIT),
    totalRows: dataRows.length,
    mapping: hasHeader ? detectMapping(headers) : detectMapping([]),
  };
}

/** Upload the CSV file to the signed Storage target the API returned. */
export async function uploadCsvFile(target: CsvUploadTarget, file: File): Promise<void> {
  const { error } = await supabase.storage
    .from(target.bucket)
    .uploadToSignedUrl(target.path, target.token, file);

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }
}

/** Fresh idempotency key per submission attempt so retries replay rather than duplicate. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
