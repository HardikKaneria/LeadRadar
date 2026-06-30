import type { Json } from '@radar/supabase';

export type LeadHuntingRouteDecision =
  | 'qualified_lead'
  | 'needs_review'
  | 'archived'
  | 'rejected';

export interface LeadHuntingDecisionSignals {
  classification: string;
  leadScore: number;
  isActualLead: boolean;
}

export interface ResolvedPerson {
  name: string | null;
  headline: string | null;
  linkedinUrl: string | null;
  confidence: number;
  summary: string | null;
}

export interface ResolvedCompany {
  name: string | null;
  linkedinUrl: string | null;
  website: string | null;
  domain: string | null;
  country: string | null;
  confidence: number;
  summary: string | null;
}

export interface ResolvedWebsite {
  url: string | null;
  domain: string | null;
  confidence: number;
  summary: string | null;
}

export interface ResolvedEmail {
  email: string | null;
  confidence: number;
  source: 'explicit' | 'inferred' | 'none';
  summary: string | null;
}

export interface ManagementContact {
  name: string;
  title: string | null;
  sourceUrl: string | null;
}

export interface ResolvedManagement {
  contacts: ManagementContact[];
  confidence: number;
  summary: string | null;
}

export interface ResolvedCountry {
  country: string | null;
  confidence: number;
  summary: string | null;
}

export interface ResearchStageSnapshot<TData = Json> {
  completedAt?: string;
  cached?: boolean;
  sourceProvider?: string | null;
  sourceType?: string | null;
  sourceUrl?: string | null;
  error?: string | null;
  data?: TData;
}

export interface LeadHuntingResearchReportState {
  schemaVersion: 1;
  stages: Record<string, ResearchStageSnapshot>;
  person?: ResolvedPerson;
  company?: ResolvedCompany;
  website?: ResolvedWebsite;
  email?: ResolvedEmail;
  management?: ResolvedManagement;
  country?: ResolvedCountry;
  notes?: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeReportState(value: Json | null | undefined): LeadHuntingResearchReportState {
  if (!isRecord(value) || !isRecord(value.stages)) {
    return { schemaVersion: 1, stages: {} };
  }

  return {
    schemaVersion: 1,
    stages: value.stages as Record<string, ResearchStageSnapshot>,
    person: isRecord(value.person) ? (value.person as unknown as ResolvedPerson) : undefined,
    company: isRecord(value.company) ? (value.company as unknown as ResolvedCompany) : undefined,
    website: isRecord(value.website) ? (value.website as unknown as ResolvedWebsite) : undefined,
    email: isRecord(value.email) ? (value.email as unknown as ResolvedEmail) : undefined,
    management: isRecord(value.management)
      ? (value.management as unknown as ResolvedManagement)
      : undefined,
    country: isRecord(value.country) ? (value.country as unknown as ResolvedCountry) : undefined,
    notes: Array.isArray(value.notes)
      ? value.notes.filter((entry): entry is string => typeof entry === 'string')
      : [],
  };
}

export function canonicalHost(value: string | null | undefined): string | null {
  if (!value) return null;

  const candidate = value.match(/^[a-z]+:\/\//i) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return value.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] ?? null;
  }
}

export function canonicalWebsite(value: string | null | undefined): string | null {
  const host = canonicalHost(value);
  return host ? `https://${host}` : null;
}

export function firstMeaningfulLine(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  for (const line of value.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length >= 12) return trimmed;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function clampScore(value: number | null | undefined, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(100, Math.max(0, value));
}

export function determineLeadHuntingDecision(
  signals: LeadHuntingDecisionSignals,
): LeadHuntingRouteDecision {
  if (signals.classification === 'spam' || signals.classification === 'irrelevant') {
    return 'rejected';
  }

  if (signals.isActualLead && signals.leadScore >= 75) {
    return 'qualified_lead';
  }

  if (signals.isActualLead || signals.leadScore >= 45) {
    return 'needs_review';
  }

  return 'archived';
}
