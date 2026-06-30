
// Companies & contacts data layer (P4-02). Direct supabase-js access under RLS: reads use the
// `opportunities.read` SELECT policy; dedup-aware writes + merges go through the SECURITY DEFINER
// RPCs (`upsert_company`, `upsert_contact`, `merge_companies`, `merge_contacts`) gated by
// `opportunities.write`. See supabase/migrations/0021_companies_contacts.sql. Org-scoped by RLS.

import type {
  CompanyDetail,
  CompanyFilter,
  CompanyListResult,
  CompanySummary,
  ContactSummary,
  MergeEntitiesInput,
  UpsertCompanyInput,
  UpsertContactInput,
} from '@radar/contracts';
import { supabase } from './supabase';

const COMPANY_SUMMARY_COLS = 'id, name, domain, industry, country, size, created_at';
const COMPANY_DETAIL_COLS = `${COMPANY_SUMMARY_COLS}, tech_stack, enrichment, created_by, updated_at`;
const CONTACT_COLS = 'id, company_id, name, email, phone, title, linkedin_url, created_at';

interface CompanySummaryRow {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  country: string | null;
  size: string | null;
  created_at: string;
}

interface CompanyDetailRow extends CompanySummaryRow {
  tech_stack: string[];
  enrichment: unknown;
  created_by: string | null;
  updated_at: string;
}

interface ContactRow {
  id: string;
  company_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  linkedin_url: string | null;
  created_at: string;
}

function toCompanySummary(row: CompanySummaryRow): CompanySummary {
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    industry: row.industry,
    country: row.country,
    size: row.size,
    createdAt: row.created_at,
  };
}

function toCompanyDetail(row: CompanyDetailRow): CompanyDetail {
  return {
    ...toCompanySummary(row),
    techStack: row.tech_stack ?? [],
    enrichment: row.enrichment,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
  };
}

function toContact(row: ContactRow): ContactSummary {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    title: row.title,
    linkedinUrl: row.linkedin_url,
    createdAt: row.created_at,
  };
}

export async function listCompanies(
  organizationId: string,
  filter: CompanyFilter,
): Promise<CompanyListResult> {
  let q = supabase
    .from('companies')
    .select(COMPANY_SUMMARY_COLS, { count: 'exact' })
    .eq('organization_id', organizationId)
    .is('deleted_at', null);

  if (filter.search) q = q.ilike('name', `%${filter.search}%`);
  if (filter.industry) q = q.eq('industry', filter.industry);
  if (filter.country) q = q.eq('country', filter.country);

  q =
    filter.sort === 'newest'
      ? q.order('created_at', { ascending: false })
      : q.order('name', { ascending: true });

  const from = (filter.page - 1) * filter.pageSize;
  q = q.range(from, from + filter.pageSize - 1);

  const { data, count, error } = await q;
  if (error) throw error;

  return {
    items: ((data ?? []) as unknown as CompanySummaryRow[]).map(toCompanySummary),
    total: count ?? 0,
    page: filter.page,
    pageSize: filter.pageSize,
  };
}

export async function getCompany(
  organizationId: string,
  id: string,
): Promise<CompanyDetail | null> {
  const { data, error } = await supabase
    .from('companies')
    .select(COMPANY_DETAIL_COLS)
    .eq('organization_id', organizationId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data ? toCompanyDetail(data as unknown as CompanyDetailRow) : null;
}

export async function listCompanyContacts(
  organizationId: string,
  companyId: string,
): Promise<ContactSummary[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select(CONTACT_COLS)
    .eq('organization_id', organizationId)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('name', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as ContactRow[]).map(toContact);
}

/** Upsert a company (dedup on domain, else name) for the active org. */
export async function upsertCompany(
  organizationId: string,
  input: UpsertCompanyInput,
): Promise<CompanyDetail> {
  const { data, error } = await supabase.rpc('upsert_company', {
    p_org: organizationId,
    p_name: input.name,
    p_domain: input.domain ?? null,
    p_industry: input.industry ?? null,
    p_country: input.country ?? null,
    p_size: input.size ?? null,
    p_tech_stack: input.techStack ?? null,
  });
  if (error) throw error;
  return toCompanyDetail(data as unknown as CompanyDetailRow);
}

/** Upsert a contact (dedup on email, else company+name) for the active org. */
export async function upsertContact(
  organizationId: string,
  input: UpsertContactInput,
): Promise<ContactSummary> {
  const { data, error } = await supabase.rpc('upsert_contact', {
    p_org: organizationId,
    p_name: input.name,
    p_company: input.companyId ?? null,
    p_email: input.email ?? null,
    p_phone: input.phone ?? null,
    p_title: input.title ?? null,
    p_linkedin_url: input.linkedinUrl ?? null,
  });
  if (error) throw error;
  return toContact(data as unknown as ContactRow);
}

export async function mergeCompanies(input: MergeEntitiesInput): Promise<CompanyDetail> {
  const { data, error } = await supabase.rpc('merge_companies', {
    p_primary: input.primaryId,
    p_duplicate: input.duplicateId,
  });
  if (error) throw error;
  return toCompanyDetail(data as unknown as CompanyDetailRow);
}

export async function mergeContacts(input: MergeEntitiesInput): Promise<ContactSummary> {
  const { data, error } = await supabase.rpc('merge_contacts', {
    p_primary: input.primaryId,
    p_duplicate: input.duplicateId,
  });
  if (error) throw error;
  return toContact(data as unknown as ContactRow);
}
