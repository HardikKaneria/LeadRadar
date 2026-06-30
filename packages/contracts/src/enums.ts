/**
 * Canonical enums — the single source of truth shared by api, worker, web, and extension.
 * Mirror of docs/architecture/04-database-schema.md §"Canonical enums".
 */

export const DISCOVERY_SOURCES = [
  'linkedin',
  'upwork',
  'freelancer',
  'website',
  'referral',
  'manual',
  'csv',
  'whatsapp',
  'email',
  'existing_customer',
  'conference',
  'client_call',
  'partnership',
  'other',
] as const;
export type DiscoverySource = (typeof DISCOVERY_SOURCES)[number];

export const DISCOVERY_CHANNELS = ['extension', 'manual', 'csv', 'api'] as const;
export type DiscoveryChannel = (typeof DISCOVERY_CHANNELS)[number];

export const DISCOVERY_STATUSES = [
  'new',
  'processing',
  'analyzed',
  'reviewed',
  'approved',
  'ignored',
  'converted',
] as const;
export type DiscoveryStatus = (typeof DISCOVERY_STATUSES)[number];

export const OPPORTUNITY_STATUSES = [
  'open',
  'qualified',
  'promoted_to_lead',
  'ignored',
  'expired',
  'archived',
] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const RELATIONSHIP_NODE_TYPES = ['company', 'contact', 'opportunity'] as const;
export type RelationshipNodeType = (typeof RELATIONSHIP_NODE_TYPES)[number];

export const RELATIONSHIP_EDGE_TYPES = [
  'works_at',
  'decision_maker_for',
  'reports_to',
  'referred_by',
  'introduced_by',
  'partner_of',
  'competitor_of',
  'related_to',
] as const;
export type RelationshipEdgeType = (typeof RELATIONSHIP_EDGE_TYPES)[number];

export const ACTIVITY_TYPES = [
  'created',
  'status_changed',
  'converted',
  'assigned',
  'note_added',
  'attachment_added',
  'researched',
  'custom',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const LEAD_STAGES = [
  'new',
  'contacted',
  'reply_received',
  'meeting_scheduled',
  'proposal_sent',
  'negotiation',
  'won',
  'lost',
  'on_hold',
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

/** User-facing priority. Internal numeric weight is stored separately as priority_weight. */
export const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_WEIGHT: Record<Priority, number> = {
  critical: 100,
  high: 75,
  medium: 50,
  low: 25,
};

export const TASK_STATUSES = ['open', 'done', 'cancelled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const JOB_STATUSES = [
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
  'retrying',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const MEMBERSHIP_STATUSES = ['active', 'invited', 'disabled'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const AI_PRIVACY_MODES = [
  'free_api_allowed',
  'redact_pii_before_ai',
  'paid_only',
  'byok_only',
  'disabled',
] as const;
export type AiPrivacyMode = (typeof AI_PRIVACY_MODES)[number];

export const AI_SETTINGS_PROVIDER_NAMES = ['gemini', 'groq', 'openrouter'] as const;
export type AiSettingsProviderName = (typeof AI_SETTINGS_PROVIDER_NAMES)[number];

export const AI_PROVIDER_CONNECTION_STATUSES = ['connected', 'disconnected', 'error'] as const;
export type AiProviderConnectionStatus = (typeof AI_PROVIDER_CONNECTION_STATUSES)[number];

// ── Outreach & conversations (M11) ──
export const OUTREACH_CHANNELS = [
  'email',
  'linkedin',
  'whatsapp',
  'upwork',
  'freelancer',
  'phone',
  'meeting',
  'other',
] as const;
export type OutreachChannel = (typeof OUTREACH_CHANNELS)[number];

export const OUTREACH_DIRECTIONS = ['outbound', 'inbound', 'internal_note'] as const;
export type OutreachDirection = (typeof OUTREACH_DIRECTIONS)[number];

export const OUTREACH_STATUSES = ['draft', 'ready', 'sent', 'failed', 'received'] as const;
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];

// ── Proposals (M11 / P6-03) ──
export const PROPOSAL_STATUSES = ['draft', 'ready', 'sent', 'accepted', 'rejected', 'expired'] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

// ── Knowledge Engine (M12 / P7) ──
export const KNOWLEDGE_EVENT_TYPES = [
  'won',
  'lost',
  'on_hold',
  'no_response',
  'outreach_sent',
  'reply',
  'proposal_sent',
  'meeting_scheduled',
] as const;
export type KnowledgeEventType = (typeof KNOWLEDGE_EVENT_TYPES)[number];
