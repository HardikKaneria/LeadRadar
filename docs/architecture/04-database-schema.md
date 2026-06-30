# 04 — Database Schema

**Engine:** PostgreSQL 16 + extensions `pgcrypto` (UUIDs), `pgvector` (embeddings),
`pg_trgm` (fuzzy dedup), `btree_gin`.

## Conventions

- PK: `id uuid default gen_random_uuid()` (except append-only logs which use `bigserial`).
- **Every tenant-owned business table includes:**
  - `organization_id uuid not null references organizations(id)`
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz` (trigger-maintained) **where the row is mutable**
  - `deleted_at timestamptz` **where the record is recoverable** (soft delete)
  - `created_by uuid references users(id)` **where a user action matters**
- Money: `numeric(14,2)` + `currency char(3)`. Enums: native Postgres `enum` types.
- JSON: `jsonb` for flexible/raw payloads. Embeddings: `vector(1536)` (configurable).
- Audit: append-only `audit_log`; domain timeline in `activities`.

## Canonical enums (used everywhere — see consistency pass in README)

| Enum | Values |
|------|--------|
| **discovery_source** | `linkedin`, `upwork`, `freelancer`, `website`, `referral`, `manual`, `csv`, `whatsapp`, `email`, `existing_customer`, `conference`, `client_call`, `partnership`, `other` |
| **discovery_status** | `new`, `processing`, `analyzed`, `reviewed`, `approved`, `ignored`, `converted` |
| **opportunity_status** | `open`, `qualified`, `promoted_to_lead`, `ignored`, `expired`, `archived` |
| **lead_stage** | `new`, `contacted`, `reply_received`, `meeting_scheduled`, `proposal_sent`, `negotiation`, `won`, `lost`, `on_hold` |
| **priority** (user-facing) | `critical`, `high`, `medium`, `low` — internal numeric weight stored separately as `priority_weight smallint` |
| **task_status** | `open`, `done`, `cancelled` |
| **job_status** | `queued`, `running`, `completed`, `failed`, `cancelled`, `retrying` |
| **proposal_status** | `draft`, `ready`, `sent`, `accepted`, `rejected`, `expired` |
| **outreach_channel** | `email`, `linkedin`, `whatsapp`, `upwork`, `freelancer`, `phone`, `meeting`, `other` |
| **outreach_direction** | `outbound`, `inbound`, `internal_note` |
| **outreach_status** | `draft`, `ready`, `sent`, `failed`, `received` |

## Multi-tenancy

`organization_id` on every business row, injected from request context by the repository
layer on every read/write. Optional Postgres **RLS** as defense-in-depth:
`USING (organization_id = current_setting('app.org_id')::uuid)`.

---

## 4.1 Entity-relationship overview

```
organizations 1─┬─* memberships *─1 users          (RBAC: roles ─* role_permissions *─ permissions)
                ├─1 company_profiles (versioned)
                ├─* discovery_batches 1─* discoveries 1─* ai_analysis
                ├─* opportunities *─1 companies 1─* contacts
                │        ├─ created_from discovery
                │        └─1 lead 1─* tasks
                ├─* leads 1─* outreach_messages ─* conversations
                │        └─* proposals
                ├─* knowledge_events ─▶ scoring_strategies (one active)
                ├─* relationship_edges  (graph over companies/contacts/opportunities)
                ├─* attachments / notes / activities / audit_log (polymorphic)
                ├─* notifications ─ notification_preferences
                ├─* ai_requests ─1 ai_prompt_versions ─* ai_usage_events
                ├─* job_runs
                ├─* integration_accounts / extension_tokens
                └─1 subscription ─1 plan ─* usage_limits / company_usage_limits / usage_credit_grants ─* billing_events

PLATFORM (not tenant-scoped): platform_admins · ai_provider_accounts 1─* ai_api_keys ·
   ai_task_routes · ai_model_catalog · ai_provider_health_checks · ai_provider_rate_limit_events
```

---

## 4.2 Platform & identity

### organizations
| col | type | notes |
|-----|------|-------|
| id | uuid PK | |
| name | text not null | |
| slug | citext unique | |
| settings | jsonb | business hours, follow-up defaults, score threshold, **`privacy_mode`** (`free_api_allowed`/`redact_pii_before_ai`/`paid_only`/`byok_only`/`disabled`; v1 default `redact_pii_before_ai`) |
| created_at / updated_at | timestamptz | |

### users
`id uuid PK · email citext unique · name · password_hash · avatar_url · created_at/updated_at`

### platform_admins  (Master Admin — platform operators, **not** tenant members)
`id uuid PK · user_id FK → users · role enum(master_admin) · status enum(active,disabled) · created_at · updated_at`
- *Why:* the Master Admin operates the whole platform and is **not** scoped to any one org, so
  they live here, not in `memberships`. Governs `/admin/*` (see
  [15 · Roles, Permissions & Admin System](./15-roles-permissions-and-admin-system.md)).

### memberships  (user ↔ org, carries the assigned role)
`id uuid PK · organization_id FK · user_id FK · role_id FK → roles · invited_by uuid · status enum(active,invited,disabled) · created_at/updated_at`
- Unique(organization_id, user_id). Index(user_id).
- `role_id` replaces the old hard-coded role string (see RBAC below).

---

## 4.3 RBAC (scalable SaaS permissions)

> Replaces the previous hard-coded `owner/admin/member` enum. Roles are now data, so orgs
> can define custom roles and the permission surface can grow without migrations.

### roles
| col | type | notes |
|-----|------|-------|
| id | uuid PK | |
| organization_id | uuid FK **nullable** | `null` = system role shared by all orgs |
| name | text not null | display name |
| slug | text not null | stable key |
| is_system | bool not null default false | system roles can't be deleted |
| created_at / updated_at | timestamptz | |
- Unique(organization_id, slug). **Default system roles (org_id null):** `master_admin`,
  `company_admin`, `sales_executive`. **Future system roles (data-only):** `manager`, `viewer`,
  `billing_admin`, `ai_admin`, optional `senior_sales_executive`.
- *Why:* per-tenant custom roles + protected system roles, the standard SaaS RBAC pattern.
  Full role→permission defaults in [15](./15-roles-permissions-and-admin-system.md).

### permissions  (global catalog, not tenant-owned)
| id uuid PK · key text unique · description text · category text · created_at |
- *Why:* a single source of truth for what can be authorized; UI groups by `category`.
- **Categories & keys (full catalog in [15 §15.6](./15-roles-permissions-and-admin-system.md)):**
  - **platform:** `platform.dashboard.read`, `platform.companies.manage`, `platform.users.manage`,
    `platform.ai_providers.manage`, `platform.ai_routes.manage`, `platform.usage.read`,
    `platform.billing.manage`, `platform.audit.read`, `platform.jobs.manage`, `platform.support_access`
  - **company:** `company.dashboard.read`, `company.settings.manage`, `company_brain.manage`,
    `members.manage`, `roles.manage`, `company.billing.read`, `company.billing.manage`,
    `company.usage.read`, `company.audit.read`
  - **discovery:** `discoveries.read`/`read_own`/`read_team`/`create`/`capture`/`create_manual`/
    `import_csv`/`review`/`submit_for_approval`/`approve`/`ignore`/`convert_to_opportunity`
  - **opportunity:** `opportunities.read`/`read_own`/`read_team`/`manage`/`manage_own`/`manage_team`/
    `assign`/`create_from_discovery`/`promote_to_lead`
  - **lead/task:** `leads.read`/`read_own`/`read_team`/`manage`/`manage_own`/`manage_team`/`close`,
    `tasks.read`/`read_own`/`manage`/`manage_own`/`assign_team`
  - **ai:** `ai.use`, `ai.sales_assistant.use`, `ai.company_research.use`, `ai.reanalyze.use`,
    `ai.proposal.generate`, `ai.usage.read`, `ai.settings.manage`
  - **sensitive:** `api_keys.manage`, `integrations.manage`, `audit.read`, `billing.manage`,
    `support.impersonate`
  - **usage:** `usage.read_own`, `usage.read_company_summary`, `usage.read_company`, `usage.read_platform`
  > `ai.settings.manage`/`api_keys.manage` are **org-level** (BYOK). The **platform** provider
  > accounts, key pool, and routing are gated by `platform.ai_providers.manage` /
  > `platform.ai_routes.manage` — Master Admin only.

### role_permissions  (join)
| role_id uuid FK · permission_id uuid FK · created_at |
- PK(role_id, permission_id). *Why:* many-to-many role↔permission mapping.

### company_profiles  (M1 — the Company Brain, versioned)
| col | type | notes |
|-----|------|-------|
| id uuid PK · organization_id FK | | |
| version int · is_active bool | | one active per org |
| services text[] · priority_services text[] | | offered / weighted-higher |
| target_industries text[] · ideal_customer jsonb | | ICP |
| target_countries text[] · min_budget numeric(14,2) | | ISO codes / budget floor |
| bad_lead_rules jsonb | | exclusion rules |
| outreach_tone text | | default tone for AI Sales Assistant |
| created_by uuid · created_at | | |
- Partial unique `(organization_id) WHERE is_active`.

---

## 4.4 Discovery layer

### discovery_batches  (one capture/import)
`id uuid PK · organization_id FK · source discovery_source · channel enum(extension,manual,csv,api) · captured_by uuid (created_by) · raw_blob_url text · parser_version text · item_count int · status · created_at`

### discoveries  (M2 — raw first)
| col | type | notes |
|-----|------|-------|
| id uuid PK · organization_id FK · batch_id FK | | |
| source | **discovery_source** | expanded enum |
| status | **discovery_status** | |
| raw_payload | jsonb not null | verbatim captured/entered data |
| title · description | text | normalized |
| company_name / contact_name / email / phone / website / country | text | hints |
| budget_hint | numeric(14,2) | |
| dedup_hash | text | idempotency/fuzzy dedup |
| embedding | vector(1536) | nullable until analyzed |
| capture_channel | enum(extension,manual,csv,api) | how it entered |
| captured_by_user_id uuid FK | | the Sales Executive who captured it |
| assigned_to_user_id uuid FK | | current owner for triage/outreach |
| reviewed_by_user_id uuid FK | | who reviewed the AI analysis |
| approved_by_user_id uuid FK | | who approved → opportunity |
| created_by uuid · created_at / updated_at / deleted_at | | |
- Indexes: (organization_id, status), (organization_id, source, created_at),
  (organization_id, captured_by_user_id, created_at), (organization_id, assigned_to_user_id, status),
  GIN(raw_payload), GIN(title gin_trgm_ops), ivfflat(embedding),
  unique(organization_id, dedup_hash).
- *Why ownership cols:* powers per-Sales-Executive reporting — who captured the most / highest-score
  opportunities, which platform gives the best leads, who converts most, who burns AI credits.

### ai_analysis  (M5 — re-runnable; keep latest + history)
| col | type | notes |
|-----|------|-------|
| id uuid PK · organization_id FK · discovery_id FK | | |
| score int (0–100) · intent enum(high,medium,low,unclear) | | |
| service_match jsonb · budget_estimate numeric(14,2) | | |
| urgency enum(urgent,soon,later,none) · confidence numeric(4,3) | | |
| recommended_action text · reason text | | explainable |
| scoring_strategy_id FK | | which strategy produced this |
| ai_prompt_version_id FK → ai_prompt_versions | | **prompt version used** |
| model_meta jsonb | | provider, model |
| created_at | | |
- Index (organization_id, discovery_id, created_at desc).

### ai_action_plans  (M5 — re-runnable planner output; pre-opportunity/task seam)
| col | type | notes |
|-----|------|-------|
| id uuid PK · organization_id FK · discovery_id FK · ai_analysis_id FK | | tied to the exact analysis row |
| recommended_action text · reason text | | explainable planner output |
| priority **priority**(`critical`/`high`/`medium`/`low`) · priority_weight smallint | | deterministic internal weight |
| due_at timestamptz | | recommended next-action deadline |
| planned_task_title text · planned_task_type enum(call,email,message,meeting,proposal,custom) | | first task draft |
| planned_task_notes text | | optional operator-facing notes |
| ai_prompt_version_id FK → ai_prompt_versions | | prompt version used |
| model_meta jsonb | | provider, model |
| created_at | | |
- Indexes: (organization_id, discovery_id, created_at desc), (organization_id, due_at, priority_weight desc).

---

## 4.5 Opportunity → Lead → Deal

### companies  (M7)
`id uuid PK · organization_id FK · name · domain citext · industry · country · size · tech_stack text[] · enrichment jsonb · created_by · created_at/updated_at/deleted_at`
- Unique(organization_id, domain) where domain not null; GIN(name gin_trgm_ops).

### contacts  (M7)
`id uuid PK · organization_id FK · company_id FK · name · email citext · phone · title · linkedin_url · created_by · created_at/updated_at/deleted_at`
- Index(organization_id, email).

### opportunities  (M6)
| col | type | notes |
|-----|------|-------|
| id uuid PK · organization_id FK | | |
| discovery_id FK · company_id FK · primary_contact_id FK | | provenance + links |
| title · description | text | |
| status | **opportunity_status** (`open`,`qualified`,`promoted_to_lead`,`ignored`,`expired`,`archived`) | |
| score int · priority **priority**(`critical`/`high`/`medium`/`low`) · priority_weight smallint | | numeric weight internal |
| potential_value numeric(14,2) · currency | | |
| heat_score numeric(6,2) · expires_at timestamptz | | derived / expiry prediction |
| recommended_action text · ai_explanation text | | |
| owner_id uuid · created_by uuid | | |
| created_at/updated_at/deleted_at | | |
- Indexes: (organization_id, status, score desc), (organization_id, owner_id),
  (organization_id, heat_score desc), (organization_id, expires_at),
  (organization_id, priority_weight desc).

### leads  (M9)
| col | type | notes |
|-----|------|-------|
| id uuid PK · organization_id FK · opportunity_id FK · company_id FK · contact_id FK | | |
| stage | **lead_stage** | |
| owner_id uuid not null · created_by uuid | | accountability |
| value numeric(14,2) · currency | | |
| next_action_at timestamptz | | mirror of soonest open task |
| won_at / lost_at timestamptz · lost_reason text | | |
| created_at/updated_at/deleted_at | | |
- Indexes: (organization_id, stage), (organization_id, owner_id, stage), (organization_id, next_action_at).
- **Invariant:** a lead in an active stage must have ≥1 open task (service guard + checker job).

### tasks  (M10)
`id uuid PK · organization_id FK · lead_id FK? · opportunity_id FK? · owner_id uuid not null · title · type enum(call,email,message,meeting,proposal,custom) · due_at timestamptz not null · priority **priority** · priority_weight smallint · status task_status · completed_at · created_by · created_at/updated_at`
- Indexes: (organization_id, status, due_at), (organization_id, owner_id, status, due_at).

---

## 4.6 Outreach & conversations (M11)

### outreach_messages
| col | type | notes |
|-----|------|-------|
| id uuid PK · organization_id FK | | |
| opportunity_id FK? · lead_id FK? · contact_id FK? | | |
| channel **outreach_channel** · direction **outreach_direction** · status **outreach_status** | | |
| subject text · body text | | |
| is_ai_generated bool · ai_request_id FK? · message_template_id FK? | | provenance |
| sent_at · opened_at · replied_at timestamptz | | engagement signals |
| created_by uuid · created_at/updated_at | | |
- Indexes: (organization_id, lead_id, created_at), (organization_id, opportunity_id), (organization_id, status).
- *Why:* the AI Sales Assistant needs persistent outreach history; engagement timestamps feed heat score & learning.

### conversations
`id uuid PK · organization_id FK · opportunity_id FK? · lead_id FK? · company_id FK? · contact_id FK? · channel outreach_channel · summary text · last_message_at timestamptz · created_at/updated_at`
- *Why:* threads outreach_messages and stores an AI-maintained rolling summary per channel.

### message_templates
`id uuid PK · organization_id FK · name · channel outreach_channel · service text · stage lead_stage · subject_template text · body_template text · tone text · is_active bool · created_by · created_at/updated_at`
- *Why:* reusable, tone-controlled templates the assistant fills; keyed by service + stage.

### proposals
| col | type | notes |
|-----|------|-------|
| id uuid PK · organization_id FK · lead_id FK? · opportunity_id FK? | | |
| title · status **proposal_status**(`draft`,`ready`,`sent`,`accepted`,`rejected`,`expired`) | | |
| value numeric(14,2) · currency | | |
| content jsonb/text · file_attachment_id FK → attachments | | rendered output |
| ai_request_id FK? | | provenance |
| created_by uuid · sent_at · accepted_at · rejected_at | | |
| created_at/updated_at | | |
- *Why:* first-class proposal lifecycle + storage, separate from generic notes.

---

## 4.7 Knowledge & learning

### knowledge_events  (M12 — the moat's raw material)
`id uuid PK · organization_id FK · type enum(won,lost,on_hold,no_response,outreach_sent,reply,pattern) · lead_id FK? · opportunity_id FK? · source discovery_source · outcome jsonb · features jsonb · embedding vector(1536) · created_at`
- Index (organization_id, type, created_at), ivfflat(embedding).
- `source` denormalized for revenue attribution by source.

### scoring_strategies  (M12 — replaceable scoring)
`id uuid PK · organization_id FK · version int · kind enum(heuristic,statistical,ml) · weights jsonb · metrics jsonb · is_active bool · created_by · created_at`
- Partial unique `(organization_id) WHERE is_active`.

### relationship_edges  (M7 — the relationship graph)
| col | type | notes |
|-----|------|-------|
| id uuid PK · organization_id FK | | |
| from_entity_type text · from_entity_id uuid | | |
| to_entity_type text · to_entity_id uuid | | |
| relationship_type | enum(`works_at`,`referred_by`,`knows`,`decision_maker_for`,`influencer_for`,`previous_client`,`partner`,`competitor`,`same_company`,`same_domain`) | |
| strength numeric(4,3) · source text · meta jsonb | | weighted edges |
| created_at/updated_at | | |
- Indexes: (organization_id, from_entity_type, from_entity_id), (organization_id, to_entity_type, to_entity_id), (organization_id, relationship_type).
- *Why:* powers decision-maker mapping, referrals, previous-client revival, influence paths.

---

## 4.8 AI infrastructure

### ai_prompt_versions  (versioned, auditable prompts)
| col | type | notes |
|-----|------|-------|
| id uuid PK | | |
| organization_id uuid FK **nullable** | | `null` = system default prompt; set = org custom |
| agent enum(opportunity_analyzer,action_planner,company_research,sales_message,follow_up_message,conversation_summary,proposal_generator,meeting_prep,next_action,embedding,learning_summary) | | mirrors `ai_task_routes.task_type` |
| version int · name · description | | |
| system_prompt text · user_prompt_template text | | |
| output_schema jsonb | | expected structured-output schema |
| model_preferences jsonb | | preferred provider/model/params |
| is_active bool · created_by uuid · created_at/updated_at | | |
- Partial unique `(organization_id, agent) WHERE is_active` (and `WHERE organization_id IS NULL` for system defaults).
- **Rules:** system defaults have `organization_id = null`; org custom prompts set it.
  Every `ai_request` references `ai_prompt_version_id`; every `ai_analysis` stores it.

### ai_requests  (M4 — every model call, for cost & audit)
| col | type | notes |
|-----|------|-------|
| id uuid PK · organization_id FK | | |
| agent enum(...) · provider text · model text | | |
| ai_prompt_version_id FK → ai_prompt_versions **not null** | | links the exact prompt |
| input_tokens int · output_tokens int · cost_usd numeric(10,5) | | |
| latency_ms int · status enum(ok,error,fallback) · error text | | |
| job_run_id FK? · request_ref jsonb | | **redacted** input ref / entity id (never raw PII) |
| created_at | | |
- Indexes: (organization_id, agent, created_at), (organization_id, provider, created_at). Partition by month at volume.
- **`ai_requests` is the technical log** (one row per attempt incl. fallbacks). The
  **billing/credits ledger is `ai_usage_events`** below — do not conflate the two
  (see [14 §14.3](./14-ai-provider-and-usage-system.md)).

---

## 4.8b AI provider key pool, routing & usage ledger  (platform-managed — see [14](./14-ai-provider-and-usage-system.md))

> These tables run the **legitimate** free-first provider system: a Master-Admin-owned pool of
> approved accounts/keys, a model router, and a metered usage ledger. **Not** key-rotation to
> bypass provider limits. Provider accounts & keys are **never** tenant-owned or exposed to any
> org role.

### ai_provider_accounts  *(platform)*
`id uuid PK · provider text · account_name · account_type enum(free_tier,paid,byok,self_hosted) · billing_owner · status enum(active,limited,disabled) · monthly_budget numeric(12,2) · monthly_usage numeric(12,2) · rate_limit_rpm int · rate_limit_tpm int · notes · created_at/updated_at`

### ai_api_keys  *(platform — encrypted, never returned)*
`id uuid PK · provider_account_id FK · provider · key_name · encrypted_api_key bytea · status enum(active,limited,cooldown,exhausted,failed,revoked) · environment · allowed_task_types text[] · daily_request_limit int · monthly_token_limit bigint · monthly_cost_limit numeric(12,2) · requests_used_today int · tokens_used_month bigint · cost_used_month numeric(12,2) · last_used_at · last_error · cooldown_until · created_by · created_at/updated_at · revoked_at`
- Index (provider_account_id, status), (status, cooldown_until).

### ai_task_routes  *(platform — which model serves which process)*
`id uuid PK · task_type text · primary_provider · primary_model · fallback_provider · fallback_model · fallback_2_provider · fallback_2_model · requires_json_schema bool · requires_embedding bool · max_input_tokens int · max_output_tokens int · temperature numeric(3,2) · is_active bool · created_at/updated_at`
- **task_type:** `opportunity_analyzer`, `action_planner`, `company_research`, `sales_message`,
  `follow_up_message`, `conversation_summary`, `proposal_generator`, `meeting_prep`, `next_action`,
  `embedding`, `learning_summary`. Unique(task_type) WHERE is_active.

### ai_model_catalog  *(platform)*
`id uuid PK · provider · model · display_name · context_window int · max_output int · supports_json bool · supports_embedding bool · embedding_dims int · input_cost_per_mtok numeric(10,4) · output_cost_per_mtok numeric(10,4) · is_free_tier bool · is_active bool · created_at/updated_at`

### ai_usage_events  *(tenant-attributed — the billing/credits ledger)*
`id uuid PK · organization_id FK · user_id FK · provider · model · task_type · ai_request_id FK · api_key_id FK · provider_account_id FK · input_tokens int · output_tokens int · total_tokens int · estimated_cost numeric(12,6) · is_free_tier bool · status · created_at`
- Indexes: (organization_id, created_at), (organization_id, user_id, created_at),
  (api_key_id, created_at), (provider, model, created_at), (task_type, created_at).
- *Why:* answers every usage question (which company/user/model/task/provider/key) and feeds
  quotas, credits, invoices, dashboards.

### ai_provider_health_checks  *(platform)*
`id uuid PK · provider · provider_account_id FK · api_key_id FK? · status enum(ok,degraded,down) · latency_ms int · checked_at · detail jsonb`

### ai_provider_rate_limit_events  *(platform)*
`id uuid PK · provider · provider_account_id FK · api_key_id FK? · task_type · limit_type enum(rpm,tpm,daily,monthly) · occurred_at · retry_after_seconds int · detail jsonb`
- *Why:* observe real rate-limit hits → drive cooldowns + routing; respect provider limits, don't evade them.

---

## 4.9 Jobs, notifications, integrations

### job_runs  (async work tracking — backs the Job Status API)
| col | type | notes |
|-----|------|-------|
| id uuid PK · organization_id FK | | |
| queue_name text · job_name text | | |
| entity_type text · entity_id uuid | | what it acts on |
| status **job_status**(`queued`,`running`,`completed`,`failed`,`cancelled`,`retrying`) | | |
| progress smallint (0–100) · error text · result jsonb | | |
| started_at · finished_at · created_at/updated_at | | |
- Indexes: (organization_id, status, created_at), (organization_id, entity_type, entity_id).
- *Why:* gives users/UI visibility into AI analysis, CSV import, company research, proposal
  generation, scoring/heat recompute, digest generation, extension batch processing.

### notifications
`id uuid PK · organization_id FK · user_id FK · type enum · title · body · entity_type · entity_id · priority **priority** · read_at · created_at`
- **Types:** `urgent_opportunity`, `follow_up_due`, `follow_up_overdue`, `opportunity_expiring`,
  `ai_analysis_done`, `csv_import_done`, `proposal_ready`, `lead_stale`, `lead_resurrection`,
  `weekly_insight`, `monthly_ai_usage_warning`.
- Index (organization_id, user_id, read_at, created_at).

### notification_preferences
`id uuid PK · organization_id FK · user_id FK · channel enum(in_app,email) · event_type text · enabled bool · created_at/updated_at`
- Unique(organization_id, user_id, channel, event_type). *Why:* per-user, per-channel opt-in/out.

### integration_accounts
| col | type | notes |
|-----|------|-------|
| id uuid PK · organization_id FK | | |
| provider text · type enum(ai_provider,email,calendar,storage,webhook,extension) | | |
| status enum(connected,disconnected,error) | | |
| encrypted_credentials bytea/jsonb · settings jsonb | | KMS/pgcrypto encrypted |
| connected_by uuid · connected_at · last_checked_at · created_at/updated_at | | |
- *Why:* one model for every external connection (AI keys, email, calendar, storage, webhooks, extension).

### extension_tokens
| col | type | notes |
|-----|------|-------|
| id uuid PK · organization_id FK · user_id FK | | |
| name text · token_hash text | | store hash only |
| scopes text[] | | `discovery.capture`, `discovery.read_own_batches` |
| last_used_at · expires_at · revoked_at · created_at | | |
- Index (organization_id, user_id), unique(token_hash). *Why:* scoped, revocable capture
  tokens for the human-assisted extension — never the full session JWT.

---

## 4.10 Attachments, activities, notes, audit

### attachments
`id uuid PK · organization_id FK · entity_type text · entity_id uuid · file_name · file_type · mime_type · size_bytes bigint · storage_url text · uploaded_by uuid (created_by) · created_at · deleted_at`
- *Why:* polymorphic file storage (proposals, raw snapshots, CSVs, lead docs) in object store.

### activities  (M13 — polymorphic domain timeline)
`id uuid PK · organization_id FK · entity_type text · entity_id uuid · actor_id uuid? · verb text · meta jsonb · created_at`
- Index (organization_id, entity_type, entity_id, created_at).

### notes  (M13)
`id uuid PK · organization_id FK · entity_type text · entity_id uuid · author_id uuid (created_by) · body text · is_ai_generated bool · created_at/updated_at/deleted_at`

### audit_log  (M13 — append-only, security)
`id bigserial PK · organization_id uuid · actor_id uuid · action text · entity_type · entity_id uuid · before jsonb · after jsonb · ip inet · created_at`
- No updates/deletes. Index (organization_id, created_at), (entity_type, entity_id).

---

## 4.11 Billing & usage

### plans  (global catalog)
`id uuid PK · name · slug · price_monthly numeric(10,2) · price_yearly numeric(10,2) · limits jsonb · features jsonb · is_active bool · created_at/updated_at`
- *Why:* defines tiers, their limits and feature flags. Not tenant-owned (shared catalog).

### subscriptions
`id uuid PK · organization_id FK · plan_id FK · status enum(trialing,active,past_due,canceled) · billing_provider text · provider_subscription_id text · current_period_start · current_period_end · cancel_at · created_at/updated_at`
- Unique(organization_id) active. *Why:* the org's current plan + billing-provider linkage.

### usage_limits  (generic per-period, per-metric meter)
`id uuid PK · organization_id FK · metric text · used numeric · limit numeric · period_start · period_end · created_at/updated_at`
- **Metrics:** `ai_tokens`, `ai_cost_usd`, `ai_requests`, `discovery_items`, `opportunity_analysis`,
  `company_research`, `proposal_generations`, `extension_batches`, `team_seats`, `storage_mb`,
  `active_leads`.
- Index (organization_id, metric, period_start). *Why:* enforce plan limits + show usage.

### company_usage_limits  (AI-specific roll-up enforced by the router)
`id uuid PK · organization_id FK · period text · ai_requests_limit int · ai_tokens_limit bigint · ai_cost_limit numeric(12,2) · opportunity_analysis_limit int · proposal_generation_limit int · company_research_limit int · embedding_limit int · used_requests int · used_tokens bigint · used_cost numeric(12,2) · reset_at · created_at/updated_at`
- *Why:* the AI router (see [14 §14.6](./14-ai-provider-and-usage-system.md)) checks this before
  every call; soft-degrade + `monthly_ai_usage_warning` at thresholds.

### usage_credit_grants  (manual / promotional credits, additive to plan limits)
`id uuid PK · organization_id FK · granted_by uuid · metric text · amount numeric · reason text · expires_at · created_at`
- *Why:* Master Admin or promos grant credits on top of plan limits.

### billing_events  (append-only)
`id bigserial PK · organization_id uuid · event_type text · provider text · payload jsonb · created_at`
- *Why:* immutable record of webhook/billing-provider events for reconciliation & audit.

---

## 4.12 Indexing & performance summary

- **Hot paths:** Inbox (`discoveries` by status+score), Action Center (`opportunities` by
  heat/score; `tasks`/`leads` by due date), Jobs panel (`job_runs` by status) — all covered.
- **Similarity:** ivfflat on `discoveries.embedding`, `knowledge_events.embedding`.
- **Dedup:** `pg_trgm` GIN on names + unique `dedup_hash`.
- **Graph:** composite indexes on `relationship_edges` from/to.
- **Partitioning (later):** `ai_requests`, `activities`, `job_runs`, `discoveries`,
  `billing_events` by month.
- **Audit history:** `audit_log` + per-entity `activities`; `updated_at` triggers everywhere.

> Migrations are additive and reversible. Schema lives in `supabase/migrations/`
> (Supabase SQL — see [07-backend-architecture](./07-backend-architecture.md)). Retention &
> deletion semantics for every table are defined in
> [12-data-lifecycle-and-governance](./12-data-lifecycle-and-governance.md).
