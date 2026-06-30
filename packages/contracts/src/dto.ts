/**
 * Shared request/response contracts (zod schemas + inferred types).
 * Auth itself is handled by Supabase (supabase-js); these cover org/member forms and
 * the thin API surface.
 */
import { z } from 'zod';
import {
  AI_PRIVACY_MODES,
  AI_PROVIDER_CONNECTION_STATUSES,
  AI_SETTINGS_PROVIDER_NAMES,
  DISCOVERY_SOURCES,
  DISCOVERY_STATUSES,
  LEAD_STAGES,
  MEMBERSHIP_STATUSES,
  OPPORTUNITY_STATUSES,
  OUTREACH_CHANNELS,
  OUTREACH_DIRECTIONS,
  OUTREACH_STATUSES,
  PRIORITIES,
  PROPOSAL_STATUSES,
  RELATIONSHIP_EDGE_TYPES,
  RELATIONSHIP_NODE_TYPES,
  type ActivityType,
  type AiPrivacyMode,
  type AiProviderConnectionStatus,
  type AiSettingsProviderName,
  type DiscoveryChannel,
  type DiscoverySource,
  type DiscoveryStatus,
  type JobStatus,
  type LeadStage,
  type OpportunityStatus,
  type OutreachChannel,
  type OutreachDirection,
  type OutreachStatus,
  type Priority,
  type ProposalStatus,
  type RelationshipEdgeType,
  type RelationshipNodeType,
  type TaskStatus,
} from './enums';
import { ASSIGNABLE_ROLES } from './permissions';

export interface Profile {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
}

const boundedString = (max: number) => z.string().trim().min(1).max(max);
const boundedStringArray = (maxItemLength: number, maxItems = 50) =>
  z.array(boundedString(maxItemLength)).max(maxItems).default([]);

const EMPTY_COMPANY_PROFILE_IDEAL_CUSTOMER = {
  companySizes: [],
  buyerRoles: [],
  regions: [],
  painPoints: [],
};

const EMPTY_COMPANY_BAD_LEAD_RULES = {
  logic: 'any' as const,
  rules: [],
};

// ── Org / members (used by web forms; enforced in DB by RLS) ──
export const createOrgSchema = z.object({ name: z.string().min(1).max(120) });
export type CreateOrgInput = z.infer<typeof createOrgSchema>;

export const orgSettingsSchema = z.object({
  scoreThreshold: z.number().int().min(0).max(100).optional(),
  businessHours: z
    .object({ start: z.string(), end: z.string(), timezone: z.string() })
    .partial()
    .optional(),
  followUpDefaults: z.object({ defaultDueInHours: z.number().int().positive() }).partial().optional(),
  privacyMode: z.enum(AI_PRIVACY_MODES).optional(),
});
export type OrgSettingsInput = z.infer<typeof orgSettingsSchema>;

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  roleSlug: z.enum(ASSIGNABLE_ROLES),
  password: z.string().min(8).optional(),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const updateMemberSchema = z.object({
  roleSlug: z.enum(ASSIGNABLE_ROLES).optional(),
  status: z.enum(MEMBERSHIP_STATUSES).optional(),
});
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

// ── Company Brain (P2-01) — versioned org profile, stored via supabase-js + RPC under RLS ──

export const COMPANY_BAD_LEAD_RULE_FIELDS = [
  'industry',
  'country',
  'keyword',
  'company_name',
  'budget',
  'website',
] as const;
export const COMPANY_BAD_LEAD_RULE_OPERATORS = [
  'equals',
  'contains',
  'in',
  'lt',
  'gt',
  'exists',
  'not_exists',
] as const;
export const COMPANY_BAD_LEAD_RULE_LOGICS = ['any', 'all'] as const;

const companyBadLeadRuleValueSchema = z.union([
  boundedString(240),
  z.number().nonnegative(),
  z.array(boundedString(240)).min(1).max(50),
]);

export const companyProfileIdealCustomerSchema = z
  .object({
    summary: z.string().trim().max(2000).optional(),
    companySizes: boundedStringArray(120),
    buyerRoles: boundedStringArray(120),
    regions: boundedStringArray(120),
    painPoints: boundedStringArray(240),
    notes: z.string().trim().max(2000).optional(),
  })
  .default(EMPTY_COMPANY_PROFILE_IDEAL_CUSTOMER);
export type CompanyProfileIdealCustomer = z.infer<typeof companyProfileIdealCustomerSchema>;

export const companyBadLeadRuleSchema = z
  .object({
    field: z.enum(COMPANY_BAD_LEAD_RULE_FIELDS),
    operator: z.enum(COMPANY_BAD_LEAD_RULE_OPERATORS),
    value: companyBadLeadRuleValueSchema.optional(),
  })
  .superRefine((rule, ctx) => {
    const expectsValue = rule.operator !== 'exists' && rule.operator !== 'not_exists';

    if (expectsValue && rule.value === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'value is required for this operator',
        path: ['value'],
      });
      return;
    }

    if (!expectsValue && rule.value !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'value must be omitted for exists / not_exists',
        path: ['value'],
      });
    }

    if (rule.field === 'website' && expectsValue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'website rules only support exists / not_exists',
        path: ['operator'],
      });
    }

    if (expectsValue && rule.field === 'budget' && typeof rule.value !== 'number') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'budget rules require a numeric value',
        path: ['value'],
      });
    }

    if (rule.operator === 'in' && !Array.isArray(rule.value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '`in` rules require a list of strings',
        path: ['value'],
      });
    }

    if (
      (rule.operator === 'contains' || rule.operator === 'equals') &&
      rule.field !== 'budget' &&
      rule.value !== undefined &&
      typeof rule.value !== 'string'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'this rule requires a string value',
        path: ['value'],
      });
    }
  });
export type CompanyBadLeadRule = z.infer<typeof companyBadLeadRuleSchema>;

export const companyBadLeadRulesSchema = z
  .object({
    logic: z.enum(COMPANY_BAD_LEAD_RULE_LOGICS).default('any'),
    rules: z.array(companyBadLeadRuleSchema).max(50).default([]),
  })
  .default(EMPTY_COMPANY_BAD_LEAD_RULES);
export type CompanyBadLeadRules = z.infer<typeof companyBadLeadRulesSchema>;

export const companyProfileInputSchema = z
  .object({
    services: boundedStringArray(120),
    priorityServices: boundedStringArray(120),
    targetIndustries: boundedStringArray(120),
    idealCustomer: companyProfileIdealCustomerSchema.default(EMPTY_COMPANY_PROFILE_IDEAL_CUSTOMER),
    targetCountries: boundedStringArray(120),
    minBudget: z.number().nonnegative().max(999999999999.99).nullable().optional(),
    badLeadRules: companyBadLeadRulesSchema.default(EMPTY_COMPANY_BAD_LEAD_RULES),
    outreachTone: z.string().trim().min(1).max(240).nullable().optional(),
  })
  .superRefine((profile, ctx) => {
    const missing = profile.priorityServices.filter((service) => !profile.services.includes(service));
    if (missing.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `priorityServices must also be listed in services: ${missing.join(', ')}`,
        path: ['priorityServices'],
      });
    }
  });
export type CompanyProfileInput = z.infer<typeof companyProfileInputSchema>;

export interface CompanyProfileVersion {
  id: string;
  organizationId: string;
  version: number;
  isActive: boolean;
  services: string[];
  priorityServices: string[];
  targetIndustries: string[];
  idealCustomer: CompanyProfileIdealCustomer;
  targetCountries: string[];
  minBudget: number | null;
  badLeadRules: CompanyBadLeadRules;
  outreachTone: string | null;
  createdBy: string | null;
  createdAt: string;
}

// ── Discovery Inbox (P2-06) — data contract for the supabase-js + RLS access layer ──

/** Statuses a user can set from the Inbox. System-driven states (processing/analyzed/converted)
 *  are excluded. `approved` only marks intent here; opportunity conversion is P4-01. */
export const DISCOVERY_INBOX_STATUSES = ['new', 'reviewed', 'approved', 'ignored'] as const;
export type DiscoveryInboxStatus = (typeof DISCOVERY_INBOX_STATUSES)[number];

export const DISCOVERY_SORTS = ['newest', 'oldest'] as const;
export type DiscoverySort = (typeof DISCOVERY_SORTS)[number];

export const discoveryFilterSchema = z.object({
  status: z.array(z.enum(DISCOVERY_STATUSES)).optional(),
  source: z.array(z.enum(DISCOVERY_SOURCES)).optional(),
  country: z.string().trim().min(1).max(120).optional(),
  search: z.string().trim().max(200).optional(),
  batchId: z.string().uuid().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
  sort: z.enum(DISCOVERY_SORTS).default('newest'),
});
export type DiscoveryFilter = z.infer<typeof discoveryFilterSchema>;

export const updateDiscoveryStatusSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  status: z.enum(DISCOVERY_INBOX_STATUSES),
});
export type UpdateDiscoveryStatusInput = z.infer<typeof updateDiscoveryStatusSchema>;

export interface DiscoverySummary {
  id: string;
  source: DiscoverySource;
  status: DiscoveryStatus;
  title: string | null;
  companyName: string | null;
  country: string | null;
  budgetHint: number | null;
  assignedToUserId: string | null;
  captureChannel: DiscoveryChannel | null;
  createdAt: string;
}

export interface DiscoveryDetail extends DiscoverySummary {
  batchId: string | null;
  description: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  dedupHash: string | null;
  rawPayload: unknown;
  capturedByUserId: string | null;
  reviewedByUserId: string | null;
  approvedByUserId: string | null;
  updatedAt: string;
}

export interface DiscoveryListResult {
  items: DiscoverySummary[];
  total: number;
  page: number;
  pageSize: number;
}

// ── Opportunities (P4-01) — supabase-js + RLS access layer; conversion via RPC ──

export const OPPORTUNITY_SORTS = ['score', 'heat', 'newest', 'priority'] as const;
export type OpportunitySort = (typeof OPPORTUNITY_SORTS)[number];

export const opportunityFilterSchema = z.object({
  status: z.array(z.enum(OPPORTUNITY_STATUSES)).optional(),
  priority: z.array(z.enum(PRIORITIES)).optional(),
  ownerId: z.string().uuid().optional(),
  search: z.string().trim().max(200).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
  sort: z.enum(OPPORTUNITY_SORTS).default('score'),
});
export type OpportunityFilter = z.infer<typeof opportunityFilterSchema>;

/** Statuses an operator can set from the Opportunities UI (system states excluded). */
export const OPPORTUNITY_SET_STATUSES = ['open', 'qualified', 'ignored', 'archived'] as const;
export type OpportunitySetStatus = (typeof OPPORTUNITY_SET_STATUSES)[number];

export const updateOpportunityStatusSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  status: z.enum(OPPORTUNITY_SET_STATUSES),
});
export type UpdateOpportunityStatusInput = z.infer<typeof updateOpportunityStatusSchema>;

export const convertDiscoverySchema = z.object({
  discoveryId: z.string().uuid(),
  ownerId: z.string().uuid().optional(),
  force: z.boolean().default(false),
});
export type ConvertDiscoveryInput = z.infer<typeof convertDiscoverySchema>;

export interface OpportunitySummary {
  id: string;
  title: string;
  status: OpportunityStatus;
  score: number;
  priority: Priority;
  priorityWeight: number;
  heatScore: number;
  potentialValue: number | null;
  ownerId: string | null;
  discoveryId: string | null;
  createdAt: string;
}

export interface OpportunityDetail extends OpportunitySummary {
  description: string | null;
  currency: string | null;
  expiresAt: string | null;
  recommendedAction: string | null;
  aiExplanation: string | null;
  companyId: string | null;
  primaryContactId: string | null;
  createdBy: string | null;
  updatedAt: string;
}

export interface OpportunityListResult {
  items: OpportunitySummary[];
  total: number;
  page: number;
  pageSize: number;
}

// ── Leads (P5-01) — supabase-js + RLS access layer; promote/close via RPC ──

export const LEAD_SORTS = ['newest', 'updated', 'score', 'priority'] as const;
export type LeadSort = (typeof LEAD_SORTS)[number];

export const leadFilterSchema = z.object({
  stage: z.array(z.enum(LEAD_STAGES)).optional(),
  priority: z.array(z.enum(PRIORITIES)).optional(),
  ownerId: z.string().uuid().optional(),
  search: z.string().trim().max(200).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
  sort: z.enum(LEAD_SORTS).default('updated'),
});
export type LeadFilter = z.infer<typeof leadFilterSchema>;

/** Stages an operator can set directly from the pipeline UI. Terminal won/lost go through close. */
export const LEAD_SET_STAGES = [
  'new',
  'contacted',
  'reply_received',
  'meeting_scheduled',
  'proposal_sent',
  'negotiation',
  'on_hold',
] as const;
export type LeadSetStage = (typeof LEAD_SET_STAGES)[number];

export const updateLeadStageSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  stage: z.enum(LEAD_SET_STAGES),
});
export type UpdateLeadStageInput = z.infer<typeof updateLeadStageSchema>;

export const promoteOpportunitySchema = z.object({
  opportunityId: z.string().uuid(),
  ownerId: z.string().uuid().optional(),
});
export type PromoteOpportunityInput = z.infer<typeof promoteOpportunitySchema>;

export const LEAD_CLOSE_OUTCOMES = ['won', 'lost'] as const;
export type LeadCloseOutcome = (typeof LEAD_CLOSE_OUTCOMES)[number];

export const closeLeadSchema = z.object({
  leadId: z.string().uuid(),
  outcome: z.enum(LEAD_CLOSE_OUTCOMES),
  reason: z.string().trim().max(2000).optional(),
});
export type CloseLeadInput = z.infer<typeof closeLeadSchema>;

export interface LeadSummary {
  id: string;
  title: string;
  stage: LeadStage;
  score: number;
  priority: Priority;
  priorityWeight: number;
  value: number | null;
  ownerId: string | null;
  opportunityId: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface LeadDetail extends LeadSummary {
  description: string | null;
  currency: string | null;
  source: string | null;
  companyId: string | null;
  primaryContactId: string | null;
  closeReason: string | null;
  closedAt: string | null;
  createdBy: string | null;
}

export interface LeadListResult {
  items: LeadSummary[];
  total: number;
  page: number;
  pageSize: number;
}

// ── Tasks / Follow-Up Intelligence (P5-02) — supabase-js + RLS; complete/cancel via guarded RPC ──

/** Queue tabs for the `/tasks` surface. `overdue`/`today`/`upcoming` window on due_at; `assigned`
 * = open tasks assigned to me; `all` = every open task. */
export const TASK_QUEUES = ['overdue', 'today', 'upcoming', 'assigned', 'all'] as const;
export type TaskQueue = (typeof TASK_QUEUES)[number];

export const taskQueueSchema = z.object({
  queue: z.enum(TASK_QUEUES).default('today'),
  assignedTo: z.string().uuid().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
});
export type TaskQueueFilter = z.infer<typeof taskQueueSchema>;

export const createTaskSchema = z.object({
  leadId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  priority: z.enum(PRIORITIES).default('medium'),
  dueAt: z.string().datetime().optional(),
  assignedTo: z.string().uuid().optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const rescheduleTaskSchema = z.object({
  taskId: z.string().uuid(),
  dueAt: z.string().datetime(),
});
export type RescheduleTaskInput = z.infer<typeof rescheduleTaskSchema>;

export const reassignTaskSchema = z.object({
  taskId: z.string().uuid(),
  assignedTo: z.string().uuid().nullable(),
});
export type ReassignTaskInput = z.infer<typeof reassignTaskSchema>;

/** Optional atomic follow-up satisfies the "no active lead without an open task" invariant when
 * completing/cancelling the last open task on an active lead. */
const followUp = {
  followUpTitle: z.string().trim().min(1).max(200).optional(),
  followUpDueAt: z.string().datetime().optional(),
};

export const completeTaskSchema = z.object({
  taskId: z.string().uuid(),
  ...followUp,
  followUpPriority: z.enum(PRIORITIES).optional(),
  followUpAssignee: z.string().uuid().optional(),
});
export type CompleteTaskInput = z.infer<typeof completeTaskSchema>;

export const cancelTaskSchema = z.object({
  taskId: z.string().uuid(),
  ...followUp,
});
export type CancelTaskInput = z.infer<typeof cancelTaskSchema>;

export interface TaskSummary {
  id: string;
  leadId: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  priorityWeight: number;
  dueAt: string | null;
  assignedTo: string | null;
  createdAt: string;
}

export interface TaskDetail extends TaskSummary {
  description: string | null;
  completedAt: string | null;
  createdBy: string | null;
  updatedAt: string;
}

export interface TaskListResult {
  items: TaskSummary[];
  total: number;
  page: number;
  pageSize: number;
}

// ── Outreach & conversations (P6-01) — supabase-js + RLS; message logging via RPC ──

export const recordOutreachMessageSchema = z
  .object({
    channel: z.enum(OUTREACH_CHANNELS),
    direction: z.enum(OUTREACH_DIRECTIONS),
    body: z.string().trim().min(1).max(20000),
    subject: z.string().trim().max(300).optional(),
    status: z.enum(OUTREACH_STATUSES).default('sent'),
    leadId: z.string().uuid().optional(),
    opportunityId: z.string().uuid().optional(),
    contactId: z.string().uuid().optional(),
    conversationId: z.string().uuid().optional(),
    isAiGenerated: z.boolean().default(false),
    aiRequestId: z.string().uuid().optional(),
    messageTemplateId: z.string().uuid().optional(),
  })
  .refine((v) => Boolean(v.conversationId || v.leadId || v.opportunityId), {
    message: 'a conversation, lead, or opportunity is required',
    path: ['leadId'],
  });
export type RecordOutreachMessageInput = z.infer<typeof recordOutreachMessageSchema>;

export const updateConversationSummarySchema = z.object({
  conversationId: z.string().uuid(),
  summary: z.string().trim().max(20000),
});
export type UpdateConversationSummaryInput = z.infer<typeof updateConversationSummarySchema>;

export const upsertMessageTemplateSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  channel: z.enum(OUTREACH_CHANNELS),
  service: z.string().trim().max(120).optional(),
  stage: z.enum(LEAD_STAGES).optional(),
  subjectTemplate: z.string().trim().max(300).optional(),
  bodyTemplate: z.string().trim().min(1).max(20000),
  tone: z.string().trim().max(120).optional(),
  isActive: z.boolean().default(true),
});
export type UpsertMessageTemplateInput = z.infer<typeof upsertMessageTemplateSchema>;

export interface ConversationSummary {
  id: string;
  channel: OutreachChannel;
  summary: string | null;
  leadId: string | null;
  opportunityId: string | null;
  companyId: string | null;
  contactId: string | null;
  lastMessageAt: string | null;
  createdAt: string;
}

export interface OutreachMessage {
  id: string;
  conversationId: string | null;
  channel: OutreachChannel;
  direction: OutreachDirection;
  status: OutreachStatus;
  subject: string | null;
  body: string;
  isAiGenerated: boolean;
  aiRequestId: string | null;
  messageTemplateId: string | null;
  leadId: string | null;
  opportunityId: string | null;
  contactId: string | null;
  sentAt: string | null;
  openedAt: string | null;
  repliedAt: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface MessageTemplate {
  id: string;
  name: string;
  channel: OutreachChannel;
  service: string | null;
  stage: LeadStage | null;
  subjectTemplate: string | null;
  bodyTemplate: string;
  tone: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── AI Sales Assistant (P6-02) — generation endpoints over the governed gateway ──

export const ASSISTANT_ENTITY_TYPES = ['lead', 'opportunity'] as const;
export type AssistantEntityType = (typeof ASSISTANT_ENTITY_TYPES)[number];

export const ASSISTANT_MESSAGE_KINDS = ['sales_message', 'follow_up_message'] as const;
export type AssistantMessageKind = (typeof ASSISTANT_MESSAGE_KINDS)[number];

const assistantEntityRef = {
  entityType: z.enum(ASSISTANT_ENTITY_TYPES),
  entityId: z.string().uuid(),
};

export const draftAssistantMessageSchema = z.object({
  ...assistantEntityRef,
  kind: z.enum(ASSISTANT_MESSAGE_KINDS).default('sales_message'),
  channel: z.enum(OUTREACH_CHANNELS).default('email'),
  instruction: z.string().trim().max(2000).optional(),
  conversationId: z.string().uuid().optional(),
});
export type DraftAssistantMessageInput = z.infer<typeof draftAssistantMessageSchema>;

export const summarizeConversationRequestSchema = z.object({
  conversationId: z.string().uuid(),
});
export type SummarizeConversationRequest = z.infer<typeof summarizeConversationRequestSchema>;

export const assistantAdviceSchema = z.object({ ...assistantEntityRef });
export type AssistantAdviceInput = z.infer<typeof assistantAdviceSchema>;

export interface AssistantMeetingPrep {
  talkingPoints: string[];
  questions: string[];
  risks: string[];
}

export interface AssistantNextAction {
  action: string;
  reasoning: string | null;
}

export interface AssistantConversationSummary {
  conversationId: string;
  summary: string;
}

// ── Companies & contacts (P4-02) — supabase-js + RLS; upsert/dedup/merge via RPC ──

export const COMPANY_SORTS = ['name', 'newest'] as const;
export type CompanySort = (typeof COMPANY_SORTS)[number];

export const companyFilterSchema = z.object({
  search: z.string().trim().max(200).optional(),
  industry: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
  sort: z.enum(COMPANY_SORTS).default('name'),
});
export type CompanyFilter = z.infer<typeof companyFilterSchema>;

export const upsertCompanySchema = z.object({
  name: z.string().trim().min(1).max(240),
  domain: z.string().trim().max(240).optional(),
  industry: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
  size: z.string().trim().max(60).optional(),
  techStack: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
});
export type UpsertCompanyInput = z.infer<typeof upsertCompanySchema>;

export const upsertContactSchema = z.object({
  name: z.string().trim().min(1).max(240),
  companyId: z.string().uuid().optional(),
  email: z.string().trim().email().max(240).optional(),
  phone: z.string().trim().max(60).optional(),
  title: z.string().trim().max(160).optional(),
  linkedinUrl: z.string().trim().url().max(400).optional(),
});
export type UpsertContactInput = z.infer<typeof upsertContactSchema>;

export const mergeEntitiesSchema = z.object({
  primaryId: z.string().uuid(),
  duplicateId: z.string().uuid(),
});
export type MergeEntitiesInput = z.infer<typeof mergeEntitiesSchema>;

export interface CompanySummary {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  country: string | null;
  size: string | null;
  createdAt: string;
}

export interface CompanyDetail extends CompanySummary {
  techStack: string[];
  enrichment: unknown;
  createdBy: string | null;
  updatedAt: string;
}

export interface CompanyListResult {
  items: CompanySummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ContactSummary {
  id: string;
  companyId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  linkedinUrl: string | null;
  createdAt: string;
}

// ── Relationship graph (P4-03) — typed/weighted polymorphic edges via supabase-js + RLS/RPC ──

const relationshipNodeSchema = z.object({
  type: z.enum(RELATIONSHIP_NODE_TYPES),
  id: z.string().uuid(),
});
export type RelationshipNodeRef = z.infer<typeof relationshipNodeSchema>;

export const upsertRelationshipEdgeSchema = z.object({
  edgeType: z.enum(RELATIONSHIP_EDGE_TYPES),
  source: relationshipNodeSchema,
  target: relationshipNodeSchema,
  weight: z.number().min(0).max(1_000_000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type UpsertRelationshipEdgeInput = z.infer<typeof upsertRelationshipEdgeSchema>;

export interface RelationshipEdge {
  id: string;
  edgeType: RelationshipEdgeType;
  sourceType: RelationshipNodeType;
  sourceId: string;
  targetType: RelationshipNodeType;
  targetId: string;
  weight: number;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
}

// ── Activities, notes & attachments (P4-07) — the M13 timeline; entities are referenced
// polymorphically by `relationship_node_type`. Writes go through SECURITY DEFINER RPCs. ──

/** Polymorphic timeline target (an opportunity/company/contact). */
export const timelineTargetSchema = z.object({
  entityType: z.enum(RELATIONSHIP_NODE_TYPES),
  entityId: z.string().uuid(),
});
export type TimelineTarget = z.infer<typeof timelineTargetSchema>;

export const addNoteSchema = timelineTargetSchema.extend({
  body: z.string().trim().min(1).max(10_000),
  isAiGenerated: z.boolean().optional(),
});
export type AddNoteInput = z.infer<typeof addNoteSchema>;

export const recordAttachmentSchema = timelineTargetSchema.extend({
  bucket: z.string().trim().min(1).max(120),
  path: z.string().trim().min(1).max(1024),
  fileName: z.string().trim().min(1).max(400),
  mimeType: z.string().trim().max(255).optional(),
  sizeBytes: z.number().int().min(0).optional(),
});
export type RecordAttachmentInput = z.infer<typeof recordAttachmentSchema>;

export interface Activity {
  id: string;
  entityType: RelationshipNodeType;
  entityId: string;
  type: ActivityType;
  summary: string;
  metadata: unknown;
  actorId: string | null;
  createdAt: string;
}

export interface Note {
  id: string;
  entityType: RelationshipNodeType;
  entityId: string;
  body: string;
  isAiGenerated: boolean;
  authorId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  entityType: RelationshipNodeType;
  entityId: string;
  bucket: string;
  path: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedBy: string | null;
  createdAt: string;
}

// ── Ingestion (P2-04) — thin API request/response contracts for manual + CSV capture ──

const optionalString = (max: number) => z.string().trim().max(max).optional();

export const manualDiscoverySchema = z
  .object({
    source: z.enum(DISCOVERY_SOURCES).default('manual'),
    title: optionalString(240),
    description: optionalString(10000),
    companyName: optionalString(240),
    contactName: optionalString(240),
    email: z.string().trim().email().max(240).optional(),
    phone: optionalString(80),
    website: optionalString(500),
    country: optionalString(120),
    budgetHint: z.number().nonnegative().max(999999999999.99).optional(),
    notes: optionalString(4000),
    rawPayload: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      !value.title &&
      !value.description &&
      !value.companyName &&
      !value.contactName &&
      !value.email &&
      !value.phone &&
      !value.website
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide at least one identifying field for the discovery',
      });
    }
  });
export type ManualDiscoveryInput = z.infer<typeof manualDiscoverySchema>;

export const csvIngestionSchema = z.object({
  fileName: boundedString(240),
  contentType: optionalString(120),
  hasHeader: z.boolean().default(true),
  defaultSource: z.enum(DISCOVERY_SOURCES).default('csv'),
});
export type CsvIngestionInput = z.infer<typeof csvIngestionSchema>;

export interface DiscoveryIngestionAccepted {
  jobId: string;
  batchId: string;
}

export interface CsvUploadTarget {
  bucket: string;
  path: string;
  token: string;
  signedUrl: string | null;
}

export interface CsvIngestionAccepted extends DiscoveryIngestionAccepted {
  upload: CsvUploadTarget;
}

export interface DiscoveryIngestionResult {
  batchId: string;
  totalRows: number;
  insertedCount: number;
  exactDuplicateCount: number;
  fuzzyDuplicateCount: number;
  skippedCount: number;
  discoveryIds: string[];
  warnings: string[];
  rawBlobUrl: string | null;
}

export interface ManualIngestionJobPayload {
  batchId: string;
  submittedBy: string;
  entry: ManualDiscoveryInput;
}

/** P3-07 analysis pipeline job payloads (analyze-discovery → generate-embedding). */
export interface AnalyzeDiscoveryJobPayload {
  discoveryId: string;
  userId: string;
}

export interface GenerateEmbeddingJobPayload {
  discoveryId: string;
  userId: string;
}

export interface GenerateOpportunityEmbeddingJobPayload {
  opportunityId: string;
}

/** P4-04 Company Research agent job payload (research-company → companies.enrichment). */
export interface ResearchCompanyJobPayload {
  companyId: string;
  userId: string;
}

export interface LeadHuntingResearchJobPayload {
  rawPostId: string;
  postResearchJobId: string;
  searchSessionId: string;
  capturedBy: string | null;
  force?: boolean;
  requestedBy?: string | null;
}

export interface CsvImportJobPayload {
  batchId: string;
  bucket: string;
  path: string;
  fileName: string;
  hasHeader: boolean;
  defaultSource: DiscoverySource;
  uploadedBy: string;
}

// ── Extension capture (P2-05/P2-09/P2-10/P2-11) ──

export const EXTENSION_TOKEN_SCOPES = ['discovery.capture', 'discovery.read_own_batches'] as const;
export type ExtensionTokenScope = (typeof EXTENSION_TOKEN_SCOPES)[number];
export const EXTENSION_CAPTURE_MODES = ['visible_posts'] as const;
export type ExtensionCaptureMode = (typeof EXTENSION_CAPTURE_MODES)[number];

export const extensionTokenCreateSchema = z.object({
  name: boundedString(120),
  expiresAt: z.string().datetime().optional(),
});
export type ExtensionTokenCreateInput = z.infer<typeof extensionTokenCreateSchema>;

export interface ExtensionTokenSummary {
  id: string;
  name: string;
  scopes: ExtensionTokenScope[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  createdByUserId: string;
}

export interface ExtensionTokenCreated extends ExtensionTokenSummary {
  token: string;
}

const extensionCaptureRawSchema = z.record(z.string(), z.unknown()).default({});
const extensionCaptureDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const extensionCaptureItemSchema = z.object({
  title: optionalString(240),
  description: optionalString(10000),
  companyName: optionalString(240),
  contactName: optionalString(240),
  email: z.string().trim().email().max(240).optional(),
  phone: optionalString(80),
  website: optionalString(500),
  url: optionalString(2000),
  country: optionalString(120),
  budgetHint: z.union([z.number().nonnegative().max(999999999999.99), z.string().trim().max(120)]).optional(),
  postUrl: optionalString(2000),
  postText: optionalString(10000),
  postOwnerName: optionalString(240),
  postOwnerHeadline: optionalString(240),
  postOwnerProfileUrl: optionalString(2000),
  visibleCompanyName: optionalString(240),
  visibleCompanyUrl: optionalString(2000),
  postDate: extensionCaptureDateSchema.optional(),
  reactionCount: z.number().int().nonnegative().max(999999999).optional(),
  commentCount: z.number().int().nonnegative().max(999999999).optional(),
  repostCount: z.number().int().nonnegative().max(999999999).optional(),
  mediaText: optionalString(4000),
  raw: extensionCaptureRawSchema,
});
export type ExtensionCaptureItemInput = z.infer<typeof extensionCaptureItemSchema>;

export const extensionBatchIngestionSchema = z.object({
  source: z.enum(DISCOVERY_SOURCES),
  capturedUrl: z.string().trim().url().max(2000),
  capturedAt: z.string().datetime(),
  captureMode: z.enum(EXTENSION_CAPTURE_MODES).default('visible_posts'),
  searchQuery: optionalString(500),
  parserVersion: boundedString(120),
  items: z.array(extensionCaptureItemSchema).min(1).max(200),
});
export type ExtensionBatchIngestionInput = z.infer<typeof extensionBatchIngestionSchema>;

export interface ExtensionBatchJobPayload {
  batchId: string;
  source: DiscoverySource;
  capturedUrl: string;
  capturedAt: string;
  captureMode: ExtensionCaptureMode;
  searchQuery?: string;
  parserVersion: string;
  tokenId: string;
  capturedBy: string;
  items: ExtensionCaptureItemInput[];
}

export interface ExtensionHealthBatch {
  id: string;
  source: DiscoverySource;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  parserVersion: string | null;
  itemCount: number;
  createdAt: string;
  error: string | null;
}

export interface ExtensionParserHealth {
  parserVersion: string;
  totalBatches: number;
  failedBatches: number;
  latestBatchAt: string;
}

export interface ExtensionHealthSummary {
  activeTokenCount: number;
  recentBatches: ExtensionHealthBatch[];
  parserHealth: ExtensionParserHealth[];
}

// ── AI usage ledger + quotas (P3-14) ──

export const USAGE_TASK_TYPES = [
  'opportunity_analyzer',
  'action_planner',
  'company_research',
  'post_research_classifier',
  'archive_classifier',
  'lead_quality_scorer',
  'sales_message',
  'follow_up_message',
  'conversation_summary',
  'proposal_generator',
  'meeting_prep',
  'next_action',
  'embedding',
  'learning_summary',
] as const;
export type UsageTaskType = (typeof USAGE_TASK_TYPES)[number];

export const USAGE_EVENT_STATUSES = ['ok', 'error', 'fallback'] as const;
export type UsageEventStatus = (typeof USAGE_EVENT_STATUSES)[number];

export const USAGE_CREDIT_METRICS = [
  'ai_requests',
  'ai_tokens',
  'ai_cost_usd',
  'opportunity_analysis',
  'proposal_generations',
  'company_research',
  'embeddings',
] as const;
export type UsageCreditMetric = (typeof USAGE_CREDIT_METRICS)[number];

const usagePeriodString = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}$/, 'period must be YYYY-MM');

export const usagePeriodSchema = z.object({
  period: usagePeriodString.optional(),
});
export type UsagePeriodInput = z.infer<typeof usagePeriodSchema>;

export const usageEventsFilterSchema = z.object({
  period: usagePeriodString.optional(),
  userId: z.string().uuid().optional(),
  taskType: z.enum(USAGE_TASK_TYPES).optional(),
  provider: z.string().trim().min(1).max(60).optional(),
  model: z.string().trim().min(1).max(160).optional(),
  status: z.enum(USAGE_EVENT_STATUSES).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type UsageEventsFilter = z.infer<typeof usageEventsFilterSchema>;

export interface UsageTotals {
  requests: number;
  tokens: number;
  cost: number;
  opportunityAnalysisCount: number;
  proposalGenerationCount: number;
  companyResearchCount: number;
  embeddingCount: number;
}

export interface UsageMetricLimit {
  limit: number | null;
  credit: number;
  effectiveLimit: number | null;
  used: number;
  remaining: number | null;
  exceeded: boolean;
}

export interface UsageLimitSummary {
  period: string;
  resetAt: string;
  requests: UsageMetricLimit;
  tokens: UsageMetricLimit;
  cost: UsageMetricLimit;
  opportunityAnalysis: UsageMetricLimit;
  proposalGeneration: UsageMetricLimit;
  companyResearch: UsageMetricLimit;
  embedding: UsageMetricLimit;
}

export interface UsageCreditGrantSummary {
  id: string;
  metric: UsageCreditMetric;
  amount: number;
  reason: string | null;
  expiresAt: string | null;
  createdAt: string;
  grantedBy: string | null;
}

export interface UsageEventSummary {
  id: string;
  userId: string | null;
  provider: string;
  model: string;
  taskType: UsageTaskType;
  aiRequestId: string;
  apiKeyId: string | null;
  providerAccountId: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  isFreeTier: boolean;
  status: UsageEventStatus;
  createdAt: string;
}

export interface UsageUserBreakdown {
  userId: string | null;
  requests: number;
  tokens: number;
  cost: number;
}

export interface UsageTaskBreakdown {
  taskType: UsageTaskType;
  requests: number;
  tokens: number;
  cost: number;
}

export interface UsageModelBreakdown {
  provider: string;
  model: string;
  requests: number;
  tokens: number;
  cost: number;
}

export interface UsageProviderBreakdown {
  provider: string;
  requests: number;
  tokens: number;
  cost: number;
}

export interface UsageMeReport {
  userId: string;
  period: string;
  totals: UsageTotals;
  limits: UsageLimitSummary;
  byTask: UsageTaskBreakdown[];
}

export interface UsageCompanyReport {
  period: string;
  totals: UsageTotals;
  limits: UsageLimitSummary;
  byUser: UsageUserBreakdown[];
  byTask: UsageTaskBreakdown[];
  byModel: UsageModelBreakdown[];
  byProvider: UsageProviderBreakdown[];
}

export interface UsageCompanySummaryReport {
  period: string;
  totals: UsageTotals;
  limits: UsageLimitSummary;
  byTask: UsageTaskBreakdown[];
  byModel: UsageModelBreakdown[];
}

export interface UsageTeamReport {
  period: string;
  members: UsageUserBreakdown[];
}

export interface UsageLimitsReport {
  period: string;
  limits: UsageLimitSummary;
  credits: UsageCreditGrantSummary[];
}

export interface UsageEventsReport {
  items: UsageEventSummary[];
  total: number;
  page: number;
  pageSize: number;
}

// ── AI tenant settings (T-009) ──

export const aiProviderSettingsUpdateSchema = z
  .object({
    enabled: z.boolean(),
    priority: z.coerce.number().int().min(1).max(99),
    apiKey: z.string().trim().min(8).max(500).optional(),
    clearKey: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.clearKey && value.apiKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'apiKey must be omitted when clearKey is true',
        path: ['apiKey'],
      });
    }
  });
export type AiProviderSettingsUpdateInput = z.infer<typeof aiProviderSettingsUpdateSchema>;

export const aiPrivacyModeUpdateSchema = z.object({
  privacyMode: z.enum(AI_PRIVACY_MODES),
});
export type AiPrivacyModeUpdateInput = z.infer<typeof aiPrivacyModeUpdateSchema>;

export interface AiProviderSettingsSummary {
  provider: AiSettingsProviderName;
  enabled: boolean;
  priority: number;
  status: AiProviderConnectionStatus;
  hasStoredKey: boolean;
  connectedAt: string | null;
  lastCheckedAt: string | null;
  connectedByUserId: string | null;
}

export interface AiProviderSettingsResponse {
  privacyMode: AiPrivacyMode;
  providers: AiProviderSettingsSummary[];
}

export interface AiPrivacyModeResponse {
  privacyMode: AiPrivacyMode;
}

// ── Jobs ──
export interface JobAccepted {
  jobId: string;
}

// ── Master Admin (P9-13) ──
export interface AdminProviderAccountDto {
  id: string;
  provider: string;
  accountName: string | null;
  accountType: string;
  monthlyBudget: number | null;
  monthlyUsage: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminApiKeyDto {
  id: string;
  provider: string;
  providerAccountId: string;
  keyName: string | null;
  status: string;
  lastUsedAt: string | null;
  lastError: string | null;
  cooldownUntil: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
  requestsUsedToday: number;
  tokensUsedMonth: number;
  costUsedMonth: number;
}

// ── Proposals (M11 / P6-03) ──

export const PROPOSAL_OPERATOR_STATUSES = ['sent', 'accepted', 'rejected', 'expired'] as const;

export const generateProposalSchema = z.object({
  entityType: z.enum(['lead', 'opportunity']),
  entityId: z.string().uuid(),
});
export type GenerateProposalInput = z.infer<typeof generateProposalSchema>;

export const updateProposalStatusSchema = z.object({
  status: z.enum(PROPOSAL_OPERATOR_STATUSES),
});
export type UpdateProposalStatusInput = z.infer<typeof updateProposalStatusSchema>;

export const proposalFilterSchema = z.object({
  entityType: z.enum(['lead', 'opportunity']).optional(),
  entityId: z.string().uuid().optional(),
  status: z.enum(PROPOSAL_STATUSES).optional(),
});
export type ProposalFilterInput = z.infer<typeof proposalFilterSchema>;

export interface ProposalSummary {
  id: string;
  leadId: string | null;
  opportunityId: string | null;
  title: string;
  status: ProposalStatus;
  value: number | null;
  currency: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProposalDetail extends ProposalSummary {
  content: unknown;
  aiRequestId: string | null;
  createdBy: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
}

/** P6-03 Proposal Generator job payload (generate-proposal → proposals). */
export interface GenerateProposalJobPayload {
  entityType: 'lead' | 'opportunity';
  entityId: string;
  userId: string;
}

export interface SimilarOpportunityDto {
  id: string;
  title: string;
  status: string;
  score: number;
  potentialValue: number | null;
  heatScore: number;
  similarity: number;
}

export interface DemandRadarClusterDto {
  clusterId: string;
  title: string;
  volume: number;
  velocity: number;
  avgScore: number;
}
