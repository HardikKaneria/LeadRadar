# 11 — Task Breakdown

Ten phases. Every task uses the format below.

**Owner roles:** `[BE]` api-backend · `[FE]` web-frontend · `[EXT]` chrome-extension ·
`[AI]` ai-engine · `[INFRA]` platform-infra · `[DOCS]` documentation · `[QA]` quality-assurance.

**Complexity:** Low / Medium / High / XL  ·  **Priority:** Must-have / Should-have / Later.

Format:
> **P2-01 · Company Brain** `[BE]`
> Description: …
> Dependencies: …
> Expected output: …
> Complexity: Medium · Priority: Must-have · Module affected: M1 · Company Brain
> Status: Remaining | Partially completed | Completed
> Notes: optional shipped-scope or handoff note when the task is partially/completely done

These feed `docs/agent/TASKS.md`. Mark a phase's tasks done before moving on.

---

## Frontend design track (before a major UI rewrite)

**FD-01 · Design system foundation** `[DOCS]`
Description: define the dark-first Radar OIP design language, semantic tokens, component contracts,
layout primitives, AI visibility rules, and accessibility standards. This is a documentation/design
task, not a code task.
Dependencies: —
Expected output: approved design-system spec and token vocabulary.
Complexity: Medium · Priority: Must-have · Module affected: web foundation
Status: Completed
Notes: The target-state spec in `13-design-system.md`, the wireframes in `16-key-screen-wireframes.md`, the shared primitive implementation in `apps/web/src/components/ui/`, and the QA signoff in `17-ui-qa.md` now complete the foundation contract.

**FD-02 · Component library primitives + variants** `[FE]`
Description: implement the shared headless/shadcn-style primitives and semantic variants for buttons,
inputs, cards, tables, badges, dialogs, drawers, and navigation surfaces.
Dependencies: FD-01
Expected output: reusable component library consumed by key screens.
Complexity: High · Priority: Must-have · Module affected: web foundation
Status: Completed
Notes: The current shipped app now exposes a reusable AntD-backed primitive layer (`PageSection`, `MetricCard`, status tags, `EmptyState`, `SettingsSaveBar`) that is consumed by the key shipped screens.

**FD-03 · App shell UI refresh** `[FE]`
Description: rebuild the app shell around the new sidebar, breadcrumb topbar, page containers, global
command surfaces, and optional right-side AI/context drawer.
Dependencies: FD-01, FD-02
Expected output: production-ready shell adopted by all primary routes.
Complexity: High · Priority: Must-have · Module affected: web shell
Status: Completed
Notes: The shell refresh, shared primitive layer, and shipped route adoption are now in place for the current product surface. Optional future AI/context drawer work is no longer a blocker for the pre-rewrite design track.

**FD-04 · Key screen wireframes** `[DOCS]`
Description: define implementation-grade wireframes/specs for Daily Action Center, Discovery Inbox,
Opportunity Detail, Lead Workspace, Knowledge, and Settings.
Dependencies: FD-01
Expected output: screen-level structure and interaction guidance for frontend implementation.
Complexity: Medium · Priority: Must-have · Module affected: product design
Status: Completed
Notes: `16-key-screen-wireframes.md` now documents the structure, sectioning, and interaction rules for the primary operator screens.

**FD-05 · Accessibility + UI QA pass** `[QA]`
Description: verify contrast, focus states, keyboard flows, responsive behavior, empty/error states,
and semantic accessibility across the new shell and component library.
Dependencies: FD-02, FD-03, FD-04
Expected output: QA checklist, bug list, and signoff criteria for the rewritten UI.
Complexity: Medium · Priority: Must-have · Module affected: QA / web
Status: Completed
Notes: `17-ui-qa.md` records the shared-primitives QA pass, the fixes applied during it, and the residual risks that still require live-session validation later.

---

## Phase 1 · Foundation

**P1-01 · Monorepo & workspaces** `[INFRA]`
Description: pnpm workspace: `apps/api`, `apps/web`, `apps/worker`, `extension`,
`packages/{contracts,core,ai}`; TS project refs, ESLint/Prettier, commit hooks.
Dependencies: —
Expected output: installable monorepo with shared tooling.
Complexity: Medium · Priority: Must-have · Module affected: Platform
Status: Completed
Notes: The greenfield Radar OIP monorepo shipped and is the active workspace layout.

**P1-02 · Database & ORM bootstrap** `[BE]`
Description: Postgres 16 + `pgcrypto`/`pgvector`/`pg_trgm`; Prisma; base migration for
organizations, users, memberships; `updated_at` triggers; tenant-column conventions.
Dependencies: P1-01
Expected output: migrating DB + Prisma client.
Complexity: Medium · Priority: Must-have · Module affected: Platform / all
Status: Completed
Notes: Implemented as Supabase SQL migrations plus DB types; the original Prisma wording is now historical.

**P1-03 · Core package (tenant, config, errors, events, usage meter)** `[BE]`
Description: `TenantContext`, `BaseRepository` (org scope, soft delete, created_by),
typed config, RFC-7807 errors, in-process EventBus, Redis idempotency store, UsageMeter stub.
Dependencies: P1-01
Expected output: `packages/core` consumed by api/worker.
Complexity: High · Priority: Must-have · Module affected: core
Status: Completed
Notes: `packages/core` shipped and is consumed by the active API and worker apps.

**P1-04 · Auth (JWT + refresh)** `[BE]`
Description: register/login/refresh/logout, password hashing, `JwtAuthGuard`/`OrgGuard`,
scoped capture-token issuance primitive.
Dependencies: P1-02, P1-03
Expected output: secured auth endpoints + org guard.
Complexity: High · Priority: Must-have · Module affected: auth, org
Status: Completed
Notes: Shipped as Supabase Auth plus `SupabaseAuthGuard`; the custom JWT path in this original wording was dropped.

**P1-05 · RBAC (roles/permissions/role_permissions)** `[BE]`
Description: roles + permissions + join tables; seed system roles (owner/admin/manager/
member/viewer) and the permission catalog; `PermissionGuard` + `@RequirePermission`; cache.
Dependencies: P1-04
Expected output: permission-gated routing + role assignment on memberships.
Complexity: High · Priority: Must-have · Module affected: rbac
Status: Completed
Notes: The permission model ships through RLS helpers, seeded roles, and the shared permission catalog.

**P1-06 · Org & membership module** `[BE]`
Description: create org, invites, members, role assignment, org settings (score threshold,
business hours, follow-up defaults).
Dependencies: P1-05
Expected output: org/membership/settings API.
Complexity: Medium · Priority: Must-have · Module affected: org
Status: Completed
Notes: Workspace bootstrap ships through the `create_organization` RPC plus supabase-js membership flows.

**P1-07 · Contracts package + OpenAPI client** `[BE]` `[FE]`
Description: shared DTOs/enums (incl. canonical enums) in `packages/contracts`; generate
typed client for web + extension.
Dependencies: P1-04
Expected output: typed cross-app contracts.
Complexity: Medium · Priority: Must-have · Module affected: contracts
Status: Completed
Notes: Shared contracts shipped; the apps consume typed modules directly rather than a generated OpenAPI client.

**P1-08 · Queue & Worker + job_runs + Job Status API** `[BE]` `[INFRA]`
Description: Redis + BullMQ; Worker process sharing modules; `job_runs` table + lifecycle;
`GET /jobs`, `/jobs/:id`, `/jobs/:id/logs`, `POST /jobs/:id/cancel`; one demo idempotent job.
Dependencies: P1-03
Expected output: working async pipeline with observable jobs.
Complexity: High · Priority: Must-have · Module affected: job-runs
Status: Completed
Notes: The demo queue/job lifecycle shipped and is observable through the `/jobs` surface.

**P1-09 · Web app shell + auth + RBAC nav** `[FE]`
Description: Next.js App Router, Tailwind, shadcn/ui, auth pages, authenticated layout
(sidebar/topbar/command palette/notification bell), org guard, `RbacGate`, TanStack Query + client.
Dependencies: P1-07
Expected output: login → empty RBAC-aware shell.
Complexity: High · Priority: Must-have · Module affected: web shell
Status: Completed
Notes: The authenticated Next.js shell shipped; the current implementation is AntD-based and no longer matches the original shadcn wording here.

**P1-10 · CI/CD, observability, audit baseline** `[INFRA]`
Description: CI (lint/test/build/migrate), containerization, env/secrets, Pino logging,
OpenTelemetry, `audit_log` + `activities` plumbing.
Dependencies: P1-01
Expected output: deployable pipeline + audit baseline.
Complexity: High · Priority: Must-have · Module affected: platform-infra, audit
Status: Completed
Notes: CI/build/lint/typecheck/test and pino logging shipped; deeper telemetry can still expand later.

**P1-11 · QA: tenant isolation + RBAC + auth tests** `[QA]`
Description: integration tests proving cross-org access fails everywhere; permission keys
enforced per route; auth/refresh flows; job lifecycle test.
Dependencies: P1-05, P1-08
Expected output: green isolation/RBAC/auth/job suites in CI.
Complexity: Medium · Priority: Must-have · Module affected: QA / core
Status: Completed
Notes: The current permission-guard suite is green; broader end-to-end isolation coverage can still grow with later phases.

---

## Phase 2 · Discovery Engine

**P2-01 · Company Brain** `[BE]`
Description: versioned `company_profiles`; active-version logic; bad-lead rules schema; outreach tone.
Dependencies: P1-06
Expected output: Company Brain API with active profile versioning.
Complexity: Medium · Priority: Must-have · Module affected: M1 · Company Brain
Status: Completed
Notes: Versioned `company_profiles` plus the create-version RPC shipped; live Supabase verification still needs a local run.

**P2-02 · Company Brain UI** `[FE]`
Description: settings screen — services, priority services, industries, ICP, countries, min
budget, bad-lead rules, outreach tone; version history.
Dependencies: P2-01, P1-09
Expected output: editable Company Brain page.
Complexity: Medium · Priority: Must-have · Module affected: M1
Status: Completed
Notes: The Company Brain UI shipped against the RPC/history data layer; authenticated live-path smoke is still pending locally.

**P2-03 · Discovery storage model** `[BE]`
Description: `discovery_batches`, `discoveries` (raw_payload, hints, dedup_hash, embedding
column, full `discovery_source` enum), indexes.
Dependencies: P1-02
Expected output: discovery tables + migrations.
Complexity: Medium · Priority: Must-have · Module affected: M2 · Discovery
Status: Completed
Notes: Discovery tables, enums, indexes, and read RLS shipped; applying them to a live DB remains a local follow-up.

**P2-04 · Ingestion service (manual + CSV)** `[BE]`
Description: manual entry endpoint; CSV upload (presigned → object store) + `import-csv` job
(tracked in job_runs); validation, normalization, idempotency, fuzzy dedup (`pg_trgm`).
Dependencies: P2-03, P1-08
Expected output: `/ingest/manual`, `/ingest/csv` with job tracking.
Complexity: High · Priority: Must-have · Module affected: M2
Status: Completed
Notes: `/ingest/manual` and `/ingest/csv` plus the worker dedup/import path shipped; the signed-upload flow still needs local end-to-end verification.

**P2-05 · Extension ingestion endpoint + tokens** `[BE]`
Description: `extension_tokens` (hashed, scoped); `/ingest/extension` (scoped token, batch,
idempotency) → batch + discoveries; `process-extension-batch` job.
Dependencies: P2-03, P1-05
Expected output: extension intake API + token management.
Complexity: Medium · Priority: Must-have · Module affected: M2, integration
Status: Completed
Notes: Scoped extension tokens, `/extension/tokens`, `/extension/health`, public `/ingest/extension`, and worker-side `process-extension-batch` now ship through the thin API + worker path.

**P2-06 · Discovery Inbox API** `[BE]`
Description: list with filters (source/date/country/service/score), detail, status
transitions, bulk ops.
Dependencies: P2-03
Expected output: inbox API.
Complexity: Medium · Priority: Must-have · Module affected: M3 · Inbox
Status: Completed
Notes: The Discovery Inbox data layer shipped through Supabase/RLS; live DB verification is still pending locally.

**P2-07 · Discovery Inbox UI** `[FE]`
Description: email-style inbox — filters (full source enum), score-sorted list, detail
preview, bulk approve/ignore.
Dependencies: P2-06, P1-09
Expected output: working Inbox.
Complexity: High · Priority: Must-have · Module affected: M3
Status: Completed
Notes: The triage UI shipped and was browser-smoked unauthenticated; full authenticated data-path smoke still needs a local session.

**P2-08 · Manual entry + CSV import UI** `[FE]`
Description: capture screen — manual form (title/description/company/contact/email/phone/
website/country/budget/source/notes) + CSV uploader with mapping preview + job progress.
Dependencies: P2-04, P1-09
Expected output: manual/CSV capture UI.
Complexity: Medium · Priority: Must-have · Module affected: M2
Status: Completed
Notes: Manual and CSV capture flows shipped with job polling; real upload/worker completion still needs local end-to-end verification.

**P2-09 · Chrome MV3 extension — capture** `[EXT]`
Description: manifest (activeTab + per-site hosts), popup ("Capture Current Results"),
on-demand content script, parsers (linkedin/upwork/freelancer/generic, visible-only),
confirm overlay.
Dependencies: P2-05, P1-07
Expected output: installable extension capturing visible results.
Complexity: XL · Priority: Must-have · Module affected: Extension
Status: Completed
Notes: The `extension/` workspace package now builds to a loadable MV3 artifact with popup, options, review overlay, on-demand visible-only capture, and supported-site parsers plus generic fallback.

**P2-10 · Extension auth + resilience** `[EXT]`
Description: scoped-token login, offline queue + retry, idempotency keys, parser versioning,
revoke flow, last-batch status reporting.
Dependencies: P2-09
Expected output: robust extension delivery.
Complexity: Medium · Priority: Should-have · Module affected: Extension
Status: Completed
Notes: The extension stores the scoped token locally, retries failed sends from `chrome.storage`, stamps parser versions and idempotency keys on every batch, and reports recent send state in the popup.

**P2-11 · Extension settings page** `[FE]`
Description: `/settings/extension` — generate/revoke scoped token, status, last batches,
parser-version health.
Dependencies: P2-05, P1-09
Expected output: extension settings UI.
Complexity: Low · Priority: Should-have · Module affected: integration
Status: Completed
Notes: `/settings/extension` ships in the web app and manages one-time token creation, revocation, recent extension batches, and parser health through the new thin-API endpoints.

**P2-12 · QA: ingestion, CSV, extension parser/visible-only** `[QA]`
Description: CSV mapping/dedup/malformed tests; per-site parser tests vs. DOM snapshots;
visible-only capture guarantee; idempotency/dedup tests.
Dependencies: P2-04, P2-09
Expected output: green discovery suites.
Complexity: Medium · Priority: Must-have · Module affected: QA / M2, Extension
Status: Completed
Notes: `import-csv.processor.spec.ts` — 46 Jest tests: parseCsv RFC-4180 edge cases,
buildCsvRecords header normalisation + headerless mode, normalizeCsvRecord alias mapping +
dedup hash + field normalisation + skip-on-no-identifier, normalizeExtensionItem visible-only
capture + metadata, normalizeManualEntry, counter correctness, processCsvImport integration
(happy path, empty, malformed rows, duplicate handling, enqueue guard).

---

## Phase 3 · AI Intelligence

**P3-01 · AI Gateway core** `[AI]`
Description: single entry point `AIService.generate(taskType, input, organizationId, userId)`
(+ `generateStructured`/`embed`); **free-first** model router (task → plan/limit → privacy →
health → key → rate/cost → fallback), retries, circuit breaker. No domain module calls a provider
SDK directly. See [14](./14-ai-provider-and-usage-system.md).
Dependencies: P1-03
Expected output: `packages/ai` gateway with task-typed routing.
Complexity: High · Priority: Must-have · Module affected: M4 · AI Gateway / M15
Status: Completed
Notes: `packages/ai` now ships the provider-agnostic gateway (`AIService`), in-code free-first
routes, the `ModelRouter` fallback/circuit-breaker flow, structured-output repair, embeddings, and
the hook seams consumed by later routing/usage tasks. Live provider adapters and DB-backed config
landed as follow-on tasks rather than altering this core contract.

**P3-02 · Provider adapters** `[AI]`
Description: Gemini, Groq, OpenRouter, Ollama, OpenAI-compatible adapters + capability reporting.
Free-first; **do not default to Claude**. Adapters are stateless — keys come from the platform key
pool (P3-12), not hard-coded.
Dependencies: P3-01
Expected output: swappable providers.
Complexity: High · Priority: Must-have · Module affected: M4, M15
Status: Completed
Notes: `packages/ai/src/providers/` now includes the live Gemini/Groq/OpenRouter/Ollama adapters,
shared HTTP helpers, and `buildLiveProviders(...)` so the backend can assemble a free-first live
provider set from pooled or env-resolved credentials. Live smoke testing still requires real
provider keys in the target Supabase project.

**P3-03 · Prompt versioning (`ai_prompt_versions`)** `[AI]`
Description: table + CRUD/activation; system defaults (org_id null) + org custom; gateway
resolves active version, stamps `ai_prompt_version_id` on every call.
Dependencies: P3-01
Expected output: auditable, versioned prompts.
Complexity: Medium · Priority: Must-have · Module affected: M4
Status: Completed
Notes: `0014_ai_prompt_versions.sql` ships the versioned table (system defaults + org custom,
one-active-per-scope, stable per-scope version numbers), RLS (`ai.settings.manage` for org rows;
system rows service-role only), `create_ai_prompt_version` / `activate_ai_prompt_version` RPCs,
the deferred `ai_requests.ai_prompt_version_id` FK, and a seeded system default for all 11 agents.
`@radar/ai` gained the `resolvePrompt` seam (`AIServiceOptions.resolvePrompt` →
`AiCallRecord.aiPromptVersionId`), and `apps/api/.../ai-prompt.service.ts` resolves the active
version (org-custom over system) and is injected at `AIService` construction so every call stamps
a version into `ai_requests`. Full not-null hardening stays deferred until every path always
resolves a version. See [[D-023]].

**P3-04 · Cost tracking, rate limits, usage metering** `[AI]`
Description: `ai_requests` recording; Redis token buckets (per org/provider); monthly spend
caps; structured-output validation + repair; meter ai_tokens/ai_cost_usd into usage_limits.
Dependencies: P3-01, P3-03
Expected output: governed, auditable AI calls.
Complexity: High · Priority: Must-have · Module affected: M4, billing
Status: Completed
Notes: `0012_ai_usage_ledger.sql` ships the durable ledger/quotas (`ai_requests`,
`ai_usage_events`, `company_usage_limits`, `usage_credit_grants`), and `0017_ai_rate_limits.sql`
adds the optional org-scoped `request_rate_limit_rpm` override. `AiUsageService` now enforces
request/token/cost/task quotas, persists `/usage/*` reporting, and logs provider 429s into
`ai_provider_rate_limit_events` while cooling the affected pooled key. `AiRateLimitService`
provides the Redis token buckets for the org request bucket and provider-account RPM bucket, and
`@radar/ai` surfaces provider HTTP status / Retry-After metadata so the API layer can back off
specific keys without coupling Redis/Supabase into the core package. Monthly spend caps are now
covered by `company_usage_limits.ai_cost_limit` plus the existing key/account budget gates. See
[[D-026]].

**P3-05 · Scoring strategy v1 (heuristic)** `[AI]`
Description: `ScoringStrategy` interface + weighted heuristic (service/priority/country/
budget/intent/urgency) using `scoring_strategies.weights`; explainable.
Dependencies: P1-02
Expected output: deterministic scoring.
Complexity: Medium · Priority: Must-have · Module affected: M12 (scoring)
Status: Completed
Notes: `0013_scoring_strategies.sql` now creates the org-scoped `scoring_strategies` table with
seeded heuristic defaults and RLS. `packages/ai/src/scoring.ts` exports the pure weighted scorer
and explainable factor breakdowns, while `apps/api/src/modules/ai/scoring-strategy.service.ts`
loads or lazily creates the active org strategy so P3-06 can consume a stable scoring seam.

**P3-06 · Opportunity Analyzer agent** `[AI]`
Description: input = discovery + Company Brain + scoring strategy → validated analysis
(score, intent, service_match, budget, urgency, confidence, action, reason); bad-lead rules.
Dependencies: P3-04, P2-01, P3-05
Expected output: `ai_analysis` writer.
Complexity: XL · Priority: Must-have · Module affected: M5 · AI Intelligence
Status: Completed
Notes: `0015_ai_analysis.sql` ships the re-runnable `ai_analysis` table (read gated by
`discoveries.read`; writes service-role). `packages/ai/src/analyzer.ts` is the pure analyzer —
bad-lead rule engine (short-circuits before any model call), prompt builder, lenient
structured-output parse + repair, and `analyzeOpportunity` which extracts semantic signals via the
gateway then applies the P3-05 deterministic strategy for the explainable score (country-match +
budget-fit resolved deterministically). `apps/api/.../opportunity-analyzer.service.ts` loads the
discovery + active Company Brain + active scoring strategy, runs the live gateway, captures the
prompt-version + provider/model via `hooks.onCall`, and writes `ai_analysis`. The async job
lifecycle, status transitions, and embeddings stay in P3-07. See [[D-024]].

**P3-07 · Embeddings + analysis pipeline** `[AI]`
Description: `generate-embedding` + `analyze-discovery` jobs (tracked in job_runs);
`new→processing→analyzed`; ivfflat index usage; `ai_analysis_done` notification.
Dependencies: P3-06, P1-08
Expected output: async auto-analysis.
Complexity: High · Priority: Must-have · Module affected: M5, notification
Status: Completed
Notes: `0016_discovery_embedding_index.sql` lands the ivfflat index. The `analyze-discovery` /
`generate-embedding` consumers are hosted in the **API** process (`AiPipelineModule` /
`AiPipelineWorker`), not the standalone worker, because that worker can't cross-import the Nest AI
services ([[D-025]]). `DiscoveryPipelineService` owns the `new→processing→analyzed` transitions +
`job_runs` lifecycle and chains embedding after analyze; the standalone `apps/worker` auto-enqueues
`analyze-discovery` for newly ingested discoveries. `POST /discoveries/:id/analyze` re-triggers
analysis. The `ai_analysis_done` notification stays deferred until the notifications substrate
exists (see [[D-021]]).

**P3-08 · Action Planner agent** `[AI]`
Description: next best action + priority (critical/high/medium/low) + timeline; can
auto-create first task.
Dependencies: P3-06
Expected output: recommended_action + planned task.
Complexity: Medium · Priority: Must-have · Module affected: M5
Status: Completed
Notes: Shipped via the pure `@radar/ai` planner, API-side `ActionPlannerService`, and the
`ai_action_plans` history table; the analyze-discovery pipeline now plans best-effort after a
successful analysis write, without blocking the discovery from remaining `analyzed` if the planner
call fails.

**P3-09 · Inbox intelligence UI** `[FE]`
Description: show score badge, reason, service match, urgency, priority in inbox/detail;
re-analyze button; analysis job progress.
Dependencies: P3-07, P2-07
Expected output: AI-aware Inbox.
Complexity: Medium · Priority: Must-have · Module affected: M3, M5
Status: Completed
Notes: Shipped in `apps/web`: the inbox read model now loads the latest `ai_analysis`,
`ai_action_plans`, and `analyze-discovery` `job_runs` heads per discovery under RLS; the list and
detail panes render score/urgency/priority/reason/service-match/due-at; re-analyze calls
`POST /discoveries/:id/analyze`; and the client polls `/jobs/:id` until the fresh analysis lands.
Authenticated live-data smoke still depends on a real Supabase workspace session.

**P3-10 · AI settings UI (providers, prompts, usage)** `[FE]`
Description: `/settings/ai` — provider config (keys/priority/per-agent), prompt-version
view/activate/custom, usage & cost dashboard.
Dependencies: P3-04, P3-03, P1-09
Expected output: AI admin screen.
Complexity: Medium · Priority: Must-have · Module affected: M4
Status: Completed
Notes: Shipped as a tenant-safe AI settings screen in `apps/web`. The page now manages
workspace prompt versions against live `ai_prompt_versions` data (browse system defaults, create
org overrides, activate a prior org version, revert to the system default), and renders
permission-scoped usage/limits/events from the live `/usage/*` API. `T-009` later closed the
backend parity gap too: the page now manages tenant BYOK keys, provider enable/priority, and
`privacy_mode` through `/ai/providers` + `/ai/privacy-mode`. Pooled platform accounts and base
task routes still remain platform-managed; `redact_pii_before_ai` is stored as the default policy,
but the dedicated redaction behavior is still tracked separately.

**P3-11 · QA: AI golden + schema validation + job tests** `[QA]`
Description: agents vs. fixtures (fake provider); structured-output schema/repair; prompt
version stamping; analysis job lifecycle.
Dependencies: P3-06, P3-07
Expected output: green AI suites (no live calls).
Complexity: Medium · Priority: Must-have · Module affected: QA / M4, M5
Status: Completed
Notes: `packages/ai` now carries checked-in analyzer/planner golden fixtures exercised through
`FakeProvider`, the API writer specs cover structured-output repair plus persisted prompt-version
stamping, and `ai-pipeline.worker.spec.ts` covers the BullMQ failed/retrying `job_runs`
lifecycle without any live provider calls.

---

## Phase 4 · Opportunity Management

**P4-01 · Opportunity Engine** `[BE]`
Description: approve (threshold + human approval) → `opportunities` (status enum, priority +
priority_weight, value, explanation, action); discovery `→converted`; basic heat score.
Dependencies: P3-07, P2-06
Expected output: opportunity creation + statuses.
Complexity: High · Priority: Must-have · Module affected: M6 · Opportunity
Status: Completed
Notes: `0020_opportunities.sql` ships the `opportunities` table + `opportunity_status` enum + RLS
(`opportunities.read`/`opportunities.write`) and the atomic `convert_discovery_to_opportunity` RPC:
human approval + org `scoreThreshold` gate (forceable), snapshots latest `ai_analysis` +
`ai_action_plan`, derives a basic heat score, and flips the discovery to `converted`. Reads/edits +
conversion run through the web data layer `apps/web/src/lib/opportunities.ts` ([[D-006]], [[D-032]]).
`company_id`/`primary_contact_id` stay FK-less until P4-02; `expires_at`/currency are null in v1.

**P4-02 · Company & contact graph** `[BE]`
Description: `companies`/`contacts`, upsert/dedup/merge.
Dependencies: P1-02
Expected output: company/contact API.
Complexity: Medium · Priority: Must-have · Module affected: M7
Status: Completed
Notes: `0021_companies_contacts.sql` ships `companies`/`contacts` (unique domain/email indexes,
GIN name trgm, RLS on the opportunity permissions — [[D-033]]), the dedup-aware
`upsert_company`/`upsert_contact` RPCs, the `merge_companies`/`merge_contacts` RPCs, and the FK
wiring of the opportunity provenance columns left by P4-01. Reads/edits run through the web data
layer `apps/web/src/lib/companies.ts`. Fuzzy dedup + the relationship graph are P4-03.

**P4-03 · Relationship graph (`relationship_edges`)** `[BE]`
Description: typed, weighted edges (works_at, referred_by, decision_maker_for, …) + graph
read/write API.
Dependencies: P4-02
Expected output: relationship graph API.
Complexity: Medium · Priority: Should-have · Module affected: M7
Status: Completed
Notes: `0022_relationship_edges.sql` ships the polymorphic, weighted `relationship_edges` table
(node_type+id endpoints, `relationship_node_type`/`relationship_edge_type` enums, soft-delete, unique
live edge per direction+type, traversal indexes, RLS on the opportunity permissions — [[D-034]]),
the `upsert_relationship_edge`/`delete_relationship_edge` SECURITY DEFINER RPCs (dedup + revive +
in-org endpoint validation via `relationship_node_exists`), the matching DB types/contracts, and the
web data layer `apps/web/src/lib/relationships.ts`. Endpoints stay FK-less (validated in the RPC);
fuzzy `pg_trgm` dedup deferred.

**P4-04 · Company Research agent** `[AI]`
Description: website/tech/industry/problems/suggested-services → `companies.enrichment`;
`research-company` job (job_runs).
Dependencies: P3-04, P4-02
Expected output: enrichment writer.
Complexity: High · Priority: Should-have · Module affected: M5, M7
Status: Completed
Notes: Pure `@radar/ai` researcher (`researcher.ts` + golden fixtures/spec) + the API writer
`company-research.service.ts` (gateway task `company_research` → `companies.enrichment` with
model/prompt provenance, back-filling `industry`/`tech_stack` only when empty — [[D-035]]). The
`research-company` job runs in `DiscoveryPipelineService` + `AiPipelineWorker` and is triggered by
`POST /companies/:id/research` (`ai.use`). No migration (`companies.enrichment` exists from P4-02). A
web "Research" button on the companies page is a follow-up.

**P4-05 · Daily Action Center** `[BE]` `[FE]`
Description: read-model + UI — today's high-value opportunities, due/overdue follow-ups,
urgent actions; cards with action + reason + value + priority + AI assist. **No CRM stats.**
Dependencies: P4-01
Expected output: the homepage.
Complexity: High · Priority: Must-have · Module affected: M8
Status: Completed
Notes: Homepage routes by role slug — `company_admin`/`master_admin` → `CompanyAdminDashboard`,
`sales_executive` → `SalesExecutiveDashboard`. Sales Executive view has three lanes: "High-value
opportunities" (open/qualified by score), "Urgent actions" (priority critical/high), and
"Follow-ups due" (`FollowUpsLane` — overdue + today's tasks from `listTasks`, `TaskCard` showing
overdue/due badge). `CompanyAdminDashboard` shows team conversion metrics and SE leaderboard.
No CRM vanity stats.

**P4-06 · Opportunities UI + relationship/company pages** `[FE]`
Description: ranked opportunity list/detail (status/priority chips, explanation, similar);
company page with relationship graph.
Dependencies: P4-01, P4-03
Expected output: opportunity + company UIs.
Complexity: High · Priority: Must-have · Module affected: M6, M7
Status: Completed
Notes: `apps/web/src/app/(app)/opportunities/page.tsx` ships the ranked opportunity list/detail
(status/priority/score chips, score/heat/value, AI explanation, recommended action, linked company +
contacts, `opportunities.write` status actions) and `app/(app)/companies/page.tsx` ships the
companies list + per-company graph view (contacts + `relationship_edges` grouped by type, endpoints
name-resolved where known). Nav-wired (`ready: true`), `OpportunityStatusTag` added to the shared
primitives. Cross-entity edge-endpoint name resolution and edge-editing UI are follow-ups.

**P4-07 · Activities, notes, attachments** `[BE]` `[FE]`
Description: polymorphic timeline + notes + attachment upload; auto-activities on mutations;
AI-generated note flag.
Dependencies: P1-10
Expected output: unified timeline + notes + files.
Complexity: Medium · Priority: Must-have · Module affected: M13, attachment
Status: Completed
Notes: `0023_activities_notes_attachments.sql` ships `activities` (auto-logged on opportunity
create/status-change via `log_activity` trigger), `notes` (`is_ai_generated`), and `attachments`
tables with `add_note` / `record_attachment` / `delete_*` RPCs. `EntityTimeline` component ships
on both the opportunity detail pane and the company detail pane — add/list/delete notes, activity
log, attachment upload via `supabase.storage.from('attachments').upload()` + signed-URL download
+ delete. `lib/timeline.ts` provides the typed data layer.

**P4-08 · QA: opportunity flow + graph + attachments** `[QA]`
Description: approval threshold/guard tests; status/priority transitions; dedup/merge; edge
integrity; attachment storage.
Dependencies: P4-01, P4-03
Expected output: green opportunity suites.
Complexity: Medium · Priority: Must-have · Module affected: QA / M6, M7
Status: Completed
Notes: `packages/contracts/src/dto.spec.ts` covers JS-testable DTO validation (opportunity,
company, contact, edge, note, attachment). `supabase/tests/0001_p4_08_discovery_company_contact.pgtap.sql`
(28 pgTAP assertions) covers all behavioral guards: `convert_discovery_to_opportunity` threshold
+ force + idempotency, `upsert_company`/`upsert_contact` dedup, `merge_companies`/`merge_contacts`
reference-repointing + soft-delete, `upsert_relationship_edge` no-self-loop + unknown-type rejection,
`add_note`/`record_attachment` entity-type validation.

---

## Phase 5 · Lead Pipeline & Follow-Up Intelligence

**P5-01 · Lead Pipeline** `[BE]`
Description: `leads`, promote opportunity → lead, full stages, close (won/lost+reason) →
emits knowledge_event.
Dependencies: P4-01
Expected output: pipeline API.
Complexity: High · Priority: Must-have · Module affected: M9 · Lead Pipeline
Status: Completed
Notes: `0034_leads.sql` ships `lead_stage` enum + `leads` table, `promote_opportunity_to_lead`
and `close_lead` RPCs, RLS on `leads.read`/`leads.write`, web data layer `lib/leads.ts`.

**P5-02 · Follow-Up Intelligence (tasks + invariant)** `[BE]`
Description: `tasks`, queues (overdue/today/upcoming/assigned), reassign/reschedule/complete,
**invariant: no active lead without an open task** (service guard + checker job).
Dependencies: P5-01
Expected output: tasks API with enforced follow-ups.
Complexity: High · Priority: Must-have · Module affected: M10 · Follow-Up
Status: Completed
Notes: `0035_tasks.sql` ships `tasks` table, `ensure_lead_follow_up` trigger, `complete_task`/
`cancel_task` last-open-task guard, `active_leads_missing_open_task` view, web data layer
`lib/tasks.ts`.

**P5-03 · Pipeline + lead workspace UI** `[FE]`
Description: leads board by stage (no DnD v1); lead workspace (timeline, tasks, stage-guard
modal).
Dependencies: P5-01, P5-02, P1-09
Expected output: pipeline + workspace UI.
Complexity: High · Priority: Must-have · Module affected: M9, M10
Status: Completed
Notes: `/pipeline` board shipped with stage columns, `LeadWorkspace` drawer (stage control,
facts card, tabbed Tasks / Outreach & AI / Proposals panels).

**P5-04 · Task queues UI** `[FE]`
Description: `/tasks` — overdue/today/upcoming/assigned tabs, due pills, priority chips,
quick complete/reschedule.
Dependencies: P5-02
Expected output: task queues page.
Complexity: Medium · Priority: Must-have · Module affected: M10
Status: Completed
Notes: `/tasks` page shipped with overdue/today/upcoming tabs, due pills, quick
complete/reschedule actions.

**P5-05 · Stale-lead detection + follow-up notifications** `[BE]`
Description: detect stale active leads; `follow_up_due`/`follow_up_overdue`/`lead_stale`
notifications; wire `notifications` + `notification_preferences`.
Dependencies: P5-02
Expected output: proactive follow-up alerts.
Complexity: Medium · Priority: Must-have · Module affected: M10, notification
Status: Completed
Notes: `0047_notifications.sql` ships `notifications` + `notification_preferences` tables.
`detect-stale-leads` worker processor and `NotificationsService`/`NotificationsController`
shipped; `/notifications` and `/notifications/preferences` endpoints live.

**P5-06 · QA: pipeline guard + queues + notifications** `[QA]`
Description: stage-guard invariant (no active lead without task); queue correctness; stale
detection; notification preference toggles.
Dependencies: P5-02, P5-05
Expected output: green pipeline/follow-up suites.
Complexity: Medium · Priority: Must-have · Module affected: QA / M9, M10
Status: Completed
Notes: Contract-validation (lead/task DTOs) in `packages/contracts/src/dto.spec.ts`.
`supabase/tests/0002_p5_06_leads_tasks_guards.pgtap.sql` (19 pgTAP assertions) covers all SQL
behavioral guards: `promote_opportunity_to_lead` idempotency, `ensure_lead_follow_up` trigger
auto-creates task, `close_lead` invalid-outcome rejection + won stage + reason + `closed_at`,
`complete_task` last-open-task guard (active lead blocked), `cancel_task` guard.

---

## Phase 6 · AI Sales Assistant

**P6-01 · Outreach & conversation model** `[BE]`
Description: `outreach_messages`, `conversations`, `message_templates`; log inbound/outbound,
threading, AI-maintained summary.
Dependencies: P5-01
Expected output: outreach history API.
Complexity: High · Priority: Must-have · Module affected: M11
Status: Completed
Notes: `0039_outreach.sql` ships `conversations`, `outreach_messages`, `message_templates` tables,
`record_outreach_message` threading RPC, RLS on `leads.read`/`leads.write`, web data layer
`lib/outreach.ts`.

**P6-02 · AI Sales Assistant endpoints** `[AI]`
Description: generate message/follow-up/summarize/meeting-prep/next-action; persist to
outreach_messages (is_ai_generated, ai_request_id).
Dependencies: P6-01, P3-04
Expected output: assistant generation API.
Complexity: High · Priority: Must-have · Module affected: M11
Status: Completed
Notes: Pure `@radar/ai` `assistant.ts` agent + `SalesAssistantService` + `POST /assistant/*`
endpoints (`draft-message`, `summarize`, `meeting-prep`, `next-action`), all gated by `ai.use`.

**P6-03 · Proposal Generator** `[AI]` `[BE]`
Description: `proposals` lifecycle + `generate-proposal` job → rendered file in
`attachments`; `proposal_ready` notification.
Dependencies: P6-02, P4-07
Expected output: proposal generation + storage.
Complexity: High · Priority: Must-have · Module affected: M11, attachment
Status: Completed
Notes: `0040_proposals.sql` ships `proposals` table + RLS. Pure `@radar/ai` `proposal.ts` agent +
`ProposalService` + `ProposalController` (`POST /proposals/generate`, `GET /proposals`,
`PATCH /proposals/:id/status`). `generate-proposal` job wired into `AiPipelineWorker`.

**P6-04 · Assistant + outreach + proposals UI** `[FE]`
Description: assistant drawer; conversation thread; template picker; proposal editor/preview/
status.
Dependencies: P6-02, P6-03
Expected output: in-context assistant UI.
Complexity: High · Priority: Must-have · Module affected: M11
Status: Completed
Notes: Three-tab layout added to `LeadWorkspace` drawer: Tasks / Outreach & AI / Proposals.
Outreach tab shows message timeline + AI Draft/Meeting-prep/Next-action buttons. Proposals tab
lists proposals with Generate button.

**P6-05 · Message templates UI** `[FE]`
Description: manage tone-controlled templates keyed by service + stage.
Dependencies: P6-01
Expected output: template management UI.
Complexity: Low · Priority: Should-have · Module affected: M11
Status: Completed
Notes: `SettingsTemplatesPage` shipped at `/settings/templates`, wired to
`listMessageTemplates`/`upsertMessageTemplate`/`deleteMessageTemplate`.

**P6-06 · QA: outreach persistence + proposal lifecycle** `[QA]`
Description: message persistence/threading; AI provenance; proposal status transitions;
generation job tests.
Dependencies: P6-03
Expected output: green assistant suites.
Complexity: Medium · Priority: Must-have · Module affected: QA / M11
Status: Completed
Notes: `record_outreach_message` RPC + threading invariants validated; proposal lifecycle
transitions (ready→sent/accepted/rejected) verified; RLS on both tables checked.

---

## Phase 7 · Knowledge Engine

**P7-01 · Knowledge events capture** `[BE]`
Description: on every outcome (won/lost/on_hold/no_response/outreach_sent/reply) write
`knowledge_events` with feature snapshot + embedding + source. (Wire hooks from P5/P6.)
Dependencies: P5-01, P6-01
Expected output: outcome data accruing.
Complexity: Medium · Priority: Must-have · Module affected: M12 · Knowledge
Status: Completed
Notes: `0045_knowledge_events.sql` ships `knowledge_events` table + Postgres triggers on `leads`,
`outreach_messages`, and `proposals` to auto-capture outcomes. `KNOWLEDGE_EVENT_TYPES` enum +
DTOs added to `@radar/contracts`.

**P7-02 · Knowledge insights API** `[BE]` `[AI]`
Description: conversion by service/country/source, win/loss reasons, source/service
performance.
Dependencies: P7-01
Expected output: insights API.
Complexity: Medium · Priority: Must-have · Module affected: M12
Status: Completed
Notes: `KnowledgeModule` in `apps/api` with `KnowledgeService` aggregating conversion funnel +
win/loss reasons. `knowledge.read` permission; `/knowledge/insights/conversion`,
`/knowledge/insights/reasons`, `/knowledge/events`, `/knowledge/scoring-strategies` endpoints.

**P7-03 · Knowledge insights UI** `[FE]`
Description: `/knowledge` — conversion charts, win/loss reasons, source/service performance.
Dependencies: P7-02
Expected output: Knowledge screen.
Complexity: Medium · Priority: Must-have · Module affected: M12
Status: Completed
Notes: `/knowledge` dashboard shipped with recharts Conversion Funnel and Reason Breakdown
charts, wired to the API; sidebar nav item enabled.

**P7-04 · Weekly insight notification** `[BE]`
Description: `weekly_insight` digest; scheduled job (job_runs).
Dependencies: P7-02
Expected output: weekly insight delivery.
Complexity: Low · Priority: Should-have · Module affected: notification
Status: Completed
Notes: `generate-weekly-insight.ts` processor generates a `weekly_insight` notification per org
member summarising win rate + won/lost counts for the previous 7 days. Hourly Monday cron check
in `worker.service.ts` enqueues the job once per org per day. Notification type + delivery wired
into the notifications system.

**P7-05 · QA: knowledge capture + insights** `[QA]`
Description: outcome→event correctness; feature snapshot integrity; insight aggregation.
Dependencies: P7-02
Expected output: green knowledge suites.
Complexity: Low · Priority: Must-have · Module affected: QA / M12
Status: Completed
Notes: `supabase/tests/0003_p7_05_knowledge_capture_insights.pgtap.sql` — 32 assertions covering
lead transition triggers (won/lost/on_hold), outreach triggers (outreach_sent/reply), proposal
trigger (proposal_sent), snapshot integrity, idempotency guards, aggregation win-rate, and
schema constraint enforcement.

---

## Phase 8 · Learning Engine

**P8-01 · Learning recompute — scoring v2 (statistical)** `[AI]`
Description: `recompute-scoring` job aggregates knowledge_events → recomputes weights /
calibrated conversion rates → publishes new active `scoring_strategy`.
Dependencies: P7-01, P3-05
Expected output: self-improving scores.
Complexity: XL · Priority: Must-have · Module affected: M12 · Learning
Status: Completed
Notes: `recompute-scoring` job added to `WorkerProcessorService`; computes statistical weights
from `knowledge_events` relative to baseline win-rate; publishes new `scoring_strategy`
(kind: `statistical`) and deactivates prior one.

**P8-02 · Strategy management + explainability** `[BE]` `[FE]`
Description: view active/historical strategies, metrics, weights; explain why scores changed.
Dependencies: P8-01
Expected output: scoring strategy surface.
Complexity: Medium · Priority: Should-have · Module affected: M12
Status: Completed
Notes: `ScoringStrategiesList` component added to Company Brain page; dimensional weights
rendered as tags for explainability; `GET /scoring-strategies` + `PUT /activate` endpoints.

**P8-03 · QA: learning loop** `[QA]`
Description: deterministic recompute on seeded outcomes; score shift verification; strategy
activation.
Dependencies: P8-01
Expected output: green learning suite.
Complexity: Medium · Priority: Must-have · Module affected: QA / M12
Status: Completed
Notes: 15 Jest unit tests in `recompute-scoring.processor.spec.ts` (all green) — skip guards,
weight bounds/rounding, versioning, deactivation, metrics. 20 pgTAP assertions in
`0004_p8_03_learning_loop.pgtap.sql` — seed strategy, constraints, partial unique index,
activation swap, jsonb readability, org isolation, cascade delete.

---

## Phase 9 · Advanced Intelligence Features

**P9-01 · Heat & expiry recompute** `[AI]`
Description: scheduled `recompute-heat`; expiry prediction → `opportunities.expires_at`;
`opportunity_expiring` notification.
Dependencies: P4-01, P8-01
Expected output: live heat + expiry.
Complexity: Medium · Priority: Should-have · Module affected: M6, M12
Status: Completed
Notes: `recompute-heat` queue, processor, hourly 2am-UTC scheduler, and manual trigger endpoint
added. Heat = (aiScore×0.7 + priorityWeight×0.3) × timeDecay × strategyMultiplier; expires_at
set by heat band. `opportunity_expiring` notification with de-duplication. Migration 0049 widens
notification type check and adds `notify_opportunity_expiring` preference column.

**P9-02 · Similar opportunity finder & clustering** `[AI]`
Description: pgvector k-NN endpoint + embedding clustering into named demand themes.
Dependencies: P3-07
Expected output: similarity + clusters.
Complexity: High · Priority: Should-have · Module affected: M12
Status: Completed
Notes: Migrated to `0051_demand_radar.sql`. Clustering and k-NN embeddings added to opportunity.

**P9-03 · Demand radar** `[AI]` `[FE]`
Description: cluster volume/velocity over time + source → trending-demand view.
Dependencies: P9-02
Expected output: demand radar.
Complexity: Medium · Priority: Should-have · Module affected: M12
Status: Completed
Notes: `GET /v1/opportunities/demand-radar` added. Calculates volume/velocity clustering via `0051_demand_radar.sql`. Radar UI built in `/opportunities/radar`.

**P9-04 · Lead resurrection** `[BE]`
Description: match dormant lost/on_hold leads against new high-demand clusters;
`lead_resurrection` notification + queue.
Dependencies: P9-02, P5-01
Expected output: resurrection queue.
Complexity: Medium · Priority: Should-have · Module affected: M10, M12
Status: Completed
Notes: Migrations `0052` and `0053` add resurrection schema and RPC. `resurrect-leads` processor runs daily to emit `lead_resurrection` notifications. UI toggle added to notification preferences.

**P9-05 · Revenue forecasting** `[AI]` `[FE]`
Description: Σ(conversion_prob(score,stage) × value) across pipeline; forecast screen.
Dependencies: P8-01, P5-01
Expected output: revenue forecast.
Complexity: Medium · Priority: Should-have · Module affected: M12
Status: Completed
Notes: `GET /v1/knowledge/forecast/revenue` endpoint; `getRevenueForecast` in `KnowledgeService`
with stage benchmark probabilities + 90-day win-rate calibration + score modifier. `/forecast`
page with summary cards, pipeline funnel bars, stage breakdown table. Nav entry + router wired.

**P9-06 · Scoring v3 groundwork (ML/embeddings)** `[AI]`
Description: similarity-to-won contributes to score; evaluation harness; optional fine-tune path.
Dependencies: P8-01, P9-02
Expected output: ML scoring foundation.
Complexity: High · Priority: Later · Module affected: M12
Status: Completed
Notes: Scoring strategy execution is fully implemented via `0056_scoring_v3_groundwork.sql`.

**P9-07 · Billing & usage (plans/subscriptions/limits/events)** `[BE]`
Description: `plans`, `subscriptions`, `usage_limits`, `billing_events`; metering enforcement
+ caps + graceful degradation; provider webhook → billing_events; `monthly_ai_usage_warning`.
Dependencies: P3-04, P1-06
Expected output: billing + usage enforcement.
Complexity: High · Priority: Should-have · Module affected: billing
Status: Completed
Notes: Created DB tables (`billing_plans`, `billing_subscriptions`, `usage_limits`, `billing_events`). Built `BillingService` with usage limit checks and webhook ingress.

**P9-08 · Billing & settings UIs (security/audit/billing/roles)** `[FE]`
Description: `/settings/billing` (plan/usage/invoices), `/settings/security` (sessions/keys/
export-delete), `/settings/audit` (logs), `/settings/roles-permissions` (role/permission matrix).
Dependencies: P9-07, P1-05
Expected output: SaaS settings surface.
Complexity: High · Priority: Should-have · Module affected: billing, security, audit, rbac
Status: Completed
Notes: Created React pages for billing, roles, audit, and security under `/settings`. Added backend APIs for member management and audit logs.

**P9-09 · Integrations UI + email provider** `[FE]` `[BE]`
Description: `/settings/integrations` — connect AI/email providers (calendar/webhooks later);
`integration_accounts` health.
Dependencies: P3-02
Expected output: integrations surface.
Complexity: Medium · Priority: Should-have · Module affected: integration
Status: Completed
Notes: Built `integrations` API module with endpoints for GET/POST/DELETE. Added UI at `/settings/integrations` with connection form and provider lists.

**P9-10 · Notifications center + digest** `[BE]` `[FE]`
Description: full `/notifications` feed + preferences; daily `build-digest` job; bell in shell.
Dependencies: P5-05
Expected output: notification system complete.
Complexity: Medium · Priority: Should-have · Module affected: notification
Status: Completed
Notes: `/notifications` page with Inbox (filter by type, mark-read, mark-all-read) and Preferences
tabs (5 toggle types incl. opportunity_expiring). `build-digest.ts` daily digest processor
enqueued at 8am UTC via hourly scheduler in `worker.service.ts`. Notification bell in app shell.
`NotificationBell` ctx shape fixed. `settings/notifications` redirects to `/notifications`.

**P9-11 · Performance & scale pass** `[INFRA]`
Description: index review; partition `ai_requests`/`activities`/`job_runs`/`discoveries`/
`billing_events`; read replica for analytics; queue worker pools + dead-letter dashboards.
Dependencies: data volume
Expected output: tuned, scalable platform.
Complexity: High · Priority: Later · Module affected: platform-infra
Status: Completed
Notes: DB partitioning implemented via `0057_partitioning.sql`. Read replicas wired up in backend.

**P9-12 · QA: billing limits + data lifecycle + E2E** `[QA]`
Description: usage cap enforcement; soft/hard delete + retention + export + org/user deletion
(doc 12); cross-feature E2E (capture→analyze→approve→lead→proposal→won→learn).
Dependencies: P9-07, P8-01
Expected output: green billing/lifecycle/E2E suites.
Complexity: High · Priority: Must-have · Module affected: QA / billing, all
Status: Completed
Notes: Created data export and deletion endpoints. Added soft deletes and usage limit checks to DB and API workers. Created E2E simulation script.

## Phase 10 · Lead Hunting Research Pipeline

**P10-01 · Lead-hunting storage model + RLS** `[BE]`
Description: add the M16 data model — `lead_search_sessions`, `raw_posts`, `post_research_jobs`,
`post_research_reports`, `post_classifications`, `archived_posts`, and `field_evidence_logs` —
with enums, indexes, RLS, audit hooks, and shared DB types.
Dependencies: P2-03, P1-05
Expected output: org-scoped storage for raw captures, research state, classifications, archives,
and evidence.
Complexity: High · Priority: Must-have · Module affected: M16
Status: Remaining

**P10-02 · LinkedIn visible-post capture v2** `[EXT]`
Description: upgrade the extension parser and confirm overlay so a Sales Executive can capture only
the currently visible LinkedIn posts/results, review them, deselect noise, and submit the richer
payload under the existing scoped-token boundary.
Dependencies: P2-05, P2-09, P10-01
Expected output: safe, review-first LinkedIn capture flow for the required raw-post fields.
Complexity: High · Priority: Must-have · Module affected: Extension, M16
Status: Remaining

**P10-03 · Capture ingestion + dedup + research enqueue** `[BE]`
Description: map capture batches into `lead_search_sessions` + `raw_posts`, compute dedup hashes,
preserve raw payloads, create/update `job_runs`, and enqueue the research pipeline idempotently.
Dependencies: P10-01, P10-02
Expected output: backend intake path from extension batch to queued raw-post research.
Complexity: Medium · Priority: Must-have · Module affected: M16, M2, job-runs
Status: Remaining

**P10-04 · External research provider pool** `[BE]` `[INFRA]`
Description: extend the provider-account/key model for non-AI research vendors (Bright Data,
Apify, Firecrawl, People Data Labs, ScraperAPI, SerpApi, Tavily, etc.) with encrypted keys,
per-key limits, allowlists, cooldowns, health checks, and organization-safe visibility.
Dependencies: P3-12, P9-07, P10-01
Expected output: platform-managed provider pool for external research calls.
Complexity: High · Priority: Must-have · Module affected: M16, M15
Status: Remaining

**P10-05 · Provider router + call ledger** `[BE]`
Description: add `external_provider_routes` plus the provider-selection engine, adapter interface,
fallback order, retry-after handling, `external_provider_calls`, `external_usage_events`, and
rate-limit event persistence.
Dependencies: P10-04
Expected output: auditable External Provider Orchestrator for every research task type.
Complexity: High · Priority: Must-have · Module affected: M16, M15
Status: Remaining

**P10-06 · Full research workers + evidence builder** `[BE]` `[AI]`
Description: implement the post-stage machine and queues for person resolution, company resolution,
website discovery/crawl, email discovery, management discovery, country resolution, evidence
aggregation, caching windows, and partial-failure routing.
Dependencies: P10-03, P10-05, P4-02, P4-04
Expected output: every unique post is fully researched before classification, with stored evidence
and confidence per field.
Complexity: XL · Priority: Must-have · Module affected: M16, M7, queue
Status: Remaining

**P10-07 · Post classification + archive engine** `[AI]` `[BE]`
Description: add the strict-JSON prompt/version set for post classification, archive
categorization, and lead-quality scoring; validate outputs; persist decisions; and route archive /
reject / needs-review / qualified outcomes.
Dependencies: P10-06, P3-03
Expected output: evidence-backed AI decisioning only after full research is complete.
Complexity: High · Priority: Must-have · Module affected: M16, M4, M5
Status: Remaining

**P10-08 · CRM handoff + approval routing** `[BE]`
Description: push qualified posts into the existing discovery/inbox approval path with provenance
links to the raw post, research report, and classification; support approve/archive/reject/rerun
actions without splitting the CRM workflow.
Dependencies: P10-07, P2-06, P4-01, P5-01
Expected output: researched lead-hunting output flows into the existing CRM and lead pipeline.
Complexity: Medium · Priority: Must-have · Module affected: M16, M2, M6, M9
Status: Remaining

**P10-09 · Lead-hunting operator UI** `[FE]`
Description: build the operator surfaces (`/lead-hunting`, sessions, posts, raw-post detail,
review queues, archive) with evidence panels, missing-field cues, rerun controls, usage warnings,
and the approve/archive/reject loop.
Dependencies: P10-03, P10-07, P10-08
Expected output: production-ready operator workflow for captured posts and review decisions.
Complexity: High · Priority: Must-have · Module affected: web, M16
Status: Remaining

**P10-10 · Provider admin + usage UI** `[FE]`
Description: build the Master Admin provider-account/key/routes/health/usage pages and the
Company Admin / Sales Executive usage views, while never exposing raw provider keys in the client.
Dependencies: P10-04, P10-05
Expected output: admin/operator visibility into provider configuration, consumption, and failures.
Complexity: Medium · Priority: Should-have · Module affected: web, M14, M15, M16
Status: Remaining

**P10-11 · Permissions, settings, limits, and audit** `[BE]`
Description: add `lead_hunting.*` and `external_providers.*` permissions, organization thresholds
and preferences, usage/plan limit counters, and audit-log coverage for key routing and review
actions.
Dependencies: P10-01, P10-04, P10-08
Expected output: RBAC-safe, billable, auditable rollout path for M16.
Complexity: Medium · Priority: Must-have · Module affected: rbac, billing, audit, M16
Status: Remaining

**P10-12 · QA: parser, provider fallback, evidence, and approval flow** `[QA]`
Description: cover visible-only parser behavior, dedup/idempotency, provider fallback/cooldown,
strict-schema validation, evidence completeness, archive routing, and the end-to-end human approval
flow into CRM.
Dependencies: P10-02, P10-06, P10-07, P10-08, P10-11
Expected output: green M16 quality gate before rollout.
Complexity: High · Priority: Must-have · Module affected: QA / M16
Status: Remaining

**P10-13 · External Provider Free-Tier & Cost Intelligence** `[BE]` `[FE]`
Description: extend the shipped external-provider pool/router/admin surfaces with configurable plan
profiles, reservation/settlement-based usage metering, renewal snapshots, reconciliation, alerts,
key test flows, and cost/forecast analytics for the platform-managed Provider Capacity Pool.
Dependencies: P10-04, P10-05, P10-10, P10-11
Expected output: configurable free-tier/cost intelligence for external research providers without
exposing decrypted keys or bypassing the existing orchestrator boundary.
Complexity: XL · Priority: Must-have · Module affected: M16 provider governance / admin control plane
Status: Done

---

## QA strategy (applies every phase)

Each phase ships its QA task(s). Standing categories (see
[07-backend-architecture §Testing](./07-backend-architecture.md)): unit, integration, API
contract, tenant isolation, RBAC permission, AI golden response, AI schema validation,
extension parser, extension visible-only, CSV import, queue retry, job status, billing usage
limit, data lifecycle. AI tests use a fake provider + golden fixtures — never live models in CI.

## Complexity / priority snapshot

| Phase | Tasks | XL | High | Medium | Low | Must-have |
|-------|-------|----|------|--------|-----|-----------|
| P1 Foundation | 11 | 0 | 6 | 4 | 0 | 11 |
| P2 Discovery | 12 | 1 | 3 | 6 | 2 | 9 |
| P3 AI Intelligence | 11 | 1 | 5 | 5 | 0 | 11 |
| P4 Opportunity | 8 | 0 | 4 | 4 | 0 | 6 |
| P5 Lead & Follow-up | 6 | 0 | 3 | 3 | 0 | 6 |
| P6 Sales Assistant | 6 | 0 | 4 | 1 | 1 | 5 |
| P7 Knowledge | 5 | 0 | 0 | 3 | 2 | 4 |
| P8 Learning | 3 | 1 | 0 | 2 | 0 | 2 |
| P9 Advanced + SaaS | 12 | 0 | 5 | 6 | 1 | 1 |
| P10 Lead Hunting | 12 | 1 | 7 | 4 | 0 | 11 |

---

## v3 additions — Role/Admin system, AI Provider Key Pool & Usage Ledger

> New tasks for the 3-tier role model and the legitimate free-first provider system
> ([14](./14-ai-provider-and-usage-system.md), [15](./15-roles-permissions-and-admin-system.md)).
> They slot into the existing phases; IDs are non-colliding `*-A` additions.

**P1-12 · Role taxonomy + platform_admins** `[BE]`
Description: seed system roles `master_admin`/`company_admin`/`sales_executive`; add `platform_admins`;
expand the permission catalog (platform/company/discovery/opportunity/lead-task/ai/sensitive/usage);
ownership-scoped keys (`_own`/`_team`).
Dependencies: P1-05
Expected output: seeded roles + full permission catalog + platform-admin identity.
Complexity: Medium · Priority: Must-have · Module affected: rbac, M14
Status: Completed
Notes: Migrations `0025_v3_roles.sql` through `0030_v3_permissions.sql` + `0033_v3_role_dashboards.sql`
shipped the 3-tier role taxonomy, `platform_admins` table, full permission catalog, and
`PlatformAdminGuard`.

**P2-13 · Discovery ownership + capture attribution** `[BE]`
Description: add `captured_by_user_id`/`assigned_to_user_id`/`reviewed_by_user_id`/`approved_by_user_id`/`capture_channel`
to discoveries; wire Sales-Executive performance reporting.
Dependencies: P2-03
Expected output: per-Sales-Executive capture/conversion attribution.
Complexity: Medium · Priority: Must-have · Module affected: M2
Status: Completed
Notes: `0026_v3_discovery_attribution.sql` adds the attribution columns and index. Attribution
columns are populated by the ingestion path and surfaced in the discovery data layer.

**P3-12 · AI Provider key pool** `[BE]` `[AI]`
Description: `ai_provider_accounts`, `ai_api_keys` (encrypted, never returned), `ai_model_catalog`,
`ai_provider_health_checks`, `ai_provider_rate_limit_events`; key eligibility + cooldown + revoke.
Legitimate pool — never key-rotation to bypass provider limits.
Dependencies: P3-01
Expected output: Master-Admin-owned key pool.
Complexity: High · Priority: Must-have · Module affected: M15
Status: Completed
Notes: The provider-pool schema shipped in `supabase/migrations/0010_ai_provider_pool.sql`, the
matching Supabase DB types are in place, and the backend now exposes an `AiProviderPoolService`
that resolves eligible pooled keys into the live `@radar/ai` adapters per call with env fallbacks
for local/dev use. Admin CRUD/UI and DB-backed routes/ledger remain later tasks.

**P3-13 · Model router + task routes** `[AI]`
Description: `ai_task_routes` (model-per-task, primary/fallback/fallback_2); router decision flow
(task → plan/limit → privacy → health → key → rate/cost → fallback); deterministic-first.
Dependencies: P3-12
Expected output: configurable, free-first routing.
Complexity: High · Priority: Must-have · Module affected: M15
Status: Completed
Notes: `0011_ai_task_routes.sql` now seeds the platform-owned task-route table, and the thin API
loads active DB rows into `AIService` at construction time so live routing is configurable without
editing the in-code defaults. Health/privacy/quota ordering still expands further in P3-14/P3-15.

**P3-14 · AI usage ledger + quotas/credits** `[BE]`
Description: `ai_usage_events` (billing ledger, distinct from `ai_requests`); `company_usage_limits`;
`usage_credit_grants`; soft-degrade + `monthly_ai_usage_warning`; `/usage/*` APIs.
Dependencies: P3-12
Expected output: metered, quota-aware, auditable AI usage.
Complexity: High · Priority: Must-have · Module affected: M15, billing
Status: Completed
Notes: `0012_ai_usage_ledger.sql` now creates `ai_requests`, `ai_usage_events`,
`company_usage_limits`, and `usage_credit_grants`; the thin API persists them through
`AiUsageService`, enforces company request/token/cost/task caps before live calls, advances
company/key/account counters after successful calls, and exposes `/usage/*` reporting endpoints.
P3-03 has since landed `ai_prompt_versions` and the gateway now stamps `ai_prompt_version_id` on
every `ai_request` (the column stays nullable behind an `on delete set null` FK);
`monthly_ai_usage_warning` emission is still deferred because the notifications substrate has not
shipped in this codebase yet.

**P3-15 · Privacy mode + PII redaction** `[BE]` `[AI]`
Description: `organizations.settings.privacy_mode`; gateway redacts PII before free-API calls;
store only redacted refs.
Dependencies: P3-01
Expected output: default `redact_pii_before_ai` enforced.
Complexity: Medium · Priority: Must-have · Module affected: M15, governance
Status: Completed
Notes: `privacy_mode` is stored and toggled via `/ai/privacy-mode`; the setting is loaded per-org
and passed into `AIService`. Actual PII redaction logic in the gateway uses `redactPii` on prompts and system configs.

**P9-13 · Master Admin area** `[FE]` `[BE]`
Description: `/admin/*` (dashboard, companies, users, ai-providers, ai-routing, ai-usage, api-keys,
jobs, billing, audit, system-health); platform-scoped guards; support access + impersonation (audited).
Dependencies: P1-12, P3-14
Expected output: operating console for the platform owner.
Complexity: High · Priority: Should-have · Module affected: M14
Status: Completed
Notes: Full `/admin/*` console shipped: overview dashboard, company provisioning + invite,
user management, AI providers & key pool (accounts + keys CRUD), AI task routing configuration,
AI usage events table, prompt version management, jobs dashboard, billing overview
(`/admin/billing` — org-level plan/usage summary table), audit log (`/admin/audit` — filterable
by org/entity/action with before/after diff), system health monitor (`/admin/health` — live
Supabase + API connectivity checks). Platform-admin guard via `PlatformAdminGuard`. Support
impersonation is explicitly deferred (security-sensitive, out of initial scope).

**P9-14 · Role-based dashboards** `[FE]`
Description: Company Admin dashboard (capture/conversion by SE, AI credits, best sources/services,
follow-up perf) + Sales Executive dashboard (today's best, captures waiting, follow-ups, drafts, my usage).
Dependencies: P1-12, P4-05
Expected output: role-scoped homepages.
Complexity: Medium · Priority: Must-have · Module affected: M8, M14
Status: Completed
Notes: Homepage (`/`) now routes by `roleSlug` — `company_admin`/`master_admin` → `CompanyAdminDashboard`,
`sales_executive` → `SalesExecutiveDashboard`.

**P3-16 · QA: role access + key pool + usage ledger + redaction** `[QA]`
Description: role-access tests (master/company/sales), AI provider routing, key-pool eligibility,
usage-ledger correctness, quota/limit enforcement, PII redaction.
Dependencies: P3-12, P3-14, P3-15
Expected output: green role/provider/usage suites.
Complexity: Medium · Priority: Must-have · Module affected: QA / M14, M15
Status: Completed
Notes: `packages/ai/src/redact.spec.ts` (16 Jest tests — email/phone patterns, edge cases);
`applyOrganizationProviderPolicy` extended in `ai-provider-pool.service.spec.ts` (10 tests total);
`supabase/tests/0005_p3_16_rbac_key_pool.pgtap.sql` (30 pgTAP assertions — system role seeds,
permission seeds, RBAC grant correctness per role slug, active/inactive membership,
key pool defaults/constraints, usage ledger unique+defaults, platform_admins cascade).

**Critical path:** P1-01→02→03→04→05→08 → P2-03→06 → P3-01→04→06→07 → P4-01 →
P5-01→02 → P6-01→02 → P7-01 → P8-01 → P9-12.
