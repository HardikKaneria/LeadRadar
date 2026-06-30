
// Company Brain data layer (P2-01). Reads go directly through supabase-js under the
// `company_brain.manage` SELECT policy; writes go through the versioning RPC so only one
// profile stays active and version numbers advance atomically per org.

import {
  companyBadLeadRulesSchema,
  companyProfileIdealCustomerSchema,
  companyProfileInputSchema,
  type CompanyProfileInput,
  type CompanyProfileVersion,
} from '@radar/contracts';
import { supabase } from './supabase';

const PROFILE_COLS =
  'id, organization_id, version, is_active, services, priority_services, target_industries, ideal_customer, target_countries, min_budget, bad_lead_rules, outreach_tone, created_by, created_at';

interface ProfileRow {
  id: string;
  organization_id: string;
  version: number;
  is_active: boolean;
  services: string[] | null;
  priority_services: string[] | null;
  target_industries: string[] | null;
  ideal_customer: unknown;
  target_countries: string[] | null;
  min_budget: number | null;
  bad_lead_rules: unknown;
  outreach_tone: string | null;
  created_by: string | null;
  created_at: string;
}

function toCompanyProfile(row: ProfileRow): CompanyProfileVersion {
  return {
    id: row.id,
    organizationId: row.organization_id,
    version: row.version,
    isActive: row.is_active,
    services: row.services ?? [],
    priorityServices: row.priority_services ?? [],
    targetIndustries: row.target_industries ?? [],
    idealCustomer: companyProfileIdealCustomerSchema.parse(row.ideal_customer ?? {}),
    targetCountries: row.target_countries ?? [],
    minBudget: row.min_budget,
    badLeadRules: companyBadLeadRulesSchema.parse(row.bad_lead_rules ?? undefined),
    outreachTone: row.outreach_tone,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export async function getActiveCompanyProfile(
  organizationId: string,
): Promise<CompanyProfileVersion | null> {
  const { data, error } = await supabase
    .from('company_profiles')
    .select(PROFILE_COLS)
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw error;
  return data ? toCompanyProfile(data as unknown as ProfileRow) : null;
}

export async function listCompanyProfileVersions(
  organizationId: string,
): Promise<CompanyProfileVersion[]> {
  const { data, error } = await supabase
    .from('company_profiles')
    .select(PROFILE_COLS)
    .eq('organization_id', organizationId)
    .order('version', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as unknown as ProfileRow[]).map(toCompanyProfile);
}

export async function createCompanyProfileVersion(
  organizationId: string,
  input: CompanyProfileInput,
): Promise<CompanyProfileVersion> {
  const profile = companyProfileInputSchema.parse(input);

  const { data, error } = await supabase.rpc('create_company_profile_version', {
    org: organizationId,
    services: profile.services,
    priority_services: profile.priorityServices,
    target_industries: profile.targetIndustries,
    ideal_customer: profile.idealCustomer,
    target_countries: profile.targetCountries,
    min_budget: profile.minBudget ?? null,
    bad_lead_rules: profile.badLeadRules,
    outreach_tone: profile.outreachTone ?? null,
  });

  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : data) as ProfileRow | null;
  if (!row) throw new Error('Company Brain RPC returned no profile row');

  return toCompanyProfile(row);
}
