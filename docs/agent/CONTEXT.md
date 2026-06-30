# CONTEXT.md — Architecture & Current State

> Keep this accurate. When you change the architecture, update this map in the same task.
> This is what new agents read to understand the codebase fast.

_Last updated: 2026-06-29_

---

## What this is

**Radar OIP** — an AI-powered **Opportunity Intelligence Platform** (NOT a CRM). It helps
agencies/freelancers discover, analyze, prioritize, and convert opportunities, answering
"what should I do next that has the highest chance of generating revenue?"

The legacy LeadRadar (Vite + Supabase marketplace tracker) has been **deleted**; this repo is
now the greenfield Radar OIP build ([[D-003]], [[D-005]]). Full design: `docs/architecture/`.

**Auth & data = full Supabase** ([[D-006]]): Supabase Auth + Supabase Postgres + RLS, with a
**thin** NestJS service for jobs/AI/webhooks. No Prisma; no custom JWT. See
`docs/architecture/13-supabase-integration.md` (overrides auth/data sections of docs 02/05/07/09).

## ⚠️ Architecture changes since this doc's prose was written (read first)

Two structural shifts post-date most of the essay below; the older paragraphs lag (tracked as
**T-007**). The code is the source of truth ([[D-006]]):

- **Web = Vite + React Router, not Next.js** ([[D-037]]). `apps/web` is a 100% client-rendered SPA
  (`createBrowserRouter`, `react-router` `Link`/`useNavigate`, `import.meta.env.VITE_*`, Tailwind v4
  via `@tailwindcss/vite`). Ignore "Next.js App Router / `next/*` / prerender" wording below.
- **No Redis / BullMQ / standalone worker** (P1-08-FIX). `apps/worker` was removed; its processors
  moved into the API's `WorkerModule` (`apps/api/src/modules/worker/`) running single-process, and
  the queue is now Postgres-backed via `SupabaseQueueService` (`apps/api/src/queue/`,
  migrations `0031`/`0032`) with `startPolling(queue, handler)`. Ignore "BullMQ / Redis token
  buckets / standalone worker" wording below (`AiRateLimitService` is now an in-memory bucket).

## Current state — **Phases 1–6 shipped; Phase 10 (Lead Hunting Research Pipeline) is through P10-11; v3 Admin/role system shipped**

Phase 5 has started on top of the completed Opportunity Management phase. **P5-01 (Lead Pipeline)**
shipped `supabase/migrations/0034_leads.sql`: the `lead_stage` enum + `leads` table (opportunity/
company/contact provenance, RLS by `leads.read`/`leads.write`, one-live-lead-per-opportunity), the
atomic `promote_opportunity_to_lead` RPC (carries the opportunity signals onto a fresh lead + flips
the opportunity to `promoted_to_lead`) and `close_lead` (won/lost + reason), read/written through
`apps/web/src/lib/leads.ts` ([[D-038]]). **P5-02 (Follow-Up Intelligence)** shipped
`supabase/migrations/0035_tasks.sql`: the `task_status` enum + lead-scoped `tasks` table (RLS by
`tasks.manage`/`tasks.manage_own`) and the M10 invariant "no active lead without an open task",
enforced in Postgres ([[D-039]]) — the `ensure_lead_follow_up` trigger auto-creates an initial task
on lead insert/re-activation, `complete_task`/`cancel_task` reject closing the last open task on an
active lead without an atomic follow-up, and `active_leads_missing_open_task(org)` backs the periodic
guard job (job wiring deferred — no scheduler substrate). Read/written through
`apps/web/src/lib/tasks.ts`. **P5-03/P5-04** then shipped the `/pipeline` board + lead-workspace
drawer and the `/tasks` follow-up queues UI (with a "Promote to lead" action on the opportunity
pane), and **P5-06**'s contract-test half landed. **Phase 6 (AI Sales Assistant) has started: P6-01
(Outreach & conversation model)** shipped `supabase/migrations/0039_outreach.sql` — the M11
`conversations` / `outreach_messages` / `message_templates` tables (+ outreach channel/direction/
status enums), RLS-gated on `leads.read`/`leads.write`, and the atomic `record_outreach_message`
threading RPC, read/written through `apps/web/src/lib/outreach.ts` ([[D-040]]). **P6-02 (AI Sales
Assistant)** then shipped the pure `@radar/ai` `assistant.ts` (message/follow-up/summary/meeting-prep/
next-action) + the API `SalesAssistantService` and `POST /assistant/*` endpoints (`ai.use`), which
persist drafts to `outreach_messages` and summaries to `conversations` ([[D-041]]). Beyond the core
phases, the **v3 role/admin system** also shipped
(migrations `0025`–`0030`, `0033`): the `master_admin`/`company_admin`/`sales_executive` taxonomy +
`platform_admins`, discovery capture attribution, strict platform-admin org provisioning, the
`/admin/*` Master Admin area, and role-based dashboards. **Phase 10 (Lead Hunting Research
Pipeline)** has now opened too: **P10-01 (Lead-hunting storage model + RLS)** shipped
`supabase/migrations/0065_lead_hunting_storage.sql`, adding the tenant-facing M16 tables
`lead_search_sessions`, `raw_posts`, `post_research_jobs`, `post_research_reports`,
`post_classifications`, `archived_posts`, and `field_evidence_logs` plus the `raw_post_status`,
`research_job_stage`, `lead_hunting_classification`, and `archived_post_category` enums, helper
RLS that currently reuses `discoveries.read` / `discoveries.read_own`, and the matching
`@radar/supabase` DB types ([[D-043]]). **P10-02 (LinkedIn visible-post capture v2)** then shipped
through `extension/src/parsers/linkedin.ts`, `extension/src/content/overlay.ts`, and the shared
extension capture contracts, upgrading LinkedIn capture to only emit posts that are actually visible
in the viewport, keeping review selections stable across filter tabs, and sending richer M16
session/raw-post fields (`captureMode`, `searchQuery`, `postUrl`, `postText`, owner/company/date/
engagement/media fields) while still backfilling the older discovery-shaped fields as compatibility
shims until `P10-03` replaces the intake path ([[D-044]]). **P10-03/P10-04/P10-05** then replaced
extension-batch discovery ingestion with the canonical lead-hunting intake path
(`lead_search_sessions`, canonical `raw_posts`, per-session links, dedup fingerprints, unique
`post_research_jobs`, and `research-raw-post` enqueueing) and added the new
`apps/api/src/modules/lead-hunting/` external-provider pool/router/orchestrator stack plus
`external_provider_*` schema ([[D-045]], [[D-046]]). **P10-06/P10-07/P10-08** now wire the
end-to-end post-research worker itself: `LeadHuntingResearchService` drives the
`post_research_jobs` stage machine, persists evidence-first `post_research_reports`, promotes
confident company/contact findings into canonical M7 entities, runs the new strict-JSON AI tasks
(`post_research_classifier`, `lead_quality_scorer`, `archive_classifier`) seeded in
`0069_lead_hunting_ai_tasks.sql`, and routes qualified/review/archive/reject outcomes directly into
`discoveries` + `ai_analysis` (with `raw_payload.leadHunting` provenance) or `archived_posts`
through `LeadHuntingCrmHandoffService`; operator actions now live at
`POST /lead-hunting/posts/:id/{research,classify,approve,archive,reject}` ([[D-047]], [[D-048]]).
**P10-09/P10-10/P10-11** now close the operator/governance loop too: the web app ships the
lead-hunting operator surfaces (`/lead-hunting`, review, archive, session detail, raw-post detail)
plus the Master Admin `/admin/external-providers` control plane, while the API exposes governed
lead-hunting read/settings/usage endpoints and audited external-provider account/key/route
management. Lead-hunting access now uses dedicated `lead_hunting.*` permissions instead of
borrowing `discoveries.read`, org controls live under `organizations.settings.leadHunting`, queued
research enforces the configured research/budget limits server-side, and approval can require
evidence before a post moves into the CRM ([[D-049]]). **P10-13** extends that same seam into the
full External Provider Free-Tier & Cost Intelligence system: configurable plan profiles, pooled
approved-capacity routing, reservation/settlement-backed usage metering, snapshots/forecasting,
alert + notification fan-out, provider key tests, and worker-driven reset/reconciliation loops,
all still behind the single `ExternalProviderOrchestrator` boundary.

The historical Phase 1–4 detail below remains accurate for those phases (modulo the two
architecture notes above):

## Current state — **Phase 2 is complete; Phase 3 AI foundation is now underway** _(historical)_

`pnpm -r typecheck` passes across the full workspace, API tests are green, the web app builds,
and the extension package builds to `extension/dist`. Phase 2 shipped the versioned Company Brain
data layer + UI, the Discovery Inbox data layer + UI, manual + CSV ingestion, the capture UI
(`/capture`), the scoped extension token/data path (`/extension/*`, `/ingest/extension`,
`process-extension-batch`), the installable Chrome MV3 extension, and the in-app extension
settings surface (`/settings/extension`). Phase 3 now also ships the provider-agnostic AI gateway,
live Gemini/Groq/OpenRouter/Ollama adapters, and the first provider-key-pool foundation
(`ai_provider_accounts`, encrypted `ai_api_keys`, model catalog, health/rate-limit telemetry, and
an API-side pool selector that feeds `@radar/ai` per call). Phase 3 also now ships DB-backed
task routing via `ai_task_routes`, seeded free-first defaults, and an API-side route loader that
overrides the in-code defaults at `AIService` construction time. The live AI path is now also
quota-aware and usage-audited: `ai_requests` + `ai_usage_events`, company usage limits/credits,
company/key/account counter updates, and `/usage/*` reporting are shipped through
`AiUsageService` and the new usage module. The remaining P3-04 governance gaps are also closed:
the API now enforces Redis-backed per-org request buckets and provider-account RPM buckets through
`AiRateLimitService`, and provider HTTP 429s are persisted as `ai_provider_rate_limit_events` while
the affected pooled key is placed on cooldown automatically. The scoring baseline is now in place too:
`scoring_strategies` ships as an org-scoped heuristic table with seeded defaults, `@radar/ai`
exports the deterministic weighted scorer, and the API resolves or lazily creates the active org
strategy through `ScoringStrategyService`. Prompt versioning (`P3-03`) now ships too:
`ai_prompt_versions` (system defaults + org custom, one-active-per-scope, create/activate RPCs,
RLS) plus a `@radar/ai` `resolvePrompt` seam so the gateway resolves the active version
(org-custom over system default via `AiPromptService`) and stamps `ai_prompt_version_id` onto every
`ai_request`. The Opportunity Analyzer (`P3-06`) now also ships: `0015_ai_analysis.sql` plus the
pure `@radar/ai` analyzer (bad-lead rules + AI signal extraction + deterministic P3-05 scoring) and
`OpportunityAnalyzerService`, which writes a validated, explainable `ai_analysis` row per discovery.
The Action Planner (`P3-08`) now ships too: `0018_ai_action_plans.sql`, the pure `@radar/ai`
planner (AI-drafted action/task wording with deterministic priority + due-date resolution), and the
API-side `ActionPlannerService`, which writes re-runnable `ai_action_plans` rows tied to the exact
analysis they were planned from. The async pipeline now calls the planner after a successful
analysis write on a best-effort basis, so planner failures are logged without reverting the
discovery out of `analyzed`.
The async analysis pipeline (`P3-07`) is also live: the `analyze-discovery` / `generate-embedding`
BullMQ consumers are **hosted in the API process** (`AiPipelineModule`, see [[D-025]]) since the
standalone worker can't cross-import the Nest AI services; `DiscoveryPipelineService` owns the
`new→processing→analyzed` transitions + `job_runs` lifecycle and chains embedding after analyze, and
the standalone worker auto-enqueues `analyze-discovery` for newly ingested discoveries. The Inbox
AI UI (`P3-09`) now ships too: the web inbox reads the latest `ai_analysis`, `ai_action_plans`,
and `job_runs` heads per discovery under RLS, shows the analyzer/planner signal in the list/detail
panes, and re-runs analysis through `POST /discoveries/:id/analyze` with client-side job polling.
The AI settings UI (`P3-10`) now ships too: `/settings/ai` exposes workspace prompt-version
management (`ai_prompt_versions` via Supabase RLS/RPC), permission-scoped usage/limit/event
reporting through `/usage/*`, and now also the org BYOK/privacy-mode controls from `T-009`.
Tenant AI providers are stored in `integration_accounts`, the thin API exposes `/ai/providers`
and `/ai/privacy-mode`, and `AiProviderPoolService` now applies the org runtime policy live for
`paid_only`, `byok_only`, and `disabled` ([[D-031]]). Platform pooled accounts and base task
routes still remain platform-managed. `redact_pii_before_ai` is persisted as the default privacy
mode, but dedicated PII redaction behavior is still a separate follow-up. The AI QA pass (`P3-11`) now ships too:
`packages/ai` carries checked-in analyzer/planner golden fixtures driven by `FakeProvider`,
structured-output repair is covered end-to-end through the API writer specs (including persisted
prompt-version stamping after a repair pass), and `AiPipelineWorker` now has explicit
`job_runs` retrying/failed lifecycle coverage ([[D-030]]). **Phase 3 is complete; Phase 4
(Opportunity Management) has started.** The Opportunity Engine (`P4-01`) ships
`0020_opportunities.sql`: the `opportunities` table + `opportunity_status` enum + RLS, and the
atomic `convert_discovery_to_opportunity` RPC (org `scoreThreshold` + approval gate, snapshots the
latest analysis/action-plan, basic heat score, flips the discovery to `converted`). Reads/edits +
conversion go through the web data layer `apps/web/src/lib/opportunities.ts` ([[D-032]]). The
company/contact graph (`P4-02`) also ships: `0021_companies_contacts.sql` adds `companies`/`contacts`
with dedup-aware `upsert_*` + `merge_*` RPCs and wires the opportunity provenance FKs, read through
`apps/web/src/lib/companies.ts` ([[D-033]]). The relationship graph (`P4-03`) ships too:
`0022_relationship_edges.sql` adds the polymorphic, weighted `relationship_edges` table with the
`upsert_relationship_edge`/`delete_relationship_edge` RPCs (in-RPC endpoint validation, no FKs —
[[D-034]]), read through `apps/web/src/lib/relationships.ts`. The Opportunities UI (`P4-06`) ships
the operator surfaces on top of these: `app/(app)/opportunities/page.tsx` (ranked list/detail +
status actions) and `app/(app)/companies/page.tsx` (companies list + per-company contacts and
relationship-edge graph view), both nav-wired. The Daily Action Center (`P4-05`) is live too: `/`
(`app/(app)/page.tsx`) now renders high-value + urgent opportunity action cards from the
`getActionCenter` read model in `lib/opportunities.ts`; its follow-up/task lane stays deferred until
the Phase 5 tasks model lands. The Company Research agent (`P4-04`) ships too: the pure
`@radar/ai` researcher (`researcher.ts`) + the API writer `company-research.service.ts` enrich a
company into `companies.enrichment` (model/prompt provenance, back-fill-only of `industry`/
`tech_stack` — [[D-035]]) via the `research-company` job in `DiscoveryPipelineService`/
`AiPipelineWorker`, triggered by `POST /companies/:id/research`. The activities/notes/attachments
backend (`P4-07`) ships too: `0023_activities_notes_attachments.sql` adds the append-only
`activities` timeline (auto-logged on opportunity create/status-change), editable `notes`, and
`attachments` metadata — polymorphic via the reused `relationship_node_type`, written through
`log_activity`/`add_note`/`record_attachment` RPCs ([[D-036]]), read through
`apps/web/src/lib/timeline.ts`. The timeline + notes UI ships via the reusable
`apps/web/src/components/entity-timeline.tsx` on the opportunity detail pane. Remaining Phase 4:
attachment upload (`P4-07-ATT`) and the company-pane timeline (`P4-07-COMPANY`). The Phase 4 QA
(`P4-08`) ships the contract-validation seam: jest/ts-jest now runs in `packages/contracts` with
`src/dto.spec.ts` covering the opportunity/company/contact/edge/note/attachment DTOs; the SQL
RPC-behavior tests need a live Postgres/pgTAP (`P4-08-DB`). Phase 5 (Lead Pipeline) is the next major
track.
Local live DB/application verification still needs the user's real Supabase project and
Docker-backed infra (see root `README.md`).

## Monorepo map

```
apps/
  api/        Thin NestJS — Supabase-JWT auth guard, jobs (job_runs), ingestion, AI services,
              usage reporting, admin, health, the lead-hunting research/provider/governance module,
              + the in-process WorkerModule and AI pipeline consumers. Queue = Postgres via
              SupabaseQueueService (no Redis/BullMQ; P1-08-FIX).
  web/        Vite + React Router SPA ([[D-037]]) — Supabase auth + RBAC-aware shell + Action
              Center + Inbox + Opportunities + Companies + Leads/Tasks data layers + the tabbed
              `/settings` workspace (AI, company brain, extension, templates, integrations,
              billing, roles, audit, security, notifications) + Lead Hunting + the /admin Master
              Admin area
  (worker/    removed in P1-08-FIX — processors now live in apps/api/src/modules/worker/)
extension/    Chrome MV3 capture — buildable workspace package (popup, options, parsers, overlay,
              background delivery + retry)
packages/
  contracts/  enums, zod DTOs, RBAC permission catalog + system-role grants
  core/        config (zod), errors (RFC-7807), tenant context (ALS), crypto
  supabase/    Supabase client factory (service + user) + DB types
  ai/          AI gateway, live provider adapters, model router, deterministic scoring, and the
               lead-hunting strict-JSON classifier/scorer helpers
supabase/
  migrations/  0001 schema · 0002 functions · 0003 RLS policies · 0004 seed ·
               0005 discovery (discovery_batches, discoveries + read RLS) ·
               0006 discovery inbox (discoveries.write UPDATE policy) ·
               0007 company brain (versioned company_profiles + create RPC + read RLS) ·
               0008 ingestion helpers (dedup RPC for manual/CSV/extension intake) ·
               0009 extension tokens · 0010 AI provider pool · 0011 AI task routes ·
               0012 AI usage ledger + quotas · 0013 scoring strategies ·
               0014 AI prompt versions (system + org custom + create/activate RPCs) ·
               0015 AI analysis (Opportunity Analyzer `ai_analysis` writer) ·
               0016 discovery embedding ivfflat index (analysis pipeline) ·
               0017 AI rate limits (org override + Redis-backed throttling seam) ·
               0018 AI action plans (`ai_action_plans` planner writer) ·
               0019 tenant AI settings (`integration_accounts` + privacy-mode backfill) ·
               0020 opportunities (Opportunity Engine table + convert RPC) ·
               0021 companies + contacts (M7 entity layer + upsert/merge RPCs + opportunity FKs) ·
               0022 relationship_edges (M7 polymorphic weighted graph + upsert/delete RPCs) ·
               0023 activities + notes + attachments (M13 timeline + log_activity/add_note/record_attachment RPCs + opportunity triggers) ·
               0024 attachments storage bucket + RLS · 0025 v3 roles + platform_admins ·
               0026 v3 discovery attribution · 0027/0028 seed/elevate platform admins ·
               0029/0030/0033 create_organization fixes + strict platform-admin provisioning ·
               0031 job-queue enhancements (atomic polling) · 0032 Postgres idempotency keys ·
               0034 leads (Lead Pipeline: leads table + promote/close RPCs — P5-01) ·
               0035 tasks (Follow-Up Intelligence: tasks table + invariant trigger/guard RPCs + checker — P5-02) ·
               0036 sales-exec permission broadening · 0037/0038 jina provider + config ·
               0039 outreach (M11: conversations + outreach_messages + message_templates + record_outreach_message RPC — P6-01) ·
               0065 lead hunting storage (M16: sessions/raw-posts/jobs/reports/classifications/archive/evidence + read RLS — P10-01) ·
               0066/0067/0068 lead-hunting capture + external-provider ingestion/routing foundations ·
               0069 lead-hunting AI task catalog (classifier/archive/scorer prompts + routes) ·
               0070 lead-hunting governance (permissions, read-policy rebinding, audited provider controls)
```

## Web UI system (Ant Design 6, dark)

The web app uses **Ant Design 6** as its only UI system on a **dark, token-driven** theme
([[D-011]], [[D-014]]). The shipped palette is now an emerald/charcoal Radar OIP direction rather
than the earlier blue mission-control look; fonts = Inter (UI) /
Space Grotesk (display) / JetBrains Mono (code) loaded via Google Fonts `<link>` + CSS vars (the
`next/font` setup was dropped with the Vite migration — [[D-037]]). Source of truth:
**`docs/DESIGN.md`** (visual) + **`docs/UIUX.md`** (experience rules). Key files:
`apps/web/src/theme/tokens.ts` (theme tokens), `src/components/providers.tsx` (ConfigProvider +
App + Auth; no more AntdRegistry), `src/components/{app-shell,auth-frame,page-header}.tsx`, and the
shared primitive layer in `src/components/ui/`. Every page (auth, Action Center, Capture, Inbox,
Jobs, Company Brain, Extension settings) is AntD with no native form controls.
The **next** frontend design direction is documented separately in
`docs/architecture/13-design-system.md`; it is a target-state spec, not the shipped implementation.

## Stack & conventions

- **Backend = CommonJS** (NestJS); relative imports are extensionless. Shared packages must
  be **built to `dist`** for apps to resolve them ([[D-004]]).
- **Auth + data = Supabase**: Supabase Auth, Supabase Postgres, SQL migrations in
  `supabase/migrations/`, and RLS-first tenant isolation ([[D-006]]).
- PostgreSQL 16 + pgvector/citext/pg_trgm/pgcrypto · Postgres-backed job queue (no Redis/BullMQ;
  `SupabaseQueueService` + the in-process `WorkerModule`, P1-08-FIX).
- **web = Vite + React Router + Ant Design 6** ([[D-037]]); the browser uses `supabase-js` directly
  for RLS-backed reads/writes plus thin-API helpers where needed.
- Multi-tenant: business rows use `organization_id`, tenant reads are enforced by RLS
  (`is_member`, `has_permission`), and the API/worker use the service-role key so they must still
  check authz explicitly in code.

## Key files

- `packages/contracts/src/{enums,permissions,dto,lead-hunting}.ts` — the cross-app contract.
- `packages/supabase/src/database.types.ts` — generated/shared Supabase DB types used across API,
  web, and worker packages.
- `packages/ai/src/{service,routes,router,scoring}.ts` — AI gateway core, free-first routes,
  model router, deterministic heuristic scoring, the Opportunity Analyzer (`analyzer.ts`), the
  Action Planner (`planner.ts`), the Company Researcher (`researcher.ts`), and the Sales Assistant
  (`assistant.ts` = P6-02 message/follow-up/summary/meeting-prep/next-action), plus the
  lead-hunting classifier/archive/scorer helpers in `lead-hunting.ts`. The API writers live in
  `apps/api/src/modules/ai/*.service.ts` (incl. `sales-assistant.service.ts` + `/assistant/*`).
- `apps/api/src/modules/lead-hunting/` — external-provider pool/router/orchestrator/admin
  services plus the cost-intelligence layer (`external-provider-intelligence.service.ts`,
  plan/cache/capacity/cost helpers, generic provider adapters, reset/reconciliation worker hooks),
  the `LeadHuntingResearchService` stage machine, `LeadHuntingClassificationService`,
  `LeadHuntingCrmHandoffService`, `LeadHuntingOperationsService`, and `LeadHuntingController`
  (`/lead-hunting/*`, `/admin/external/*`).
- `apps/web/src/lib/{api,auth,company-brain,discoveries,ingestion,opportunities,companies,relationships,timeline,leads,tasks}.ts` — web data layers for thin
  API calls plus Supabase/RLS-backed reads and writes (`opportunities.ts` = P4-01 engine + convert RPC; `companies.ts` = P4-02 entity layer + upsert/merge RPCs; `relationships.ts` = P4-03 graph edges + upsert/delete RPCs; `leads.ts` = P5-01 pipeline + promote/close RPCs; `tasks.ts` = P5-02 follow-up queues + complete/cancel RPCs; `outreach.ts` = P6-01 conversations/messages/templates + record_outreach_message RPC).
- `apps/web/src/app/(app)/{capture,lead-hunting,inbox,opportunities,companies,settings/ai,settings/company-brain,settings/extension}/page.tsx` — current operator UI surfaces (`lead-hunting/*` = P10-09 queue/session/detail workflow; `opportunities` = P4-06 ranked list/detail; `companies` = P4-06 company list + relationship-edge graph view).
- `apps/web/src/components/ui/` — shared page/metric/empty/status/settings primitives used by the shipped design track.
- `apps/web/src/lib/ingestion.ts` — capture data layer (CSV preview/mapping + signed upload); `lib/api.ts` ingestion + job helpers.
- `apps/api/src/modules/ingestion/` — manual + CSV intake, signed upload creation, idempotency.
- `apps/api/src/modules/extension/` — extension token management, health, and capture-token verification.
- `apps/api/src/modules/ai/{ai-rate-limit,ai-provider-pool,ai-routing,ai-settings,ai-usage,scoring-strategy,ai-prompt,opportunity-analyzer,action-planner,company-research}.service.ts` — live AI short-window throttling, pooled+tenant key selection, task-route loading, tenant AI settings, usage/quota enforcement, active org scoring-strategy resolution, active prompt-version resolution, the Opportunity Analyzer `ai_analysis` writer, the Action Planner `ai_action_plans` writer, and the Company Research `companies.enrichment` writer (P4-04).
- `apps/api/src/modules/usage/` — `/usage/*` reporting endpoints over the usage ledger + company limits.
- `extension/src/` — MV3 popup/options/background/content/parsers implementation.
- `apps/api/src/common/guards/{jwt-auth,permission}.guard.ts` — auth + RBAC.
- `apps/api/src/modules/{auth,org,rbac,jobs,health}/` — Phase 1 modules.
- `apps/api/src/queue/supabase-queue.service.ts` + `apps/api/src/modules/worker/` (`worker.service.ts` + `processors/{demo,ingest-manual,import-csv,process-extension-batch}.processor.ts`) — the in-process Postgres-backed async pipeline (replaces the removed `apps/worker`).
- `supabase/migrations/{0010_ai_provider_pool,0011_ai_task_routes,0012_ai_usage_ledger,0013_scoring_strategies,0014_ai_prompt_versions,0015_ai_analysis,0016_discovery_embedding_index,0017_ai_rate_limits,0018_ai_action_plans,0019_ai_tenant_settings}.sql` — the Phase 3 AI data model shipped so far.
- `apps/web/src/components/app-shell.tsx` — the shared authenticated shell/navigation frame.

## Run it (local)

`pnpm install` → `cp .env.example .env` (set secrets) → `supabase login && supabase link` →
`pnpm db:push` → create the `discovery-imports` Storage bucket → `pnpm dev:api` (hosts the
in-process worker too) / `pnpm dev:web`. No Redis/Docker infra step anymore (P1-08-FIX). Details in
root `README.md`.

## Next

Phase 10 now has the storage/RLS foundation (`P10-01`) and the visible-post extension capture seam
(`P10-02`). The critical-path next work is P10-03 (capture ingestion + dedup + research enqueue),
followed by P10-04/P10-05 (external-provider pool + router/ledger) and then the P10-06 research
workers. Phase 5 · Lead
Pipeline & Follow-Up Intelligence still has follow-up work remaining too: P5-05 (stale-lead
detection + follow-up notifications) and the periodic invariant-checker job — both wait on a
scheduler substrate (none exists since the Redis/BullMQ removal) — and P5-06 (the Phase 5 QA pass).
Putting leads on the polymorphic activities/notes timeline needs a `lead` member added to the
`relationship_node_type` enum (follow-up). Note: the untracked P9-14 admin area (`app/(admin)/*`,
`components/dashboards/*`) is half-finished and recently broke the `apps/web` tsc gate twice — worth
a dedicated cleanup/QA pass.
Cross-cutting debt still open: T-006 (rotate the leaked Supabase keys — user action) and T-007
(finish reconciling the architecture docs in `docs/architecture/*` with the Supabase/Vite/
single-process reality). Roadmap: `docs/architecture/11-task-breakdown.md`; board: `docs/agent/TASKS.md`.
