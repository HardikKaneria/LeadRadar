/**
 * Hand-written Database types for the tables the server (thin NestJS + worker) touches.
 * Shaped to satisfy supabase-js's GenericSchema (Tables need Relationships; the schema needs
 * Views/Functions/Enums/CompositeTypes). Regenerate the full set later with:
 *   pnpm db:types   (supabase gen types typescript --linked)
 */
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'retrying';
export type MembershipStatus = 'active' | 'invited' | 'disabled';

export type DiscoverySource =
  | 'linkedin' | 'upwork' | 'freelancer' | 'website' | 'referral' | 'manual' | 'csv'
  | 'whatsapp' | 'email' | 'existing_customer' | 'conference' | 'client_call' | 'partnership' | 'other';
export type DiscoveryStatus =
  | 'new' | 'processing' | 'analyzed' | 'reviewed' | 'approved' | 'ignored' | 'converted';
export type DiscoveryChannel = 'extension' | 'manual' | 'csv' | 'api';
export type DiscoveryBatchStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type AiTaskTypeName =
  | 'opportunity_analyzer'
  | 'action_planner'
  | 'company_research'
  | 'post_research_classifier'
  | 'archive_classifier'
  | 'lead_quality_scorer'
  | 'sales_message'
  | 'follow_up_message'
  | 'conversation_summary'
  | 'proposal_generator'
  | 'meeting_prep'
  | 'next_action'
  | 'embedding'
  | 'learning_summary';
export type AiProviderName = 'gemini' | 'groq' | 'openrouter' | 'ollama' | 'openai' | 'anthropic' | 'jina' | 'other';
export type AiTaskRouteProviderName = 'gemini' | 'groq' | 'openrouter' | 'ollama' | 'openai' | 'anthropic' | 'jina';
export type AiProviderAccountType = 'free_tier' | 'paid' | 'byok' | 'self_hosted';
export type AiProviderAccountStatus = 'active' | 'limited' | 'disabled';
export type AiApiKeyStatus = 'active' | 'limited' | 'cooldown' | 'exhausted' | 'failed' | 'revoked';
export type AiProviderHealthStatus = 'ok' | 'degraded' | 'down';
export type AiProviderLimitType = 'rpm' | 'tpm' | 'daily' | 'monthly';
export type AiCallStatus = 'ok' | 'error' | 'fallback';
export type AiPrivacyMode = 'free_api_allowed' | 'redact_pii_before_ai' | 'paid_only' | 'byok_only' | 'disabled';
export type IntegrationType = 'ai_provider' | 'email' | 'calendar' | 'storage' | 'webhook' | 'extension';
export type IntegrationStatus = 'connected' | 'disconnected' | 'error';
export type ScoringStrategyKind = 'heuristic' | 'statistical' | 'ml';
export type AiAnalysisIntent = 'high' | 'medium' | 'low' | 'unclear';
export type AiAnalysisUrgency = 'urgent' | 'soon' | 'later' | 'none';
export type OpportunityStatus =
  | 'open' | 'qualified' | 'promoted_to_lead' | 'ignored' | 'expired' | 'archived';
export type OpportunityPriority = 'critical' | 'high' | 'medium' | 'low';
export type LeadStage =
  | 'new' | 'contacted' | 'reply_received' | 'meeting_scheduled' | 'proposal_sent'
  | 'negotiation' | 'won' | 'lost' | 'on_hold';
export type TaskStatus = 'open' | 'done' | 'cancelled';
export type RawPostStatus =
  | 'raw_captured'
  | 'duplicate_linked'
  | 'queued_for_research'
  | 'researching'
  | 'provider_post_enriched'
  | 'person_resolved'
  | 'company_resolved'
  | 'website_found'
  | 'website_researched'
  | 'email_checked'
  | 'management_found'
  | 'country_resolved'
  | 'evidence_built'
  | 'ai_classified'
  | 'qualified_lead'
  | 'needs_review'
  | 'archived'
  | 'rejected'
  | 'failed'
  | 'cancelled';
export type ResearchJobStage =
  | 'dedupe'
  | 'linkedin_post_lookup'
  | 'linkedin_profile_lookup'
  | 'linkedin_company_lookup'
  | 'person_resolver'
  | 'company_resolver'
  | 'website_discovery'
  | 'website_crawl'
  | 'email_discovery'
  | 'management_discovery'
  | 'country_resolution'
  | 'evidence_building'
  | 'ai_classification'
  | 'decision_routing';
export type LeadHuntingClassification =
  | 'actual_requirement'
  | 'hiring_requirement'
  | 'service_needed'
  | 'vendor_needed'
  | 'partnership_opportunity'
  | 'funding_signal'
  | 'expansion_signal'
  | 'complaint_or_pain_signal'
  | 'buying_intent_signal'
  | 'informational_post'
  | 'personal_branding_post'
  | 'news_update'
  | 'promotion_only'
  | 'job_seeker_post'
  | 'irrelevant'
  | 'spam';
export type ArchivedPostCategory =
  | 'market_insight'
  | 'competitor_activity'
  | 'industry_news'
  | 'educational_content'
  | 'personal_branding'
  | 'general_update'
  | 'irrelevant'
  | 'spam';
export type RawPostFingerprintType =
  | 'post_url'
  | 'post_text_hash'
  | 'owner_profile_text'
  | 'owner_name_date_excerpt'
  | 'company_text';
export type ExternalProvider =
  | 'bright_data'
  | 'apify'
  | 'people_data_labs'
  | 'tavily'
  | 'serpapi'
  | 'firecrawl'
  | 'scraperapi'
  | 'manual'
  | 'internal';
export type ExternalProviderTaskType =
  | 'linkedin_post_lookup'
  | 'linkedin_profile_lookup'
  | 'linkedin_company_lookup'
  | 'person_enrichment'
  | 'company_enrichment'
  | 'website_discovery'
  | 'website_crawl'
  | 'email_discovery'
  | 'management_discovery'
  | 'country_resolution'
  | 'tech_stack_detection'
  | 'public_search'
  | 'blocked_website_fetch'
  | 'provider_health_check'
  | 'provider_test_flow';
export type ExternalProviderAccountType =
  | 'free_tier'
  | 'paid'
  | 'byok'
  | 'self_hosted'
  | 'trial'
  | 'internal';
export type ExternalProviderAccountStatus =
  | 'active'
  | 'limited'
  | 'disabled'
  | 'expired'
  | 'suspended';
export type ExternalApiKeyStatus =
  | 'active'
  | 'limited'
  | 'cooldown'
  | 'exhausted'
  | 'failed'
  | 'revoked'
  | 'expired';
export type ExternalProviderHealthStatus = 'ok' | 'degraded' | 'down';
export type ExternalProviderLimitType = 'rpm' | 'tpm' | 'daily' | 'weekly' | 'monthly';
export type ExternalCallStatus =
  | 'ok'
  | 'error'
  | 'fallback'
  | 'rate_limited'
  | 'cached'
  | 'success'
  | 'failed'
  | 'skipped_cache'
  | 'test_success'
  | 'test_failed';
export type ExternalProviderPlanType = 'free' | 'trial' | 'paid' | 'custom';
export type ExternalProviderUnitType =
  | 'request'
  | 'record'
  | 'credit'
  | 'usd_credit'
  | 'search'
  | 'page'
  | 'token'
  | 'compute_unit'
  | 'api_credit'
  | 'successful_record'
  | 'failed_request'
  | 'result'
  | 'browser_minute'
  | 'data_transfer_mb'
  | 'provider_reported'
  | 'custom';
export type ExternalCostRuleScope =
  | 'provider_default'
  | 'endpoint'
  | 'dataset'
  | 'actor'
  | 'task_type'
  | 'option_multiplier'
  | 'response_field'
  | 'manual_override';
export type ExternalBillingEvent =
  | 'before_call'
  | 'after_success'
  | 'after_failure'
  | 'after_provider_report'
  | 'after_response_count';
export type ExternalCostSource =
  | 'estimated'
  | 'calculated'
  | 'provider_reported'
  | 'manual_adjusted'
  | 'reconciled';
export type ExternalRouteBehaviorMode =
  | 'free_only'
  | 'free_then_fallback'
  | 'allow_paid_with_budget'
  | 'manual_approval_required'
  | 'test_only';
export type ExternalProviderRenewalInterval =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'trial'
  | 'custom'
  | 'manual';
export type ExternalUsageReservationStatus = 'reserved' | 'settled' | 'released' | 'expired';
export type ExternalUsageSnapshotPeriodType = 'daily' | 'weekly' | 'monthly' | 'trial' | 'custom';
export type ExternalAlertType =
  | 'info'
  | 'warning'
  | 'high'
  | 'critical'
  | 'exhausted'
  | 'projected_exhaustion'
  | 'trial_expiry'
  | 'fallback_started'
  | 'paid_cost_risk'
  | 'variance_detected'
  | 'renewed'
  | 'all_keys_exhausted';
export type ExternalAlertStatus = 'new' | 'sent' | 'acknowledged' | 'resolved';
export type ExternalProviderTestStatus = 'queued' | 'running' | 'passed' | 'failed';
export type ExternalUsageReconciliationStatus =
  | 'pending'
  | 'matched'
  | 'variance_detected'
  | 'manually_adjusted'
  | 'unsupported';
export type OutreachChannel =
  | 'email' | 'linkedin' | 'whatsapp' | 'upwork' | 'freelancer' | 'phone' | 'meeting' | 'other';
export type OutreachDirection = 'outbound' | 'inbound' | 'internal_note';
export type OutreachStatus = 'draft' | 'ready' | 'sent' | 'failed' | 'received';
export type ProposalStatus = 'draft' | 'ready' | 'sent' | 'accepted' | 'rejected' | 'expired';
export type RelationshipNodeType = 'company' | 'contact' | 'opportunity';
export type RelationshipEdgeType =
  | 'works_at'
  | 'decision_maker_for'
  | 'reports_to'
  | 'referred_by'
  | 'introduced_by'
  | 'partner_of'
  | 'competitor_of'
  | 'related_to';
export type ActivityType =
  | 'created'
  | 'status_changed'
  | 'converted'
  | 'assigned'
  | 'note_added'
  | 'attachment_added'
  | 'researched'
  | 'custom';
export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type TaskType = 'call' | 'email' | 'message' | 'meeting' | 'proposal' | 'custom';
export type UsageCreditMetric =
  | 'ai_requests'
  | 'ai_tokens'
  | 'ai_cost_usd'
  | 'opportunity_analysis'
  | 'proposal_generations'
  | 'company_research'
  | 'embeddings';

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface JobRunRow {
  id: string;
  organization_id: string;
  queue_name: string;
  job_name: string;
  entity_type: string | null;
  entity_id: string | null;
  status: JobStatus;
  progress: number;
  error: string | null;
  result: Json | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MembershipRow {
  id: string;
  organization_id: string;
  user_id: string;
  role_id: string;
  status: MembershipStatus;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  settings: Json;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntegrationAccountRow {
  id: string;
  organization_id: string;
  provider: string;
  type: IntegrationType;
  status: IntegrationStatus;
  encrypted_credentials: Json;
  settings: Json;
  connected_by: string | null;
  connected_at: string | null;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DiscoveryBatchRow {
  id: string;
  organization_id: string;
  source: DiscoverySource;
  channel: DiscoveryChannel;
  status: DiscoveryBatchStatus;
  parser_version: string | null;
  raw_blob_url: string | null;
  item_count: number;
  error: string | null;
  captured_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiProviderAccountRow {
  id: string;
  provider: AiProviderName;
  account_name: string;
  account_type: AiProviderAccountType;
  billing_owner: string | null;
  status: AiProviderAccountStatus;
  monthly_budget: number | null;
  monthly_usage: number;
  rate_limit_rpm: number | null;
  rate_limit_tpm: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiApiKeyRow {
  id: string;
  provider_account_id: string;
  provider: AiProviderName;
  key_name: string;
  encrypted_api_key: string;
  status: AiApiKeyStatus;
  environment: string | null;
  allowed_task_types: AiTaskTypeName[];
  daily_request_limit: number | null;
  monthly_token_limit: number | null;
  monthly_cost_limit: number | null;
  requests_used_today: number;
  tokens_used_month: number;
  cost_used_month: number;
  last_used_at: string | null;
  last_error: string | null;
  cooldown_until: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
}

export interface AiModelCatalogRow {
  id: string;
  provider: AiProviderName;
  model: string;
  display_name: string;
  context_window: number | null;
  max_output: number | null;
  supports_json: boolean;
  supports_embedding: boolean;
  embedding_dims: number | null;
  input_cost_per_mtok: number | null;
  output_cost_per_mtok: number | null;
  is_free_tier: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AiProviderHealthCheckRow {
  id: string;
  provider: AiProviderName;
  provider_account_id: string | null;
  api_key_id: string | null;
  status: AiProviderHealthStatus;
  latency_ms: number | null;
  checked_at: string;
  detail: Json;
}

export interface AiProviderRateLimitEventRow {
  id: string;
  provider: AiProviderName;
  provider_account_id: string | null;
  api_key_id: string | null;
  task_type: AiTaskTypeName | null;
  limit_type: AiProviderLimitType;
  occurred_at: string;
  retry_after_seconds: number | null;
  detail: Json;
}

export interface AiTaskRouteRow {
  id: string;
  task_type: AiTaskTypeName;
  primary_provider: AiTaskRouteProviderName;
  primary_model: string;
  fallback_provider: AiTaskRouteProviderName | null;
  fallback_model: string | null;
  fallback_2_provider: AiTaskRouteProviderName | null;
  fallback_2_model: string | null;
  requires_json_schema: boolean;
  requires_embedding: boolean;
  max_input_tokens: number | null;
  max_output_tokens: number | null;
  temperature: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AiPromptVersionRow {
  id: string;
  organization_id: string | null;
  agent: AiTaskTypeName;
  version: number;
  name: string;
  description: string | null;
  system_prompt: string;
  user_prompt_template: string | null;
  output_schema: Json;
  model_preferences: Json;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiRequestRow {
  id: string;
  organization_id: string;
  user_id: string | null;
  task_type: AiTaskTypeName;
  provider: AiProviderName;
  model: string;
  ai_prompt_version_id: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  latency_ms: number;
  status: AiCallStatus;
  error: string | null;
  job_run_id: string | null;
  request_ref: Json;
  api_key_id: string | null;
  provider_account_id: string | null;
  is_free_tier: boolean;
  created_at: string;
}

export interface AiUsageEventRow {
  id: string;
  organization_id: string;
  user_id: string | null;
  provider: AiProviderName;
  model: string;
  task_type: AiTaskTypeName;
  ai_request_id: string;
  api_key_id: string | null;
  provider_account_id: string | null;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost: number;
  is_free_tier: boolean;
  status: AiCallStatus;
  created_at: string;
}

export interface CompanyUsageLimitRow {
  id: string;
  organization_id: string;
  period: string;
  ai_requests_limit: number | null;
  request_rate_limit_rpm: number | null;
  ai_tokens_limit: number | null;
  ai_cost_limit: number | null;
  opportunity_analysis_limit: number | null;
  proposal_generation_limit: number | null;
  company_research_limit: number | null;
  embedding_limit: number | null;
  used_requests: number;
  used_tokens: number;
  used_cost: number;
  reset_at: string;
  created_at: string;
  updated_at: string;
}

export interface UsageCreditGrantRow {
  id: string;
  organization_id: string;
  granted_by: string | null;
  metric: UsageCreditMetric;
  amount: number;
  reason: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface ScoringStrategyRow {
  id: string;
  organization_id: string;
  version: number;
  kind: ScoringStrategyKind;
  weights: Json;
  metrics: Json;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface AiAnalysisRow {
  id: string;
  organization_id: string;
  discovery_id: string;
  score: number;
  intent: AiAnalysisIntent;
  urgency: AiAnalysisUrgency;
  service_match: Json;
  budget_estimate: number | null;
  confidence: number;
  recommended_action: string | null;
  reason: string | null;
  is_bad_lead: boolean;
  scoring_strategy_id: string | null;
  ai_prompt_version_id: string | null;
  model_meta: Json;
  created_at: string;
}

export interface AiActionPlanRow {
  id: string;
  organization_id: string;
  discovery_id: string;
  ai_analysis_id: string;
  recommended_action: string;
  reason: string;
  priority: Priority;
  priority_weight: number;
  due_at: string;
  planned_task_title: string;
  planned_task_type: TaskType;
  planned_task_notes: string | null;
  ai_prompt_version_id: string | null;
  model_meta: Json;
  created_at: string;
}

export interface OpportunityRow {
  id: string;
  organization_id: string;
  discovery_id: string | null;
  company_id: string | null;
  primary_contact_id: string | null;
  title: string;
  description: string | null;
  status: OpportunityStatus;
  score: number;
  priority: OpportunityPriority;
  priority_weight: number;
  potential_value: number | null;
  currency: string | null;
  heat_score: number;
  expires_at: string | null;
  recommended_action: string | null;
  ai_explanation: string | null;
  owner_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface LeadRow {
  id: string;
  organization_id: string;
  opportunity_id: string | null;
  company_id: string | null;
  primary_contact_id: string | null;
  title: string;
  description: string | null;
  stage: LeadStage;
  score: number;
  priority: OpportunityPriority;
  priority_weight: number;
  value: number | null;
  currency: string | null;
  source: string | null;
  owner_id: string | null;
  close_reason: string | null;
  closed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface TaskRow {
  id: string;
  organization_id: string;
  lead_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: OpportunityPriority;
  priority_weight: number;
  due_at: string | null;
  assigned_to: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface LeadSearchSessionRow {
  id: string;
  organization_id: string;
  source_platform: DiscoverySource;
  search_query: string | null;
  search_url: string | null;
  captured_by_user_id: string | null;
  capture_mode: string;
  total_posts_captured: number;
  total_unique_posts: number;
  total_duplicates: number;
  total_qualified: number;
  total_needs_review: number;
  total_archived: number;
  total_rejected: number;
  status: string;
  parser_version: string | null;
  raw_payload: Json;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface RawPostRow {
  id: string;
  organization_id: string;
  search_session_id: string | null;
  discovery_id: string | null;
  source_platform: DiscoverySource;
  post_url: string | null;
  post_text: string | null;
  post_text_hash: string | null;
  post_owner_name: string | null;
  post_owner_headline: string | null;
  post_owner_profile_url: string | null;
  visible_company_name: string | null;
  visible_company_url: string | null;
  post_date: string | null;
  reaction_count: number | null;
  comment_count: number | null;
  repost_count: number | null;
  media_text: string | null;
  dedup_hash: string;
  duplicate_of_raw_post_id: string | null;
  raw_payload: Json;
  status: RawPostStatus;
  failure_reason: string | null;
  captured_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PostResearchJobRow {
  id: string;
  organization_id: string;
  raw_post_id: string;
  job_run_id: string | null;
  current_stage: ResearchJobStage;
  status: JobStatus;
  progress: number;
  retry_count: number;
  max_retries: number;
  last_error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadSearchSessionPostRow {
  id: number;
  organization_id: string;
  search_session_id: string;
  raw_post_id: string;
  capture_index: number;
  was_duplicate: boolean;
  created_at: string;
}

export interface RawPostFingerprintRow {
  id: number;
  organization_id: string;
  raw_post_id: string;
  fingerprint_type: RawPostFingerprintType;
  fingerprint_hash: string;
  created_at: string;
}

export interface PostResearchReportRow {
  id: string;
  organization_id: string;
  raw_post_id: string;
  person_summary: string | null;
  company_summary: string | null;
  website_summary: string | null;
  email_summary: string | null;
  management_summary: string | null;
  country_summary: string | null;
  opportunity_summary: string | null;
  primary_contact_id: string | null;
  primary_company_id: string | null;
  target_company_id: string | null;
  confidence_score: number | null;
  report_json: Json;
  created_at: string;
  updated_at: string;
}

export interface PostClassificationRow {
  id: string;
  organization_id: string;
  raw_post_id: string;
  ai_request_id: string | null;
  ai_prompt_version_id: string | null;
  classification: LeadHuntingClassification;
  lead_score: number;
  lead_quality: string | null;
  is_actual_lead: boolean;
  urgency: string | null;
  service_match: Json;
  reason_json: Json;
  recommended_action: string | null;
  created_at: string;
}

export interface ArchivedPostRow {
  id: string;
  organization_id: string;
  raw_post_id: string;
  archive_category: ArchivedPostCategory;
  topic: string | null;
  summary: string | null;
  keywords: string[];
  reason_for_archive: string | null;
  market_signal_score: number | null;
  created_at: string;
  deleted_at: string | null;
}

export interface FieldEvidenceLogRow {
  id: number;
  organization_id: string;
  entity_type: string;
  entity_id: string;
  raw_post_id: string | null;
  field_name: string;
  field_value: string | null;
  source_provider: string | null;
  source_type: string | null;
  source_url: string | null;
  confidence_score: number | null;
  evidence_text: string | null;
  evidence_json: Json;
  created_at: string;
}

export interface ExternalProviderAccountRow {
  id: string;
  organization_id: string | null;
  provider: ExternalProvider;
  account_name: string;
  account_type: ExternalProviderAccountType;
  billing_owner: string | null;
  status: ExternalProviderAccountStatus;
  plan_profile_id: string | null;
  allowed_organization_ids: string[];
  weekly_budget: number | null;
  monthly_budget: number | null;
  total_budget: number | null;
  weekly_usage: number;
  monthly_usage: number;
  total_usage: number;
  rate_limit_rpm: number | null;
  rate_limit_tpm: number | null;
  base_url: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExternalApiKeyRow {
  id: string;
  provider_account_id: string;
  provider: ExternalProvider;
  key_name: string;
  encrypted_api_key: string;
  masked_key_preview: string | null;
  status: ExternalApiKeyStatus;
  environment: string;
  allowed_task_types: ExternalProviderTaskType[];
  allowed_organization_ids: string[];
  priority: number;
  daily_request_limit: number | null;
  weekly_request_limit: number | null;
  monthly_request_limit: number | null;
  daily_credit_limit: number | null;
  weekly_credit_limit: number | null;
  monthly_credit_limit: number | null;
  daily_record_limit: number | null;
  weekly_record_limit: number | null;
  monthly_record_limit: number | null;
  daily_cost_limit: number | null;
  weekly_cost_limit: number | null;
  monthly_cost_limit: number | null;
  requests_used_today: number;
  requests_used_week: number;
  requests_used_month: number;
  units_used_today: number;
  units_used_week: number;
  units_used_month: number;
  records_used_today: number;
  records_used_week: number;
  records_used_month: number;
  credits_used_today: number;
  credits_used_week: number;
  credits_used_month: number;
  cost_used_today: number;
  cost_used_week: number;
  cost_used_month: number;
  reset_daily_at: string | null;
  reset_weekly_at: string | null;
  reset_monthly_at: string | null;
  reserved_requests_active: number;
  reserved_records_active: number;
  reserved_credits_active: number;
  reserved_units_active: number;
  reserved_cost_active: number;
  last_used_at: string | null;
  last_error: string | null;
  cooldown_until: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
}

export interface ExternalProviderHealthCheckRow {
  id: string;
  provider: ExternalProvider;
  provider_account_id: string | null;
  api_key_id: string | null;
  status: ExternalProviderHealthStatus;
  latency_ms: number | null;
  checked_at: string;
  detail: Json;
}

export interface ExternalProviderPlanProfileRow {
  id: string;
  provider: ExternalProvider;
  plan_name: string;
  plan_type: ExternalProviderPlanType;
  unit_type: ExternalProviderUnitType;
  free_entitlement_amount: number;
  included_units: number;
  renewal_interval: ExternalProviderRenewalInterval;
  renewal_timezone: string;
  renewal_anchor_day: string | null;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
  overage_enabled: boolean;
  overage_unit_price: number;
  currency: string;
  cost_rules: Json;
  provider_dashboard_url: string | null;
  test_enabled: boolean;
  test_task_type: ExternalProviderTaskType | null;
  test_payload_json: Json;
  test_consumes_credits: boolean;
  expected_response_shape_json: Json;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ExternalProviderRouteRow {
  id: string;
  task_type: ExternalProviderTaskType;
  primary_provider: ExternalProvider;
  fallback_provider: ExternalProvider | null;
  fallback_2_provider: ExternalProvider | null;
  fallback_3_provider: ExternalProvider | null;
  allow_manual_fallback: boolean;
  requires_browser: boolean;
  requires_json: boolean;
  timeout_ms: number | null;
  max_attempts: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExternalProviderCallRow {
  id: string;
  organization_id: string;
  user_id: string | null;
  task_type: ExternalProviderTaskType;
  external_provider_route_id: string | null;
  provider: ExternalProvider;
  provider_account_id: string | null;
  api_key_id: string | null;
  raw_post_id: string | null;
  post_research_job_id: string | null;
  job_run_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  search_session_id: string | null;
  status: ExternalCallStatus;
  attempt_number: number;
  latency_ms: number | null;
  retry_after_seconds: number | null;
  estimated_cost: number;
  request_ref: Json;
  response_ref: Json;
  provider_request_id: string | null;
  request_hash: string | null;
  response_summary: Json;
  error_code: string | null;
  error: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface ExternalUsageEventRow {
  id: string;
  organization_id: string;
  user_id: string | null;
  provider: ExternalProvider;
  task_type: ExternalProviderTaskType;
  external_provider_call_id: string;
  api_key_id: string | null;
  provider_account_id: string | null;
  organization_source_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  search_session_id: string | null;
  raw_post_id: string | null;
  job_run_id: string | null;
  request_hash: string | null;
  provider_request_id: string | null;
  response_summary: Json;
  error_code: string | null;
  error_message: string | null;
  unit_type: ExternalProviderUnitType | null;
  requests_count: number;
  units_consumed: number;
  record_count: number;
  page_count: number;
  search_count: number;
  credit_cost: number;
  usd_credit_cost: number;
  estimated_cost: number;
  free_units_applied: number;
  paid_units_applied: number;
  paid_cost_usd: number;
  status: ExternalCallStatus;
  created_at: string;
  endpoint_key: string | null;
  dataset_key: string | null;
  actor_key: string | null;
  base_units: number;
  multiplier_total: number;
  final_units: number;
  billable_units: number;
  unit_price_usd: number;
  calculated_cost_usd: number;
  successful_record_count: number;
  failed_record_count: number;
  result_count: number;
  browser_minutes: number;
  data_transfer_mb: number;
  provider_reported_units: number | null;
  provider_reported_cost_usd: number | null;
  cost_source: ExternalCostSource | null;
  cost_rule_id: string | null;
  cost_breakdown_json: Json;
}

export interface ExternalProviderRateLimitEventRow {
  id: string;
  provider: ExternalProvider;
  provider_account_id: string | null;
  api_key_id: string | null;
  task_type: ExternalProviderTaskType | null;
  limit_type: ExternalProviderLimitType;
  occurred_at: string;
  retry_after_seconds: number | null;
  detail: Json;
}

export interface ExternalUsageReservationRow {
  id: string;
  provider: ExternalProvider;
  provider_account_id: string | null;
  api_key_id: string | null;
  task_type: ExternalProviderTaskType;
  entity_type: string | null;
  entity_id: string | null;
  request_hash: string | null;
  input_summary: Json;
  reserved_request_count: number;
  reserved_record_count: number;
  reserved_page_count: number;
  reserved_search_count: number;
  reserved_credit_cost: number;
  reserved_usd_credit_cost: number;
  reserved_units: number;
  reserved_cost_usd: number;
  status: ExternalUsageReservationStatus;
  expires_at: string;
  settled_usage_event_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExternalUsageSnapshotRow {
  id: string;
  provider: ExternalProvider;
  provider_account_id: string | null;
  api_key_id: string | null;
  period_type: ExternalUsageSnapshotPeriodType;
  period_start: string;
  period_end: string;
  unit_type: ExternalProviderUnitType;
  entitlement_units: number;
  used_units: number;
  remaining_units: number;
  usage_percent: number;
  estimated_paid_cost_usd: number;
  projected_exhaustion_at: string | null;
  projected_period_cost_usd: number;
  usage_velocity_per_day: number;
  is_estimated: boolean;
  calculated_at: string;
}

export interface ExternalAlertRuleRow {
  id: string;
  provider: ExternalProvider | null;
  api_key_id: string | null;
  threshold_percent: number | null;
  alert_type: ExternalAlertType;
  notify_master_admin: boolean;
  notify_company_admin: boolean;
  is_active: boolean;
  created_at: string;
}

export interface ExternalAlertEventRow {
  id: string;
  provider: ExternalProvider;
  provider_account_id: string | null;
  api_key_id: string | null;
  alert_rule_id: string | null;
  alert_type: ExternalAlertType;
  threshold_percent: number | null;
  dedupe_key: string | null;
  message: string;
  data: Json;
  status: ExternalAlertStatus;
  created_at: string;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
}

export interface ExternalProviderTestRunRow {
  id: string;
  provider: ExternalProvider;
  provider_account_id: string | null;
  api_key_id: string | null;
  task_type: ExternalProviderTaskType;
  test_name: string;
  status: ExternalProviderTestStatus;
  request_payload: Json;
  response_summary: Json;
  latency_ms: number | null;
  estimated_units_used: number;
  estimated_cost_usd: number;
  error_code: string | null;
  error_message: string | null;
  job_run_id: string | null;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface ExternalUsageReconciliationRow {
  id: string;
  provider: ExternalProvider;
  provider_account_id: string | null;
  api_key_id: string | null;
  period_start: string;
  period_end: string;
  internal_used_units: number;
  provider_reported_units: number | null;
  variance_units: number | null;
  variance_percent: number | null;
  status: ExternalUsageReconciliationStatus;
  raw_summary: Json;
  created_at: string;
}

export interface ExternalProviderCacheEntryRow {
  id: string;
  provider: ExternalProvider;
  task_type: ExternalProviderTaskType;
  cache_key: string;
  response_summary: Json;
  normalized_data: Json;
  units_consumed: number;
  estimated_cost_usd: number;
  source_provider: ExternalProvider;
  confidence_score: number | null;
  entity_type: string | null;
  entity_id: string | null;
  cached_at: string;
  expires_at: string;
  last_hit_at: string | null;
  hit_count: number;
}

export interface ExternalCostRuleRow {
  id: string;
  provider: ExternalProvider;
  provider_account_id: string | null;
  plan_profile_id: string | null;
  rule_name: string;
  rule_scope: ExternalCostRuleScope;
  task_type: ExternalProviderTaskType | null;
  endpoint_key: string | null;
  dataset_key: string | null;
  actor_key: string | null;
  unit_type: ExternalProviderUnitType;
  billing_event: ExternalBillingEvent;
  base_units: number;
  units_per_request: number;
  units_per_record: number;
  units_per_successful_record: number;
  units_per_failed_request: number;
  units_per_page: number;
  units_per_search: number;
  units_per_result: number;
  units_per_browser_minute: number;
  units_per_mb: number;
  unit_price_usd: number;
  minimum_units: number;
  maximum_units: number | null;
  free_tier_eligible: boolean;
  priority: number;
  formula_json: Json;
  conditions_json: Json;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ExternalOptionCostMultiplierRow {
  id: string;
  provider: ExternalProvider;
  cost_rule_id: string | null;
  option_key: string;
  option_value: string | null;
  multiplier: number;
  additional_units: number;
  additional_cost_usd: number;
  applies_to_task_types: string[];
  conditions_json: Json;
  is_active: boolean;
  created_at: string;
}

export interface ExternalEndpointCatalogRow {
  id: string;
  provider: ExternalProvider;
  endpoint_key: string;
  display_name: string;
  task_types: string[];
  dataset_key: string | null;
  actor_key: string | null;
  default_unit_type: ExternalProviderUnitType | null;
  default_cost_rule_id: string | null;
  supports_test_flow: boolean;
  test_payload_json: Json;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ExternalCostAdjustmentRow {
  id: string;
  usage_event_id: string | null;
  provider: ExternalProvider;
  provider_account_id: string | null;
  api_key_id: string | null;
  period_start: string | null;
  period_end: string | null;
  adjustment_type: string;
  unit_delta: number;
  cost_delta_usd: number;
  reason: string;
  created_by: string | null;
  created_at: string;
}

export interface ConversationRow {
  id: string;
  organization_id: string;
  opportunity_id: string | null;
  lead_id: string | null;
  company_id: string | null;
  contact_id: string | null;
  channel: OutreachChannel;
  summary: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface MessageTemplateRow {
  id: string;
  organization_id: string;
  name: string;
  channel: OutreachChannel;
  service: string | null;
  stage: LeadStage | null;
  subject_template: string | null;
  body_template: string;
  tone: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface OutreachMessageRow {
  id: string;
  organization_id: string;
  conversation_id: string | null;
  opportunity_id: string | null;
  lead_id: string | null;
  contact_id: string | null;
  channel: OutreachChannel;
  direction: OutreachDirection;
  status: OutreachStatus;
  subject: string | null;
  body: string;
  is_ai_generated: boolean;
  ai_request_id: string | null;
  message_template_id: string | null;
  sent_at: string | null;
  opened_at: string | null;
  replied_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ProposalRow {
  id: string;
  organization_id: string;
  lead_id: string | null;
  opportunity_id: string | null;
  title: string;
  status: ProposalStatus;
  value: number | null;
  currency: string | null;
  content: Json | null;
  file_attachment_id: string | null;
  ai_request_id: string | null;
  created_by: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CompanyRow {
  id: string;
  organization_id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  country: string | null;
  size: string | null;
  tech_stack: string[];
  enrichment: Json;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ContactRow {
  id: string;
  organization_id: string;
  company_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  linkedin_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface RelationshipEdgeRow {
  id: string;
  organization_id: string;
  edge_type: RelationshipEdgeType;
  source_type: RelationshipNodeType;
  source_id: string;
  target_type: RelationshipNodeType;
  target_id: string;
  weight: number;
  metadata: Json;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ActivityRow {
  id: string;
  organization_id: string;
  entity_type: RelationshipNodeType;
  entity_id: string;
  type: ActivityType;
  summary: string;
  metadata: Json;
  actor_id: string | null;
  created_at: string;
}

export interface NoteRow {
  id: string;
  organization_id: string;
  entity_type: RelationshipNodeType;
  entity_id: string;
  body: string;
  is_ai_generated: boolean;
  author_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AttachmentRow {
  id: string;
  organization_id: string;
  entity_type: RelationshipNodeType;
  entity_id: string;
  bucket: string;
  path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
  deleted_at: string | null;
}

export interface CompanyProfileRow {
  id: string;
  organization_id: string;
  version: number;
  is_active: boolean;
  services: string[];
  priority_services: string[];
  target_industries: string[];
  ideal_customer: Json;
  target_countries: string[];
  min_budget: number | null;
  bad_lead_rules: Json;
  outreach_tone: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ExtensionTokenRow {
  id: string;
  organization_id: string;
  user_id: string;
  name: string;
  token_hash: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DiscoveryRow {
  id: string;
  organization_id: string;
  batch_id: string | null;
  source: DiscoverySource;
  status: DiscoveryStatus;
  raw_payload: Json;
  title: string | null;
  description: string | null;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  country: string | null;
  budget_hint: number | null;
  dedup_hash: string | null;
  embedding: number[] | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface IngestDiscoveryCandidateResultRow {
  decision: 'inserted' | 'exact_duplicate' | 'fuzzy_duplicate';
  discovery_id: string | null;
  matched_discovery_id: string | null;
}

export interface Database {
  public: {
    Tables: {
      ai_requests: {
        Row: AiRequestRow;
        Insert: Partial<AiRequestRow> &
          Pick<AiRequestRow, 'organization_id' | 'task_type' | 'provider' | 'model' | 'status'>;
        Update: Partial<AiRequestRow>;
        Relationships: [];
      };
      ai_api_keys: {
        Row: AiApiKeyRow;
        Insert: Partial<AiApiKeyRow> &
          Pick<AiApiKeyRow, 'provider_account_id' | 'provider' | 'key_name' | 'encrypted_api_key'>;
        Update: Partial<AiApiKeyRow>;
        Relationships: [];
      };
      ai_usage_events: {
        Row: AiUsageEventRow;
        Insert: Partial<AiUsageEventRow> &
          Pick<AiUsageEventRow, 'organization_id' | 'task_type' | 'provider' | 'model' | 'ai_request_id' | 'status'>;
        Update: Partial<AiUsageEventRow>;
        Relationships: [];
      };
      ai_model_catalog: {
        Row: AiModelCatalogRow;
        Insert: Partial<AiModelCatalogRow> &
          Pick<AiModelCatalogRow, 'provider' | 'model' | 'display_name'>;
        Update: Partial<AiModelCatalogRow>;
        Relationships: [];
      };
      ai_provider_accounts: {
        Row: AiProviderAccountRow;
        Insert: Partial<AiProviderAccountRow> &
          Pick<AiProviderAccountRow, 'provider' | 'account_name'>;
        Update: Partial<AiProviderAccountRow>;
        Relationships: [];
      };
      ai_provider_health_checks: {
        Row: AiProviderHealthCheckRow;
        Insert: Partial<AiProviderHealthCheckRow> &
          Pick<AiProviderHealthCheckRow, 'provider' | 'status'>;
        Update: Partial<AiProviderHealthCheckRow>;
        Relationships: [];
      };
      ai_provider_rate_limit_events: {
        Row: AiProviderRateLimitEventRow;
        Insert: Partial<AiProviderRateLimitEventRow> &
          Pick<AiProviderRateLimitEventRow, 'provider' | 'limit_type'>;
        Update: Partial<AiProviderRateLimitEventRow>;
        Relationships: [];
      };
      ai_task_routes: {
        Row: AiTaskRouteRow;
        Insert: Partial<AiTaskRouteRow> &
          Pick<AiTaskRouteRow, 'task_type' | 'primary_provider' | 'primary_model'>;
        Update: Partial<AiTaskRouteRow>;
        Relationships: [];
      };
      ai_prompt_versions: {
        Row: AiPromptVersionRow;
        Insert: Partial<AiPromptVersionRow> &
          Pick<AiPromptVersionRow, 'agent' | 'version' | 'name' | 'system_prompt'>;
        Update: Partial<AiPromptVersionRow>;
        Relationships: [];
      };
      ai_analysis: {
        Row: AiAnalysisRow;
        Insert: Partial<AiAnalysisRow> &
          Pick<AiAnalysisRow, 'organization_id' | 'discovery_id' | 'score' | 'intent' | 'urgency'>;
        Update: Partial<AiAnalysisRow>;
        Relationships: [];
      };
      ai_action_plans: {
        Row: AiActionPlanRow;
        Insert: Partial<AiActionPlanRow> &
          Pick<
            AiActionPlanRow,
            | 'organization_id'
            | 'discovery_id'
            | 'ai_analysis_id'
            | 'recommended_action'
            | 'reason'
            | 'priority'
            | 'priority_weight'
            | 'due_at'
            | 'planned_task_title'
            | 'planned_task_type'
          >;
        Update: Partial<AiActionPlanRow>;
        Relationships: [];
      };
      company_profiles: {
        Row: CompanyProfileRow;
        Insert: Partial<CompanyProfileRow> &
          Pick<CompanyProfileRow, 'organization_id' | 'version'>;
        Update: Partial<CompanyProfileRow>;
        Relationships: [];
      };
      opportunities: {
        Row: OpportunityRow;
        Insert: Partial<OpportunityRow> & Pick<OpportunityRow, 'organization_id' | 'title'>;
        Update: Partial<OpportunityRow>;
        Relationships: [];
      };
      leads: {
        Row: LeadRow;
        Insert: Partial<LeadRow> & Pick<LeadRow, 'organization_id' | 'title'>;
        Update: Partial<LeadRow>;
        Relationships: [];
      };
      tasks: {
        Row: TaskRow;
        Insert: Partial<TaskRow> & Pick<TaskRow, 'organization_id' | 'lead_id' | 'title'>;
        Update: Partial<TaskRow>;
        Relationships: [];
      };
      lead_search_sessions: {
        Row: LeadSearchSessionRow;
        Insert: Partial<LeadSearchSessionRow> & Pick<LeadSearchSessionRow, 'organization_id'>;
        Update: Partial<LeadSearchSessionRow>;
        Relationships: [];
      };
      raw_posts: {
        Row: RawPostRow;
        Insert: Partial<RawPostRow> & Pick<RawPostRow, 'organization_id' | 'dedup_hash'>;
        Update: Partial<RawPostRow>;
        Relationships: [];
      };
      post_research_jobs: {
        Row: PostResearchJobRow;
        Insert: Partial<PostResearchJobRow> &
          Pick<PostResearchJobRow, 'organization_id' | 'raw_post_id' | 'current_stage'>;
        Update: Partial<PostResearchJobRow>;
        Relationships: [];
      };
      lead_search_session_posts: {
        Row: LeadSearchSessionPostRow;
        Insert: Partial<LeadSearchSessionPostRow> &
          Pick<LeadSearchSessionPostRow, 'organization_id' | 'search_session_id' | 'raw_post_id' | 'capture_index'>;
        Update: Partial<LeadSearchSessionPostRow>;
        Relationships: [];
      };
      raw_post_fingerprints: {
        Row: RawPostFingerprintRow;
        Insert: Partial<RawPostFingerprintRow> &
          Pick<RawPostFingerprintRow, 'organization_id' | 'raw_post_id' | 'fingerprint_type' | 'fingerprint_hash'>;
        Update: Partial<RawPostFingerprintRow>;
        Relationships: [];
      };
      post_research_reports: {
        Row: PostResearchReportRow;
        Insert: Partial<PostResearchReportRow> &
          Pick<PostResearchReportRow, 'organization_id' | 'raw_post_id'>;
        Update: Partial<PostResearchReportRow>;
        Relationships: [];
      };
      post_classifications: {
        Row: PostClassificationRow;
        Insert: Partial<PostClassificationRow> &
          Pick<PostClassificationRow, 'organization_id' | 'raw_post_id' | 'classification' | 'lead_score'>;
        Update: Partial<PostClassificationRow>;
        Relationships: [];
      };
      archived_posts: {
        Row: ArchivedPostRow;
        Insert: Partial<ArchivedPostRow> &
          Pick<ArchivedPostRow, 'organization_id' | 'raw_post_id' | 'archive_category'>;
        Update: Partial<ArchivedPostRow>;
        Relationships: [];
      };
      field_evidence_logs: {
        Row: FieldEvidenceLogRow;
        Insert: Partial<FieldEvidenceLogRow> &
          Pick<FieldEvidenceLogRow, 'organization_id' | 'entity_type' | 'entity_id' | 'field_name'>;
        Update: Partial<FieldEvidenceLogRow>;
        Relationships: [];
      };
      external_provider_accounts: {
        Row: ExternalProviderAccountRow;
        Insert: Partial<ExternalProviderAccountRow> &
          Pick<ExternalProviderAccountRow, 'provider' | 'account_name'>;
        Update: Partial<ExternalProviderAccountRow>;
        Relationships: [];
      };
      external_api_keys: {
        Row: ExternalApiKeyRow;
        Insert: Partial<ExternalApiKeyRow> &
          Pick<ExternalApiKeyRow, 'provider_account_id' | 'provider' | 'key_name' | 'encrypted_api_key'>;
        Update: Partial<ExternalApiKeyRow>;
        Relationships: [];
      };
      external_provider_health_checks: {
        Row: ExternalProviderHealthCheckRow;
        Insert: Partial<ExternalProviderHealthCheckRow> &
          Pick<ExternalProviderHealthCheckRow, 'provider' | 'status'>;
        Update: Partial<ExternalProviderHealthCheckRow>;
        Relationships: [];
      };
      external_provider_plan_profiles: {
        Row: ExternalProviderPlanProfileRow;
        Insert: Partial<ExternalProviderPlanProfileRow> &
          Pick<ExternalProviderPlanProfileRow, 'provider' | 'plan_name' | 'unit_type'>;
        Update: Partial<ExternalProviderPlanProfileRow>;
        Relationships: [];
      };
      external_provider_routes: {
        Row: ExternalProviderRouteRow;
        Insert: Partial<ExternalProviderRouteRow> &
          Pick<ExternalProviderRouteRow, 'task_type' | 'primary_provider'>;
        Update: Partial<ExternalProviderRouteRow>;
        Relationships: [];
      };
      external_provider_calls: {
        Row: ExternalProviderCallRow;
        Insert: Partial<ExternalProviderCallRow> &
          Pick<ExternalProviderCallRow, 'organization_id' | 'task_type' | 'provider'>;
        Update: Partial<ExternalProviderCallRow>;
        Relationships: [];
      };
      external_usage_events: {
        Row: ExternalUsageEventRow;
        Insert: Partial<ExternalUsageEventRow> &
          Pick<
            ExternalUsageEventRow,
            'organization_id' | 'provider' | 'task_type' | 'external_provider_call_id'
          >;
        Update: Partial<ExternalUsageEventRow>;
        Relationships: [];
      };
      external_provider_rate_limit_events: {
        Row: ExternalProviderRateLimitEventRow;
        Insert: Partial<ExternalProviderRateLimitEventRow> &
          Pick<ExternalProviderRateLimitEventRow, 'provider' | 'limit_type'>;
        Update: Partial<ExternalProviderRateLimitEventRow>;
        Relationships: [];
      };
      external_usage_reservations: {
        Row: ExternalUsageReservationRow;
        Insert: Partial<ExternalUsageReservationRow> &
          Pick<
            ExternalUsageReservationRow,
            'provider' | 'task_type' | 'expires_at'
          >;
        Update: Partial<ExternalUsageReservationRow>;
        Relationships: [];
      };
      external_usage_snapshots: {
        Row: ExternalUsageSnapshotRow;
        Insert: Partial<ExternalUsageSnapshotRow> &
          Pick<
            ExternalUsageSnapshotRow,
            'provider' | 'period_type' | 'period_start' | 'period_end' | 'unit_type'
          >;
        Update: Partial<ExternalUsageSnapshotRow>;
        Relationships: [];
      };
      external_alert_rules: {
        Row: ExternalAlertRuleRow;
        Insert: Partial<ExternalAlertRuleRow> &
          Pick<ExternalAlertRuleRow, 'alert_type'>;
        Update: Partial<ExternalAlertRuleRow>;
        Relationships: [];
      };
      external_alert_events: {
        Row: ExternalAlertEventRow;
        Insert: Partial<ExternalAlertEventRow> &
          Pick<ExternalAlertEventRow, 'provider' | 'alert_type' | 'message'>;
        Update: Partial<ExternalAlertEventRow>;
        Relationships: [];
      };
      external_provider_test_runs: {
        Row: ExternalProviderTestRunRow;
        Insert: Partial<ExternalProviderTestRunRow> &
          Pick<
            ExternalProviderTestRunRow,
            'provider' | 'task_type' | 'test_name'
          >;
        Update: Partial<ExternalProviderTestRunRow>;
        Relationships: [];
      };
      external_usage_reconciliations: {
        Row: ExternalUsageReconciliationRow;
        Insert: Partial<ExternalUsageReconciliationRow> &
          Pick<ExternalUsageReconciliationRow, 'provider' | 'period_start' | 'period_end'>;
        Update: Partial<ExternalUsageReconciliationRow>;
        Relationships: [];
      };
      external_provider_cache_entries: {
        Row: ExternalProviderCacheEntryRow;
        Insert: Partial<ExternalProviderCacheEntryRow> &
          Pick<
            ExternalProviderCacheEntryRow,
            'provider' | 'task_type' | 'cache_key' | 'source_provider' | 'expires_at'
          >;
        Update: Partial<ExternalProviderCacheEntryRow>;
        Relationships: [];
      };
      conversations: {
        Row: ConversationRow;
        Insert: Partial<ConversationRow> & Pick<ConversationRow, 'organization_id' | 'channel'>;
        Update: Partial<ConversationRow>;
        Relationships: [];
      };
      message_templates: {
        Row: MessageTemplateRow;
        Insert: Partial<MessageTemplateRow> &
          Pick<MessageTemplateRow, 'organization_id' | 'name' | 'channel' | 'body_template'>;
        Update: Partial<MessageTemplateRow>;
        Relationships: [];
      };
      outreach_messages: {
        Row: OutreachMessageRow;
        Insert: Partial<OutreachMessageRow> &
          Pick<OutreachMessageRow, 'organization_id' | 'channel' | 'direction' | 'body'>;
        Update: Partial<OutreachMessageRow>;
        Relationships: [];
      };
      proposals: {
        Row: ProposalRow;
        Insert: Partial<ProposalRow> & Pick<ProposalRow, 'organization_id' | 'title'>;
        Update: Partial<ProposalRow>;
        Relationships: [];
      };
      companies: {
        Row: CompanyRow;
        Insert: Partial<CompanyRow> & Pick<CompanyRow, 'organization_id' | 'name'>;
        Update: Partial<CompanyRow>;
        Relationships: [];
      };
      contacts: {
        Row: ContactRow;
        Insert: Partial<ContactRow> & Pick<ContactRow, 'organization_id' | 'name'>;
        Update: Partial<ContactRow>;
        Relationships: [];
      };
      relationship_edges: {
        Row: RelationshipEdgeRow;
        Insert: Partial<RelationshipEdgeRow> &
          Pick<
            RelationshipEdgeRow,
            'organization_id' | 'edge_type' | 'source_type' | 'source_id' | 'target_type' | 'target_id'
          >;
        Update: Partial<RelationshipEdgeRow>;
        Relationships: [];
      };
      activities: {
        Row: ActivityRow;
        Insert: Partial<ActivityRow> &
          Pick<ActivityRow, 'organization_id' | 'entity_type' | 'entity_id' | 'type' | 'summary'>;
        Update: Partial<ActivityRow>;
        Relationships: [];
      };
      notes: {
        Row: NoteRow;
        Insert: Partial<NoteRow> &
          Pick<NoteRow, 'organization_id' | 'entity_type' | 'entity_id' | 'body'>;
        Update: Partial<NoteRow>;
        Relationships: [];
      };
      attachments: {
        Row: AttachmentRow;
        Insert: Partial<AttachmentRow> &
          Pick<
            AttachmentRow,
            'organization_id' | 'entity_type' | 'entity_id' | 'bucket' | 'path' | 'file_name'
          >;
        Update: Partial<AttachmentRow>;
        Relationships: [];
      };
      company_usage_limits: {
        Row: CompanyUsageLimitRow;
        Insert: Partial<CompanyUsageLimitRow> &
          Pick<CompanyUsageLimitRow, 'organization_id' | 'period' | 'reset_at'>;
        Update: Partial<CompanyUsageLimitRow>;
        Relationships: [];
      };
      integration_accounts: {
        Row: IntegrationAccountRow;
        Insert: Partial<IntegrationAccountRow> &
          Pick<IntegrationAccountRow, 'organization_id' | 'provider' | 'type'>;
        Update: Partial<IntegrationAccountRow>;
        Relationships: [];
      };
      extension_tokens: {
        Row: ExtensionTokenRow;
        Insert: Partial<ExtensionTokenRow> &
          Pick<ExtensionTokenRow, 'organization_id' | 'user_id' | 'name' | 'token_hash'>;
        Update: Partial<ExtensionTokenRow>;
        Relationships: [];
      };
      discovery_batches: {
        Row: DiscoveryBatchRow;
        Insert: Partial<DiscoveryBatchRow> &
          Pick<DiscoveryBatchRow, 'organization_id' | 'source' | 'channel'>;
        Update: Partial<DiscoveryBatchRow>;
        Relationships: [];
      };
      discoveries: {
        Row: DiscoveryRow;
        Insert: Partial<DiscoveryRow> &
          Pick<DiscoveryRow, 'organization_id' | 'source' | 'raw_payload'>;
        Update: Partial<DiscoveryRow>;
        Relationships: [];
      };
      job_runs: {
        Row: JobRunRow;
        Insert: Partial<JobRunRow> & Pick<JobRunRow, 'organization_id' | 'queue_name' | 'job_name'>;
        Update: Partial<JobRunRow>;
        Relationships: [];
      };
      memberships: {
        Row: MembershipRow;
        Insert: Omit<MembershipRow, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<MembershipRow>;
        Relationships: [];
      };
      organizations: {
        Row: OrganizationRow;
        Insert: Partial<OrganizationRow> &
          Pick<OrganizationRow, 'name' | 'slug' | 'settings'>;
        Update: Partial<OrganizationRow>;
        Relationships: [];
      };
      scoring_strategies: {
        Row: ScoringStrategyRow;
        Insert: Partial<ScoringStrategyRow> &
          Pick<ScoringStrategyRow, 'organization_id' | 'version' | 'kind' | 'weights' | 'metrics'>;
        Update: Partial<ScoringStrategyRow>;
        Relationships: [];
      };
      usage_credit_grants: {
        Row: UsageCreditGrantRow;
        Insert: Partial<UsageCreditGrantRow> &
          Pick<UsageCreditGrantRow, 'organization_id' | 'metric' | 'amount'>;
        Update: Partial<UsageCreditGrantRow>;
        Relationships: [];
      };
      external_cost_rules: {
        Row: ExternalCostRuleRow;
        Insert: Partial<ExternalCostRuleRow> & Pick<ExternalCostRuleRow, 'provider' | 'rule_name' | 'rule_scope' | 'unit_type'>;
        Update: Partial<ExternalCostRuleRow>;
        Relationships: [];
      };
      external_option_cost_multipliers: {
        Row: ExternalOptionCostMultiplierRow;
        Insert: Partial<ExternalOptionCostMultiplierRow> & Pick<ExternalOptionCostMultiplierRow, 'provider' | 'option_key'>;
        Update: Partial<ExternalOptionCostMultiplierRow>;
        Relationships: [];
      };
      external_endpoint_catalog: {
        Row: ExternalEndpointCatalogRow;
        Insert: Partial<ExternalEndpointCatalogRow> & Pick<ExternalEndpointCatalogRow, 'provider' | 'endpoint_key' | 'display_name'>;
        Update: Partial<ExternalEndpointCatalogRow>;
        Relationships: [];
      };
      external_cost_adjustments: {
        Row: ExternalCostAdjustmentRow;
        Insert: Partial<ExternalCostAdjustmentRow> & Pick<ExternalCostAdjustmentRow, 'provider' | 'adjustment_type' | 'reason'>;
        Update: Partial<ExternalCostAdjustmentRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_company_profile_version: {
        Args: {
          org: string;
          services: string[] | null;
          priority_services: string[] | null;
          target_industries: string[] | null;
          ideal_customer: Json | null;
          target_countries: string[] | null;
          min_budget: number | null;
          bad_lead_rules: Json | null;
          outreach_tone: string | null;
        };
        Returns: CompanyProfileRow;
      };
      ingest_discovery_candidate: {
        Args: {
          p_org: string;
          p_batch: string | null;
          p_source: DiscoverySource;
          p_raw_payload: Json;
          p_title?: string | null;
          p_description?: string | null;
          p_company_name?: string | null;
          p_contact_name?: string | null;
          p_email?: string | null;
          p_phone?: string | null;
          p_website?: string | null;
          p_country?: string | null;
          p_budget_hint?: number | null;
          p_dedup_hash?: string | null;
          p_created_by?: string | null;
        };
        Returns: IngestDiscoveryCandidateResultRow[];
      };
      create_ai_prompt_version: {
        Args: {
          org: string | null;
          p_agent: string;
          p_name: string;
          p_system_prompt: string;
          p_description?: string | null;
          p_user_prompt_template?: string | null;
          p_output_schema?: Json;
          p_model_preferences?: Json;
          p_activate?: boolean;
        };
        Returns: AiPromptVersionRow;
      };
      activate_ai_prompt_version: {
        Args: { p_id: string };
        Returns: AiPromptVersionRow;
      };
      convert_discovery_to_opportunity: {
        Args: { p_discovery: string; p_owner?: string | null; p_force?: boolean };
        Returns: OpportunityRow;
      };
      promote_opportunity_to_lead: {
        Args: { p_opportunity: string; p_owner?: string | null };
        Returns: LeadRow;
      };
      close_lead: {
        Args: { p_lead: string; p_outcome: string; p_reason?: string | null };
        Returns: LeadRow;
      };
      complete_task: {
        Args: {
          p_task: string;
          p_followup_title?: string | null;
          p_followup_due_at?: string | null;
          p_followup_priority?: string | null;
          p_followup_assignee?: string | null;
        };
        Returns: TaskRow;
      };
      cancel_task: {
        Args: { p_task: string; p_followup_title?: string | null; p_followup_due_at?: string | null };
        Returns: TaskRow;
      };
      active_leads_missing_open_task: {
        Args: { p_org: string };
        Returns: LeadRow[];
      };
      record_outreach_message: {
        Args: {
          p_channel: OutreachChannel;
          p_direction: OutreachDirection;
          p_body: string;
          p_lead?: string | null;
          p_opportunity?: string | null;
          p_contact?: string | null;
          p_conversation?: string | null;
          p_subject?: string | null;
          p_status?: OutreachStatus;
          p_is_ai_generated?: boolean;
          p_ai_request_id?: string | null;
          p_message_template_id?: string | null;
        };
        Returns: OutreachMessageRow;
      };
      upsert_company: {
        Args: {
          p_org: string;
          p_name: string;
          p_domain?: string | null;
          p_industry?: string | null;
          p_country?: string | null;
          p_size?: string | null;
          p_tech_stack?: string[] | null;
          p_enrichment?: Json | null;
        };
        Returns: CompanyRow;
      };
      upsert_contact: {
        Args: {
          p_org: string;
          p_name: string;
          p_company?: string | null;
          p_email?: string | null;
          p_phone?: string | null;
          p_title?: string | null;
          p_linkedin_url?: string | null;
        };
        Returns: ContactRow;
      };
      merge_companies: { Args: { p_primary: string; p_duplicate: string }; Returns: CompanyRow };
      merge_contacts: { Args: { p_primary: string; p_duplicate: string }; Returns: ContactRow };
      upsert_relationship_edge: {
        Args: {
          p_org: string;
          p_edge_type: RelationshipEdgeType;
          p_source_type: RelationshipNodeType;
          p_source_id: string;
          p_target_type: RelationshipNodeType;
          p_target_id: string;
          p_weight?: number | null;
          p_metadata?: Json | null;
        };
        Returns: RelationshipEdgeRow;
      };
      delete_relationship_edge: { Args: { p_id: string }; Returns: RelationshipEdgeRow };
      add_note: {
        Args: {
          p_org: string;
          p_entity_type: RelationshipNodeType;
          p_entity_id: string;
          p_body: string;
          p_is_ai_generated?: boolean;
        };
        Returns: NoteRow;
      };
      record_attachment: {
        Args: {
          p_org: string;
          p_entity_type: RelationshipNodeType;
          p_entity_id: string;
          p_bucket: string;
          p_path: string;
          p_file_name: string;
          p_mime_type?: string | null;
          p_size_bytes?: number | null;
        };
        Returns: AttachmentRow;
      };
      delete_note: { Args: { p_id: string }; Returns: NoteRow };
      delete_attachment: { Args: { p_id: string }; Returns: AttachmentRow };
      has_permission: { Args: { org: string; perm: string }; Returns: boolean };
      is_member: { Args: { org: string }; Returns: boolean };
    };
    Enums: {
      job_status: JobStatus;
      membership_status: MembershipStatus;
      discovery_source: DiscoverySource;
      discovery_status: DiscoveryStatus;
      discovery_channel: DiscoveryChannel;
      discovery_batch_status: DiscoveryBatchStatus;
      ai_provider: AiProviderName;
      ai_provider_account_type: AiProviderAccountType;
      ai_provider_account_status: AiProviderAccountStatus;
      ai_api_key_status: AiApiKeyStatus;
      ai_provider_health_status: AiProviderHealthStatus;
      ai_provider_limit_type: AiProviderLimitType;
      ai_call_status: AiCallStatus;
      scoring_strategy_kind: ScoringStrategyKind;
      usage_credit_metric: UsageCreditMetric;
      opportunity_status: OpportunityStatus;
      lead_stage: LeadStage;
      task_status: TaskStatus;
      raw_post_status: RawPostStatus;
      research_job_stage: ResearchJobStage;
      lead_hunting_classification: LeadHuntingClassification;
      archived_post_category: ArchivedPostCategory;
      raw_post_fingerprint_type: RawPostFingerprintType;
      external_provider: ExternalProvider;
      external_provider_task_type: ExternalProviderTaskType;
      external_provider_account_type: ExternalProviderAccountType;
      external_provider_account_status: ExternalProviderAccountStatus;
      external_api_key_status: ExternalApiKeyStatus;
      external_provider_health_status: ExternalProviderHealthStatus;
      external_provider_limit_type: ExternalProviderLimitType;
      external_call_status: ExternalCallStatus;
      external_provider_plan_type: ExternalProviderPlanType;
      external_provider_unit_type: ExternalProviderUnitType;
      external_provider_renewal_interval: ExternalProviderRenewalInterval;
      external_usage_reservation_status: ExternalUsageReservationStatus;
      external_usage_snapshot_period_type: ExternalUsageSnapshotPeriodType;
      external_alert_type: ExternalAlertType;
      external_alert_status: ExternalAlertStatus;
      external_provider_test_status: ExternalProviderTestStatus;
      external_usage_reconciliation_status: ExternalUsageReconciliationStatus;
      external_cost_rule_scope: ExternalCostRuleScope;
      external_billing_event: ExternalBillingEvent;
      external_cost_source: ExternalCostSource;
      external_route_behavior_mode: ExternalRouteBehaviorMode;
      outreach_channel: OutreachChannel;
      outreach_direction: OutreachDirection;
      outreach_status: OutreachStatus;
      proposal_status: ProposalStatus;
      relationship_node_type: RelationshipNodeType;
      relationship_edge_type: RelationshipEdgeType;
      activity_type: ActivityType;
    };
    CompositeTypes: Record<string, never>;
  };
}
