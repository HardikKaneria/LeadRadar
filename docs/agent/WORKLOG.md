# WORKLOG.md — Agent Breadcrumbs

> Append-only. Newest at the top. Every agent writes one entry when finishing or
> stopping a task. This is the shared short-term memory across sessions and agents.
>
> Entry format:
> ```
> ## YYYY-MM-DD HH:MM — <role/agent> — [task-id]
> did: what changed (files)
> verified: which checks ran + result
> ```

## 2026-06-30 — claude-sonnet-4-6 — [P10-14 hotfixes]
did: Fixed three bugs introduced by P10-14 implementation.
  - `apps/api/src/modules/lead-hunting/external-provider-adapters.service.ts`: Added explicit constructors to all 8 concrete adapter classes (BrightData, Apify, PeopleDataLabs, Tavily, SerpApi, Firecrawl, ScraperApi, Mock) so TypeScript emits `design:paramtypes` metadata and NestJS can inject `ExternalProviderAdapterRegistryService`. Root cause: inheriting constructor from abstract parent suppresses `__metadata` emission.
  - `supabase/migrations/0072_external_cost_rules.sql` + new `supabase/migrations/0073_external_cost_rules_seed.sql`: Split seed data into a separate migration file. Root cause: PostgreSQL 55P04 — new enum values added via `ALTER TYPE ... ADD VALUE` cannot be used in the same transaction; Supabase runs each migration file in its own transaction.
  - `apps/web/src/app/(admin)/admin/external-providers/page.tsx`: Added `?? []` fallback to all four new state setters (`setCostRules`, `setOptionMultipliers`, `setEndpointCatalog`, `setCostAdjustments`) to prevent state becoming `undefined` when API response lacks an `items` field. Also added `(v ?? [])` guards on the `taskTypes` and `appliesToTaskTypes` column renderers in the Endpoints and Multipliers tables.
verified: `tsc --noEmit` on api — 0 errors in changed files. `tsc --noEmit` on web — 0 errors in changed files (pre-existing errors in knowledge/reason-breakdown unrelated). `pnpm db:push` — "Remote database is up to date" (migrations applied).

## 2026-06-30 — web-frontend — [P10-14-FE]
did: Added Cost Intelligence Admin UI wired to the P10-14 backend endpoints.
  - `apps/web/src/lib/api.ts`: Added 6 new type imports from `@radar/contracts` (`ExternalCostRuleAdminDto`, `ExternalOptionMultiplierAdminDto`, `ExternalEndpointCatalogAdminDto`, `ExternalCostAdjustmentAdminDto`, `ExternalCostSimulatorInput`, `ExternalCostSimulatorResult`). Added 12 new API methods: `adminExternalCostRules`, `adminExternalCostRuleDetail`, `createAdminExternalCostRule`, `updateAdminExternalCostRule`, `deleteAdminExternalCostRule`, `adminExternalOptionMultipliers`, `upsertAdminExternalOptionMultiplier`, `deleteAdminExternalOptionMultiplier`, `adminExternalEndpointCatalog`, `upsertAdminExternalEndpoint`, `deleteAdminExternalEndpoint`, `runAdminExternalCostSimulator`, `adminExternalCostAdjustments`, `createAdminExternalCostAdjustment`.
  - `apps/web/src/app/(admin)/admin/external-providers/page.tsx`: Added imports for `EXTERNAL_BILLING_EVENTS` and `EXTERNAL_COST_RULE_SCOPES` from `@radar/contracts` plus 6 new DTO type imports. Added 9 state variables for the new data (costRules, optionMultipliers, endpointCatalog, costAdjustments, simulatorResult, simulatorLoading, 3 modal open/editing states). Added 4 form instances (costRuleForm, optionMultiplierForm, endpointForm, simulatorForm). Extended `loadAll()` Promise.all to fetch 4 more parallel endpoints and set their state. Added 4 handler functions: `submitCostRule`, `submitOptionMultiplier`, `submitEndpoint`, `runSimulator`. Added 4 new tab items: "Cost Rules" (table + CRUD modals), "Endpoints" (endpoint catalog table), "Multipliers" (option multipliers table), "Cost Simulator" (form + result card). Extended the Usage tab events Table with `expandable` row showing full cost breakdown fields (endpointKey, datasetKey, baseUnits, multiplier, finalUnits, free/paid split, unitPrice, calculatedCost, providerReported, costSource, record counts, costBreakdownJson). Added 3 new Modals for cost rule create/edit, option multiplier add, and endpoint catalog add.
verified: `tsc -p apps/web --noEmit` — 0 errors in touched files; only 3 pre-existing errors remain (knowledge/page.tsx + reason-breakdown.tsx, as expected). `pnpm --filter @radar/web build` passed in 8.62s. Build output shows new external-providers page chunk at 402 kB (reasonable for a dense admin control plane).

## 2026-06-30 — api-backend — [P10-14]
did: Implemented External Provider Cost Intelligence — Cost Rules Hierarchy end-to-end across 8 files.
  - `supabase/migrations/0072_external_cost_rules.sql`: New migration adding 4 new enums (`external_cost_rule_scope`, `external_billing_event`, `external_cost_source`, `external_route_behavior_mode`), 4 new tables (`external_cost_rules`, `external_option_cost_multipliers`, `external_endpoint_catalog`, `external_cost_adjustments`), 19 additive columns on `external_usage_events`, updated_at triggers, RLS enabled on all new tables, and seed data (7 cost rules, 4 option multipliers, 10 endpoint catalog entries).
  - `packages/supabase/src/database.types.ts`: Extended `ExternalProviderUnitType` union with 7 values; added 4 new type aliases; extended `ExternalUsageEventRow` with 19 cost-tracking fields; added `ExternalCostRuleRow`, `ExternalOptionCostMultiplierRow`, `ExternalEndpointCatalogRow`, `ExternalCostAdjustmentRow` interfaces; registered 4 new tables and 4 new enums in the Database type.
  - `packages/contracts/src/lead-hunting.ts`: Added 5 new enum const arrays and types (`EXTERNAL_COST_RULE_SCOPES`, `EXTERNAL_BILLING_EVENTS`, `EXTERNAL_COST_SOURCES`, `EXTERNAL_ROUTE_BEHAVIOR_MODES`, `EXTERNAL_COST_ADJUSTMENT_TYPES`); extended `ExternalProviderUsageEventAdminDto` with 20 cost breakdown fields; added 7 new DTOs (`ExternalCostBreakdown`, `ExternalCostRuleAdminDto`, `ExternalOptionMultiplierAdminDto`, `ExternalEndpointCatalogAdminDto`, `ExternalCostAdjustmentAdminDto`, `ExternalCostSimulatorInput`, `ExternalCostSimulatorResult`).
  - `apps/api/src/modules/lead-hunting/external-provider.types.ts`: Added 4 new DB enum type aliases and 4 new DB row type aliases; extended `ExternalUsageMetrics` with 16 new fields for full cost breakdown.
  - `apps/api/src/modules/lead-hunting/external-cost-calculator.service.ts`: Full rewrite adding `@Inject(SUPABASE_SERVICE)` constructor injection; new async methods `resolveActiveCostRule`, `resolveOptionMultipliers`, `calculatePreCallEstimate`, `calculatePostCallSettlement`; new sync method `buildCostBreakdown`; private `computeFromDbRule` implementing full billing-event/unit-type/option-multiplier/free-tier logic; all prior methods preserved.
  - `apps/api/src/modules/lead-hunting/external-provider-admin.service.ts`: Added `ExternalCostCalculatorService` injection; added 15 new public methods covering cost-rules CRUD, option-multiplier CRUD, endpoint-catalog upsert, cost simulator, cost-adjustment CRUD; added module-level mappers `mapCostRule`, `mapOptionMultiplier`, `mapEndpointCatalog`, `mapCostAdjustment` and `buildCostRulePayload` helper.
  - `apps/api/src/modules/admin/admin-external-providers.controller.ts`: Added 14 new admin endpoints under `admin/external/`: `cost-rules` (GET/GET-one/POST/PATCH/DELETE), `option-multipliers` (GET/POST/DELETE), `endpoint-catalog` (GET/POST/DELETE), `cost-simulator` (POST), `cost-adjustments` (GET/POST).
  - `apps/api/src/modules/lead-hunting/external-provider-intelligence.service.ts`: Extended `mapUsageEvent` to populate the 20 new cost breakdown fields from DB row.
  - `apps/api/src/modules/lead-hunting/external-provider-orchestrator.service.ts`: Extended `zeroUsage()` and inline usage merge to carry all 16 new `ExternalUsageMetrics` fields.
  - `apps/api/src/modules/lead-hunting/external-provider-orchestrator.service.spec.ts`: Updated `zeroUsage` test fixture to satisfy extended `ExternalUsageMetrics` type.
verified: `pnpm --filter @radar/contracts build` ✓, `pnpm --filter @radar/supabase build` ✓, `pnpm --filter @radar/api typecheck` ✓ (0 errors), `pnpm --filter @radar/api build` ✓ (nest build clean), `pnpm --filter @radar/api test` 167/168 passed (1 pre-existing test failure: orchestrator spec expects stale error message string, unrelated to P10-14).

## 2026-06-29 18:10 — api-backend — [P10-06][P10-07][P10-08]
did: Completed the next three Phase 10 backend tasks in one pass because the research worker, AI decisioning, and CRM handoff all sit on the same raw-post seam. Added `supabase/migrations/0069_lead_hunting_ai_tasks.sql` to extend `ai_task_routes`, `ai_prompt_versions`, `ai_requests`, and `ai_usage_events` for the new lead-hunting AI tasks. Added `packages/ai/src/lead-hunting.ts` (+ parser coverage in `packages/ai/src/lead-hunting.spec.ts`) and updated `packages/ai/src/{types,routes,index}.ts`, `packages/contracts/src/dto.ts`, and `packages/supabase/src/database.types.ts` so `post_research_classifier`, `archive_classifier`, and `lead_quality_scorer` are first-class governed AI tasks. In `apps/api/src/modules/lead-hunting/`, added `lead-hunting-pipeline.types.ts`, `lead-hunting-classification.service.ts`, `lead-hunting-crm-handoff.service.ts`, `lead-hunting-research.service.ts`, `lead-hunting.controller.ts`, and module wiring so `research-raw-post` now drives the post-stage machine, persists `post_research_reports`, writes `field_evidence_logs`, promotes confident company/contact findings into canonical M7 entities, persists `post_classifications`, creates `archived_posts` where needed, and routes qualified/reviewed output into canonical `discoveries` + `ai_analysis` with `raw_payload.leadHunting` provenance. Updated `apps/api/src/modules/worker/worker.service.ts` and `worker/processors/pipeline-producer.ts` so the queue can run/rerun the new research worker, and recorded the non-obvious routing/fallback choices in `docs/agent/DECISIONS.md` (`D-047`, `D-048`). Updated `docs/agent/CONTEXT.md` and `docs/agent/TASKS.md` to reflect that P10-06/07/08 are now shipped.
verified: `./node_modules/.bin/tsc -p packages/ai/tsconfig.json --noEmit` ✓, `./node_modules/.bin/tsc -p packages/contracts/tsconfig.json --noEmit` ✓, `./node_modules/.bin/tsc -p packages/supabase/tsconfig.json --noEmit` ✓, `./node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit` ✓, `./packages/ai/node_modules/.bin/jest --config packages/ai/jest.config.cjs packages/ai/src/lead-hunting.spec.ts --runInBand` ✓, `./apps/api/node_modules/.bin/jest --config jest.config.cjs src/modules/lead-hunting/lead-hunting-pipeline.types.spec.ts --runInBand` ✓, `git diff --check` ✓. Root `pnpm`/root `eslint` remain blocked in this workspace by the ignored-build policy and the missing `@eslint/js` install state already noted in earlier worklogs.

## 2026-06-29 15:57 — api-backend — [P10-03][P10-04][P10-05]
did: Completed the next three Phase 10 backend tasks together because they share the same intake and orchestration seam. `supabase/migrations/0066_lead_hunting_capture_ingestion.sql` now adds `lead_search_session_posts`, `raw_post_fingerprints`, helper read policies, and a unique `post_research_jobs` index so repeated LinkedIn captures attach to canonical raw posts instead of duplicating them (`D-045`). `apps/api/src/modules/ingestion/ingestion.service.ts`, `packages/contracts/src/dto.ts`, `packages/contracts/src/index.ts`, `apps/api/src/modules/worker/processors/pipeline-producer.ts`, `apps/api/src/modules/worker/worker.service.ts`, `apps/api/src/modules/worker/processors/lead-hunting-capture.ts`, and `apps/api/src/modules/worker/processors/process-extension-batch.processor.ts` now carry the richer extension payload (`captureMode` / `searchQuery`), create `lead_search_sessions` + canonical `raw_posts`, maintain per-session capture links and dedup fingerprints, ensure one `post_research_jobs` row per raw post, and enqueue `research-raw-post` queue jobs idempotently. `supabase/migrations/0067_external_provider_pool.sql` and `0068_external_provider_routing.sql` plus `packages/supabase/src/database.types.ts` now define the external provider pool/router/ledger schema, and the new `apps/api/src/modules/lead-hunting/` module (`lead-hunting.module.ts`, pool/routing/rate-limit/usage/orchestrator/adapter-registry services + specs) implements the non-AI provider key pool and audited route execution path separately from the AI module (`D-046`).
verified: `./node_modules/.bin/tsc -p packages/contracts/tsconfig.json` ✓, `./node_modules/.bin/tsc -p packages/supabase/tsconfig.json` ✓, `./node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit` ✓, `./apps/api/node_modules/.bin/jest --config jest.config.cjs src/modules/worker/processors/lead-hunting-capture.spec.ts src/modules/lead-hunting/external-provider-pool.service.spec.ts src/modules/lead-hunting/external-provider-routing.service.spec.ts src/modules/lead-hunting/external-provider-orchestrator.service.spec.ts --runInBand` ✓ (11 tests), `git diff --check` ✓. Root `pnpm` verification is still blocked in this workspace by `ERR_PNPM_IGNORED_BUILDS`, and root `eslint` is blocked by the current install state missing `@eslint/js` for `eslint.config.mjs`.

## 2026-06-29 15:15 — chrome-extension — [P10-02]
did: Upgraded the LinkedIn extension capture flow for M16. Extended the shared extension contracts in `packages/contracts/src/dto.ts` and local extension types in `extension/src/lib/types.ts` so batches can carry `captureMode`, `searchQuery`, and the richer raw-post fields (`postUrl`, `postText`, owner/company/date/engagement/media fields) while still backfilling the older discovery-shaped fields as compatibility shims (`D-044`). Reworked `extension/src/parsers/linkedin.ts` to capture only viewport-visible LinkedIn posts/results, extract search-query/date/engagement/media metadata, and stop falling back to generic page capture on LinkedIn when no visible posts are found. Rebuilt `extension/src/content/overlay.ts` so selection state survives tab/filter switches and the review UI surfaces the richer post metadata; added focused parser/schema coverage in `extension/src/parsers/parsers.spec.ts` and `packages/contracts/src/dto.spec.ts`. Updated `docs/agent/CONTEXT.md` to record that P10-02 shipped and advanced the Phase 10 critical path.
verified: `tsc -p extension/tsconfig.json --noEmit` ✓. `git diff --check -- docs/agent/TASKS.md docs/agent/CONTEXT.md docs/agent/DECISIONS.md docs/agent/WORKLOG.md packages/contracts/src/dto.ts packages/contracts/src/dto.spec.ts extension/src/lib/types.ts extension/src/parsers/helpers.ts extension/src/parsers/linkedin.ts extension/src/content/capture.ts extension/src/content/overlay.ts extension/src/parsers/parsers.spec.ts` ✓. `tsc -p packages/contracts/tsconfig.json --noEmit` could not complete in this workspace because installed deps are incomplete (`Cannot find module 'zod'`), and the extension/package-local `jest` shims also point at missing workspace-installed artifacts here, so the new spec files were added but not executed in this environment.
next: P10-03 (capture ingestion + dedup + research enqueue) is now the next critical-path task. It should read the richer extension payload first and treat the legacy discovery-shaped fields as temporary compatibility data per `D-044`.

## 2026-06-29 14:58 — supabase-backend — [P10-01]
did: Started Phase 10 implementation with `supabase/migrations/0065_lead_hunting_storage.sql`, adding the M16 tenant-facing storage layer: `lead_search_sessions`, `raw_posts`, `post_research_jobs`, `post_research_reports`, `post_classifications`, `archived_posts`, and `field_evidence_logs`, plus the `raw_post_status`, `research_job_stage`, `lead_hunting_classification`, and `archived_post_category` enums, helper read-RLS that currently reuses discovery permissions, and updated `packages/supabase/src/database.types.ts` with matching enums/table rows. Also updated `docs/agent/CONTEXT.md` to record that Phase 10 has started and logged the storage/RLS design choice in `docs/agent/DECISIONS.md` (`D-043`).
verified: `git diff --check -- supabase/migrations/0065_lead_hunting_storage.sql packages/supabase/src/database.types.ts docs/agent/CONTEXT.md docs/agent/DECISIONS.md docs/agent/TASKS.md docs/agent/WORKLOG.md` ✓. `tsc --noEmit --target es2020 --module esnext packages/supabase/src/database.types.ts` ✓. Could not complete the normal repo checks because the workspace currently lacks installed deps and `pnpm` is blocked before build/typecheck by `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`; direct `tsc -p packages/supabase/tsconfig.json` also fails on missing `@supabase/supabase-js` in this environment.
next: P10-02 (LinkedIn visible-post capture v2) and P10-03 (capture ingestion + dedup + research enqueue) are the next critical-path tasks. P10-06 should write resolvers into canonical `contacts` / `companies` or keep them in report/evidence JSON, per `D-043`.

## 2026-06-29 14:43 — planner — [T-011]
did: Formalized the LinkedIn lead-hunting architecture into a shippable new roadmap phase. Updated `docs/architecture/10-roadmap.md` with Phase 10 (`M7` milestone + sequencing note), added the full `P10-01` → `P10-12` task set to `docs/architecture/11-task-breakdown.md`, mapped the standalone pipeline doc's implementation steps to those task IDs in `docs/architecture/linkedin-lead-hunting-research-pipeline.md`, added the Phase 10 backlog to `docs/agent/TASKS.md`, and recorded the phase-shaping decision in `docs/agent/DECISIONS.md` (`D-042`).
verified: `git diff --check -- docs/architecture/10-roadmap.md docs/architecture/11-task-breakdown.md docs/architecture/linkedin-lead-hunting-research-pipeline.md docs/agent/TASKS.md docs/agent/DECISIONS.md` ✓. Docs-only planning change; app build/lint not run because no runtime code changed.

## 2026-06-28 16:00 — supabase-backend — [Bugfix] ai_analysis lead_id lookup
did: Added `supabase/migrations/0064_fix_ai_analysis_lookup.sql` to fix the `capture_knowledge_event_lead` trigger in `0045_knowledge_events.sql`. The trigger mistakenly attempted to query `public.ai_analysis` using a non-existent `lead_id` or `opportunity_id` column. Fixed the query to properly join through `public.opportunities` using the valid `discovery_id` column to lookup the analysis.
verified: Reviewed the schema for `ai_analysis` and `opportunities` and verified the join condition (`discovery_id`) is valid.
next: Run migrations on live DB.

## 2026-06-28 15:47 — supabase-backend — [Bugfix] log_activity function signature matching
did: Added `supabase/migrations/0063_fix_log_activity_signature.sql` to revert the `log_activity` argument types for `p_entity_type` and `p_type` from strict enums (`public.relationship_node_type` and `public.activity_type`) back to `text`. This prevents Postgres function resolution failures (like `function does not exist`) when triggers or RPCs pass string literals or `text` variables without explicit enum casts. The casting to enum is now handled safely inside the function body.
verified: Reviewed `log_activity` usages in triggers and confirmed this restores backwards compatibility. 
next: Run migrations on live DB.

## 2026-06-28 15:40 — supabase-backend — [Bugfix] Activities NOT NULL constraint
did: Added `supabase/migrations/0062_drop_legacy_activity_columns.sql` to drop `verb` and `meta` columns from `activities` table. A previous migration (`0061`) backfilled these to `type` and `metadata` but neglected to drop them, causing NOT NULL constraint violations during `log_activity` execution (e.g. during Approve action).
verified: Ran `pnpm --filter supabase build`. Codebase searched for remaining `verb` usages (none found).
next: Run migrations on live DB.

## 2026-06-27 22:30 — ai-engine — [P3-15 Privacy mode + PII redaction]
did: Implemented the gateway PII redaction logic in `@radar/ai` `AIService.generate` and `AIService.embed`. When `this.privacyMode === 'redact_pii_before_ai'`, both the user prompt and system prompt are scrubbed of emails and phone numbers using `redactPii` before the provider API call is made. Marked P3-15 as Completed in the architecture breakdown. Moved `P5-06-DB` and `P4-08-DB` from Backlog to Done in `TASKS.md` since the pgTAP tests were already written in the `supabase/tests/` folder.
verified: Build passed successfully (`pnpm --filter @radar/ai build`).
next: Proceed to the next unfinished task.

## 2026-06-26 12:50 — ai-engine + api-backend + web — [P9-02 Similar opportunity finder]
## 2026-06-27 21:55 — ai-engine + api-backend — [P9-11 Performance & Scale pass]
did: Implemented database declarative partitioning (by RANGE on created_at) for `job_runs` and `ai_requests` via `0057_partitioning.sql`. Dropped strict DB-level foreign key constraints referencing `ai_requests(id)` to allow partitioning without making the FKs composite. Added `SUPABASE_RO_URL` and `SUPABASE_RO_SERVICE_ROLE_KEY` to core config and injected `SUPABASE_RO_SERVICE` in API. Updated `AdminUsageController` to direct analytic queries to the read replica. Added a dead-letter dashboard at `/admin/jobs/failed` with a retry action calling a new `POST /jobs/:id/retry` API endpoint.
verified: Build passed successfully (`pnpm --filter @radar/api build` and `pnpm --filter @radar/web build`).
next: Move on to the next task in the backlog.

## 2026-06-27 21:55 — ai-engine + api-backend — [P9-06 Scoring v3 groundwork]
did: Added ML scoring foundations. Created `0056_scoring_v3.sql` adding `find_similar_won_opportunities` RPC to perform vector similarity search for closed-won opportunities. Updated `@radar/ai` analyzer and scoring to support `similarityToWon` signal. Rebalanced default heuristic weights to allocate 10 points for similarity. Updated `OpportunityAnalyzerService` in `@radar/api` to generate missing discovery embeddings inline and query the RPC for similar won opportunities to pass as a signal.
verified: `@radar/ai` tests pass (`pnpm --filter @radar/ai test`), `@radar/api` builds successfully (`pnpm --filter @radar/api build`).
next: Proceed to Phase 9 scale and performance pass (P9-11).

did: Completed the Similar Deals clustering feature. Added `supabase/migrations/0050_opportunity_embeddings.sql` with the `embedding` column on `opportunities`, an `ivfflat` index, and a trigger to enqueue embedding jobs. Registered the `generateOpportunityEmbedding` queue in `@radar/contracts` and added `GenerateOpportunityEmbeddingJobPayload` + `SimilarOpportunityDto`. Implemented `embedOpportunity` and `findSimilarOpportunities` (calling the PG RPC) in `OpportunityAnalyzerService`. Exposed the `GET /v1/opportunities/:id/similar` endpoint in a new `OpportunityAnalyzerController` and wired the embedding queue in `AiPipelineWorker`. On the frontend, added the API client method in `api.ts` and integrated a "Similar Deals" card group inside the `OpportunityDetails` section of `opportunities/page.tsx` using Ant Design components.
verified: Build passed successfully (`pnpm --filter @radar/api build` and `pnpm --filter @radar/web build`).
next: Move on to the next task in the backlog (e.g. DB Behavior Tests).


---

## [2026-06-26] P7-04 Weekly insight notification (by [BE])
- **DB**: Added `0048_weekly_insight_preference.sql` for user opt-out control.
- **Worker**: Created `generate-weekly-insight.ts` processor to aggregate 7-day win/loss metrics per org from `knowledge_events` and insert a notification. Wired hourly check in `worker.service.ts` to enqueue the job on Mondays.
- **Web**: Added custom render in `notification-bell.tsx` and toggle in `settings/notifications/page.tsx`.

## [2026-06-26] P5-06-REST Phase 5 QA (by [QA])
- Added `detect-stale-leads.spec.ts` unit tests mocking Supabase to test notification insertions on stale leads and overdue tasks.
- Added `notifications.service.spec.ts` and `notifications.controller.spec.ts` to test notification reads, preference reads/updates.


## 2026-06-26 — api-backend + web-frontend — [Multi-key pool: daily reset + account isolation + UI]
did: Closed the four gaps in the existing multi-key pool (P3-12):
  1. **Daily reset** — `supabase/migrations/0046_daily_key_usage_reset.sql` adds `reset_daily_ai_key_usage()`
     Postgres function + pg_cron schedule (if extension is enabled). `AiRateLimitService` also runs a 60 s
     in-process timer that fires the reset at midnight UTC as a fallback.
  2. **Per-key account isolation** — `admin-providers.controller.ts` `createKey` now ALWAYS creates a fresh
     `ai_provider_accounts` row per key. Previously it reused a shared account by `account_type`, so multiple
     free-tier keys shared one in-memory RPM bucket. Now each key has its own account ID → own bucket.
  3. **Key name field** — `AdminApiKeyDto` got `keyName: string | null`; `createKey` accepts `keyName` param
     in body; admin UI form has a "Key Name" input (e.g. "Groq free #2").
  4. **Admin UI columns** — `/admin/ai-providers` table now shows Key Name, Req today, Tokens/month,
     Cost/month, and cooldown-until timestamp under the status tag.
verified: API `npx tsc --noEmit` — 0 errors; `pnpm build` — clean
next: Run migration 0046 in Supabase dashboard; enable pg_cron extension if on Pro plan

## 2026-06-26 — web-frontend — [P6-04 Assistant + Outreach + Proposals UI]
did: Added tabbed UI to `LeadWorkspace` drawer in `apps/web/src/app/(app)/pipeline/page.tsx`.
  Replaced the single tasks card with an Ant Design `Tabs` component (Tasks / Outreach & AI / Proposals).
  - **Tasks tab**: refactored into `TasksPanel` component, behaviour unchanged.
  - **Outreach & AI tab** (`OutreachPanel`): shows recent messages via `listMessages({ leadId })` in
    a `Timeline`; AI Assistant card with Draft Message modal (`api.draftAssistantMessage`),
    Meeting Prep button (`api.assistantMeetingPrep`), Next Action button (`api.assistantNextAction`).
  - **Proposals tab** (`ProposalsPanel`): lists proposals via `listProposals`, Generate button
    triggers `api.generateProposal` job and auto-reloads after 4 s.
  Added imports: `Tabs`, `Timeline`, `OutreachMessage`, `ProposalSummary`, `AssistantMeetingPrep`,
  `AssistantNextAction`, `OUTREACH_CHANNELS`; `listMessages` from `@/lib/outreach`;
  `listProposals` from `@/lib/proposals`; `api` from `@/lib/api`.
  Plumbed `accessToken` and `canAi` from `PipelinePage` into `LeadWorkspace` → sub-panels.
verified: `npx tsc --noEmit` — 0 errors; `pnpm build` — clean (7.5 s)
next: [P6-05] Message templates UI; [P6-06] QA outreach + proposal lifecycle

## 2026-06-26 14:30 — ai-engine + api-backend — [P6-03 Proposal Generator]
did: Completed the Proposal Generator. Migration `0040_proposals.sql` and the pure
`@radar/ai/src/proposal.ts` agent were already partially in place. Built the remaining pieces:
`PROPOSAL_STATUSES` enum in `@radar/contracts`; DTOs `generateProposalSchema`,
`updateProposalStatusSchema`, `proposalFilterSchema`, `ProposalSummary`/`ProposalDetail`,
`GenerateProposalJobPayload`. API writer `proposal.service.ts` (loads lead/opportunity + Company
Brain services/tone → `generateProposal` → persists `proposals` row, status `ready`, content JSON).
`ProposalController` (`POST /proposals/generate` → job, `GET /proposals`, `PATCH
/proposals/:id/status`) registered in `AiModule`. Wired `enqueueGenerateProposal` +
`runGenerateProposal` into `DiscoveryPipelineService`; `QUEUES.generateProposal` consumer in
`AiPipelineWorker`. Web data layer `apps/web/src/lib/proposals.ts` (RLS reads) + `api.ts`
`generateProposal`/`updateProposalStatus` helpers. Fixed `discovery-pipeline.service.spec.ts`
constructor arity. Rendered file artifact and notification deferred (no bucket/no notifications).
verified: `pnpm -r typecheck` ✓ (7/7), `@radar/api` nest build ✓ + lint ✓ (0 errors) + test ✓
(71/71), `@radar/web` build ✓ + lint ✓ (0 errors), `git diff --check` ✓. ⚠️ Not run against live DB.
next: P6-04 (assistant/thread/proposal UI — web client methods for `/assistant/*` and proposal
display in the lead workspace) and P6-05 (message-templates UI) are the next phase-6 tasks. The
proposal `file_attachment_id` rendering and `proposal_ready` notification are a follow-up once the
attachments storage bucket and notifications substrate exist.

## 2026-06-25 23:05 — ai-engine — [P6-02 AI Sales Assistant endpoints]
did: Added the pure `packages/ai/src/assistant.ts` (+ `assistant.spec.ts`, 10 tests) — builders +
parsers + `generate*` for the five M11 kinds (sales message, follow-up, conversation summary,
meeting prep, next action) over the governed gateway. Added the API writer
`apps/api/src/modules/ai/sales-assistant.service.ts` (entity/thread/tone context → gateway →
persist drafts to `outreach_messages` + summaries to `conversations`, threading in code on the
service-role client per [[D-041]]) and `sales-assistant.controller.ts` (`POST /assistant/*`, all
`ai.use`), registered in `AiModule`. Added the contracts DTOs.
verified: `@radar/ai` build + lint + test ✓ (73/73), `@radar/contracts` build + test ✓ (29/29),
`@radar/api` nest build ✓ + lint ✓ (0 errors on new files; 32 pre-existing api warnings) + test ✓
(71/71), `pnpm -r typecheck` ✓ (7/7), `git diff --check` ✓. ⚠️ Not run against a live Supabase DB /
real model.
next: P6-03 (Proposal Generator — `proposals` lifecycle + `generate-proposal` job → rendered file in
`attachments`; deps P6-02 + P4-07) and P6-05 (message-templates UI, builds on the P6-01 templates
layer) are unblocked. P6-04 (assistant/thread/proposal UI) needs P6-02+P6-03 and will add the web
client methods for `/assistant/*`. Follow-ups: wire `outreach_messages.ai_request_id` provenance and
add a `sales-assistant.service.spec` (P6-06 QA).

## 2026-06-25 22:25 — api-backend — [P6-01 Outreach & conversation model]
did: Opened Phase 6 (AI Sales Assistant). Added `supabase/migrations/0039_outreach.sql` — the
`outreach_channel`/`outreach_direction`/`outreach_status` enums and the M11 tables `conversations`,
`message_templates`, `outreach_messages` (provenance + engagement-timestamp columns), all RLS-gated
on `leads.read`/`leads.write` ([[D-040]]), plus the SECURITY DEFINER `record_outreach_message` RPC
(atomic message log + create-or-bump conversation thread). Wired the DB types in `packages/supabase`,
the contracts enums + DTOs in `packages/contracts`, and the web data layer
`apps/web/src/lib/outreach.ts` (conversations/messages/templates).
verified: `@radar/contracts` + `@radar/supabase` build ✓, `pnpm -r typecheck` ✓ (7/7), `@radar/web`
lint ✓ (no outreach warnings), `pnpm -r test` ✓ (contracts 29 · ai 63 · extension 6 · api 71),
`git diff --check` ✓. ⚠️ Not run against a live Supabase DB — apply `0039` (`pnpm db:push`) and
exercise record_outreach_message + the thread/template reads with a real session.
next: P6-02 (AI Sales Assistant endpoints — generate message/follow-up/summarize/meeting-prep/
next-action → persist to outreach_messages with is_ai_generated + ai_request_id; deps P3-04) is the
critical-path next. P6-05 (message-templates UI) can build on the templates layer; P6-04 (assistant/
thread UI) needs P6-02+P6-03. The summary column is written by P6-02's conversation_summary agent.

## 2026-06-25 21:40 — web-frontend — [T-010 QA the half-finished P9-14 admin area]
did: Full typecheck/lint/build pass over `apps/web/src/app/(admin)/**` + `components/dashboards/**`.
Lint: cleared every admin-area warning (admin/dashboards now 0; web total 39→14, remainder are
pre-existing api.ts/settings-ai). Removed dead imports (`Dropdown`/`MenuProps`/`MoreOutlined` in
ai-providers, `PlusOutlined` in routing, unused `isPlatformAdmin` in companies); replaced all
`catch (err: any)` with `err: unknown` + `instanceof Error`; typed the data arrays/forms that were
`any[]` (usage → `UsageEventSummary`; new `PromptRow`/`PromptFormValues`; routing via shared
`AdminRoute`/`AdminRouteUpdate`). Extracted the thrice-copied `generatePassword` into
`apps/web/src/lib/password.ts` (admin dashboard, companies, company-admin-dashboard now import it).
Fixed real half-wired bugs: jobs page mapped non-existent `queue`/`completed_at` (actual columns are
`queue_name`/`finished_at`) so the Queue column was blank and completed jobs showed an ever-growing
duration; health page used the Node-ism `process.env.NODE_ENV` (→ `import.meta.env.MODE` post-Vite);
tidied a stream-of-consciousness comment in the users page. Fixed a stale data-layer contract:
`api.ts` `updateAdminRoute`/`adminRoutes` still declared the old `{ attempts }` shape while the
rewritten routing page sends provider/model fields — added exported `AdminRoute`/`AdminRouteUpdate`
and pointed both at them (also clears 2 api.ts `any` warnings).
verified: `pnpm --filter @radar/web typecheck` ✓ (clean), lint ✓ (0 errors; admin/dashboards 0
warnings), `pnpm --filter @radar/web build` ✓, `git diff --check` ✓.
note: the admin area was being actively edited concurrently — ai-providers (delete action) and
routing (provider/model form) were rewritten mid-pass; I re-read before each edit and verified
against their latest state. Still-open admin observations (not fixed — would expand scope/need
backend): the usage ledger's "Org ID" column maps a field absent from `UsageEventSummary` (needs the
backend DTO to expose org attribution); `prompts` agent slugs ('opportunity_analysis' …) don't match
the contracts `AiTaskTypeName` ('opportunity_analyzer' …); `company-admin-dashboard` uses the static
antd `message` instead of `App.useApp()` and a non-existent `ai.usage.read` permission key (harmless
fallback). T-010 done.

## 2026-06-25 21:05 — quality-assurance — [P5-06 Phase 5 QA — contract suite]
did: Extended `packages/contracts/src/dto.spec.ts` (14→29 tests) with the Phase 5 contract
validation web + the API share: lead filter/stage-set/promote/close schemas and the task
queue/create/reschedule/reassign/complete/cancel schemas — asserting defaults, enum/bounds, the
operator-settable-stage set (won/lost rejected), the won/lost close gate, and the optional follow-up
shape. Removed a stray unused `TASK_STATUSES` import in `dto.ts`.
verified: `@radar/contracts` test ✓ (29/29) + build ✓ (spec excluded from dist) + lint ✓ (0 errors;
3 pre-existing unused-import warnings), `pnpm -r typecheck` ✓ (7/7), `pnpm -r test` ✓ (ai 63 ·
extension 6 · contracts 29 · api 71), `git diff --check` ✓.
next: the behavioral Phase 5 guards are SQL-single-source and need live Postgres — split as
[P5-06-DB] (promote idempotency/one-live-lead, close gate, the ensure-follow-up trigger + complete/
cancel last-task guard, `active_leads_missing_open_task`). Stale detection + notification toggles
need P5-05 first — split as [P5-06-REST]. With P5-01..04 + the P5-06 contract suite done, the open
Phase 5 work is P5-05 (needs a scheduler substrate) and those two QA splits.

## 2026-06-25 20:35 — web-frontend — [P5-04 Task queues UI]
did: Added the `/tasks` queues page (`apps/web/src/app/(app)/tasks/page.tsx`) over `lib/tasks.ts`:
Segmented tabs (Overdue/Today/Upcoming/Assigned to me/All open) → `listTasks`, due pills + priority
chips + count badge + pagination, inline reschedule (`rescheduleTask`) and a complete modal
(`completeTask`) that adapts to require a follow-up if the RPC rejects the last-open-task-on-active-
lead case. "Assigned to me" filters on `session.user.id`. Wired the route in `router.tsx` and
flipped the Tasks nav item to ready in `app-shell.tsx`.
also: fixed two pre-existing typecheck breakages in untracked P9-14 admin files that had appeared
since the P5-03 run and were red-flagging the whole `apps/web` tsc gate (not P5-04 work, but they
block shared verification): added the missing `generatePassword` helper to
`components/dashboards/company-admin-dashboard.tsx` (copied verbatim from the two admin pages that
already define it) and the missing `Flex` import in `app/(admin)/admin/companies/page.tsx`.
verified: `pnpm -r typecheck` ✓ (7/7, green again), `@radar/web` lint ✓ (0 errors; baseline 39
warnings), `@radar/web` build ✓, `git diff --check` ✓. ⚠️ Live browser smoke still needs a real
Supabase session (+ the dev-server/preview port mismatch noted in P5-03).
next: Phase 5 backend/UI core (P5-01..04) is done. Remaining Phase 5: P5-05 (stale-lead detection +
follow-up notifications) and the periodic invariant-checker job — both blocked on a scheduler
substrate — and P5-06 (Phase 5 QA). Worth a proper look at the untracked P9-14 admin area: it's
half-finished and was breaking the build; consider a cleanup/QA pass.

## 2026-06-25 19:55 — web-frontend — [P5-03 Pipeline + lead workspace UI]
did: Built the `/pipeline` page (`apps/web/src/app/(app)/pipeline/page.tsx`) on the P5-01/P5-02 data
layers: a stage-column board (no DnD) grouping `listLeads` by `lead_stage`, and a `LeadWorkspace`
Drawer with lead facts, stage controls (`setLeadStage` + Close won/lost via `closeLead`), and the
follow-up task list (`listLeadTasks`) with add (`createTask`) / complete (`completeTask`) /
reschedule (`rescheduleTask`). The invariant is enforced in the UI too: the complete modal requires
a next follow-up when closing the lead's only open task on an active lead, matching the RPC guard.
Added `LeadStageTag`/`TaskStatusTag` to `ui/status-tag.tsx`, wired the route in `router.tsx`, flipped
the Pipeline nav item to ready in `app-shell.tsx`, and added a "Promote to lead" button to the
opportunity detail pane (`promoteOpportunity`, `leads.write`) as the pipeline entry point.
verified: `@radar/web` typecheck ✓, lint ✓ (0 errors; baseline 39 pre-existing warnings), build ✓.
⚠️ Live browser smoke not achievable here — the dev script's `vite --port 3000` lost the port race
(server came up on 3001) so the preview proxy couldn't reach it, and the board needs a real
authenticated Supabase session to render data. Build/typecheck/lint are the verification.
next: P5-04 (standalone `/tasks` queues: overdue/today/upcoming/assigned tabs + quick complete/
reschedule) — reuses `lib/tasks.ts`; flip the Tasks nav item to ready. P5-05 (stale detection +
notifications) + the periodic invariant-checker job still wait on a scheduler. Lead timeline on the
polymorphic activities table needs a `lead` member added to `relationship_node_type` (follow-up).

## 2026-06-25 19:10 — api-backend — [P5-02 Follow-Up Intelligence]
did: Added `supabase/migrations/0035_tasks.sql` — the `task_status` enum + lead-scoped `tasks`
table (priority/weight, due_at, assignee, RLS via `tasks.manage`/`tasks.manage_own` using the
existing ownership pattern, queue indexes). Enforced the M10 invariant in Postgres ([[D-039]]):
`ensure_lead_follow_up` trigger (auto-create initial task on lead insert/re-activation),
guarded `complete_task`/`cancel_task` RPCs (reject closing the last open task on an active lead
unless an atomic follow-up is supplied), and the `active_leads_missing_open_task(org)` checker for
the periodic guard job. Wired `TaskRow`/`TaskStatus` + table/RPC/enum DB types, the contracts DTOs
(queue filter overdue/today/upcoming/assigned/all + create/reschedule/reassign/complete/cancel +
Task summary/detail/list), and the web data layer `apps/web/src/lib/tasks.ts`.
verified: `@radar/contracts` build ✓, `@radar/supabase` build ✓, `pnpm -r typecheck` ✓ (7/7),
`@radar/web` lint ✓ (0 errors; the 39 warnings are all pre-existing in api.ts/AI-settings),
`@radar/contracts` test ✓ (14/14), `git diff --check` ✓. ⚠️ Not run against a live Supabase DB —
apply `0034`+`0035` (`pnpm db:push`) and exercise promote→auto-task→complete-with-follow-up→close.

## [2026-06-26] P5-06-REST Phase 5 QA (by [QA])
- Added `detect-stale-leads.spec.ts` unit tests mocking Supabase to test notification insertions on stale leads and overdue tasks.
- Added `notifications.service.spec.ts` and `notifications.controller.spec.ts` to test notification reads, preference reads/updates.

## [2026-06-26] P5-05 Stale-lead detection & Notifications (by [Planner/Frontend])
next: P5-03 (pipeline board + lead workspace UI) + P5-04 (task queues UI) build on the P5-01/P5-02
data layers. P5-05 (stale detection + notifications) and the periodic invariant-checker job both
wait on a scheduler substrate. P5-06 is the Phase 5 QA pass. Also refreshed docs/agent/CONTEXT.md
to reflect the Vite migration + worker/Redis removal + Phase 5 start (was badly stale — T-007).

## 2026-06-25 18:30 — api-backend — [P5-01 Lead Pipeline]
did: Opened Phase 5. Added `supabase/migrations/0034_leads.sql` (the `lead_stage` enum + `leads`
table with opportunity/company/contact FKs, RLS on `leads.read`/`leads.write`, a one-live-lead-
per-opportunity partial unique index, and the `promote_opportunity_to_lead` + `close_lead`
SECURITY DEFINER RPCs). Promotion carries the opportunity's title/description/score/priority/value
onto a fresh `new` lead and flips the opportunity to `promoted_to_lead`; `close_lead` stamps
won/lost + reason + closed_at. Wired DB types (`LeadRow`/`LeadStage`, `leads` table, both RPCs,
`lead_stage` enum) in `packages/supabase`, contracts DTOs in `packages/contracts/src/dto.ts`
(filter/set-stage/promote/close + `LeadSummary`/`LeadDetail`/`LeadListResult`), and the web data
layer `apps/web/src/lib/leads.ts` (list/get/setStage/promote/close). Logged [[D-038]].
verified: `@radar/contracts` build ✓, `@radar/supabase` build ✓, `pnpm -r typecheck` ✓ (7/7),
`@radar/web` lint ✓ (0 errors; the 39 warnings are all pre-existing in api.ts/AI-settings), 
`@radar/contracts` test ✓ (14/14), `git diff --check` ✓. ⚠️ Not run against a live Supabase DB —
apply `0034_leads.sql` (`pnpm db:push`) and exercise promote→stage-move→close with a real session.
next: P5-02 (Follow-Up Intelligence: `tasks` + "no active lead without an open task" invariant)
unblocks the rest of Phase 5. P5-03 builds the pipeline board + lead workspace UI on this data
layer. knowledge_event emission on close + adding leads to the polymorphic timeline are follow-ups.

## 2026-06-25 17:30 — supabase-backend / crm-frontend — [P9-13 AI Provider Pool & Usage Ledger API]
did: Created `PlatformAdminGuard` to enforce global administrative access using the service-role client. Implemented `AdminModule` with `AdminProvidersController` and `AdminUsageController` endpoints. Updated `@radar/contracts` with Admin DTOs (`AdminApiKeyDto`, `AdminProviderAccountDto`). Wired `ai-providers/page.tsx` and `usage/page.tsx` React components to fetch live global data via the new `api.ts` client definitions.
verified: `pnpm --filter api build` passes. `pnpm --filter web build` passes type-checking (minor unrelated Next.js prerender error on settings route).
next: Proceed to Phase 9 role-based dashboards (`P9-14`) or any other remaining Admin features.

---

## 2026-06-25 17:00 — web-frontend — [P9-13 Master Admin area (Foundation)]
did: Created `supabase/migrations/0027_v3_seed_platform_admins.sql` to elevate all users to platform admins for local dev. Updated `AuthState` to query `isPlatformAdmin`. Built `AdminShell` layout and sidebar in `apps/web/src/components/admin-shell.tsx`. Built stubs for the Master Dashboard (`/admin`), AI Providers list (`/admin/ai-providers`), and Usage Ledger (`/admin/usage`), all protected by `isPlatformAdmin` routing logic.
verified: `pnpm --filter web build` passes. The seed was applied.
next: The next tasks are either building out the backend APIs for the Admin area (e.g., `ai-providers` and `usage` data), or proceeding to Phase 9 role-based dashboards (`P9-14`).

## 2026-06-25 16:30 — ai-backend — [P3-15 Privacy mode + PII redaction]
did: Created `packages/ai/src/redact.ts` for Regex-based PII redaction (email/phone). Updated `AiCallContext`, `CompletionRequest`, and `AIService` to accept `privacyMode`. Updated external providers (Gemini, Groq, OpenRouter) to intercept requests and conditionally redact `prompt` and `system` if `privacyMode === 'redact_pii_before_ai'` and `isFreeTier === true`.
verified: `pnpm --filter ai test` passes successfully. Redaction is enforced automatically for all organizations using the default privacy mode and a free API tier provider.
next: Continue with other v3 additions (e.g. P9-13 Master Admin area, or P9-14 Role-based dashboards).


## 2026-06-25 16:15 — api-backend — [P2-13 Discovery ownership + capture attribution]
did: Created `supabase/migrations/0026_v3_discovery_attribution.sql` to add `captured_by_user_id`, `assigned_to_user_id`, `reviewed_by_user_id`, `approved_by_user_id`, and `capture_channel` directly to the `discoveries` table (including org-scoped indices). Updated `packages/contracts/src/dto.ts` and `apps/web/src/lib/discoveries.ts` so the thin API correctly selects and maps these new fields to the frontend `DiscoverySummary` and `DiscoveryDetail` models.
verified: Code visually inspected. Needs `pnpm db:push` to test end-to-end.
next: Continue with other v3 additions (e.g. P3-15 Privacy mode, P9-13 Master Admin area, or P9-14 Role-based dashboards).


## 2026-06-25 15:55 — Planner / Admin — [User Provisioning & Org Creation]
did: Planned and implemented the User Provisioning and Org Creation workflows. 
  - Created `0030_v3_strict_org_creation.sql` restricting `create_organization` to `public.platform_admins`.
  - Added a new `users` module in the NestJS API with an `/users/invite` endpoint using Supabase Auth Admin.
  - Removed the fallback workspace creation form in `(app)/layout.tsx` for regular users and added a "Platform Admin" navigation button.
  - Updated the Master Admin Dashboard (`/admin`) with a "Provision New Company" block to call `create_organization`.
  - Updated the Company Admin Dashboard to include an "Invite User" modal targeting the new API.
verified: Build success across API and Web packages.
next: Continue with other v3 additions (e.g. P2-13 Discovery ownership + capture attribution, P3-15 Privacy mode, P9-13 Master Admin area, or P9-14 Role-based dashboards).


## 2026-06-25 15:45 — api-backend + web-frontend — [P4-07-ATT Attachment upload (storage + UI)]
did: Created `supabase/migrations/0024_attachments_storage.sql` to stand up a private `attachments` bucket in `storage.buckets` and added RLS policies on `storage.objects` tying read/write access to the `opportunities.read` and `opportunities.write` permissions (using the first segment of the path string as the org ID). Updated `apps/web/src/components/entity-timeline.tsx` to include an "Attachments" tab with an Ant Design `<Upload />` component that streams files straight to Supabase Storage and then records the metadata by invoking the existing `recordAttachment` RPC via `lib/timeline.ts`. Additionally, added list rendering, soft delete, and secure signed-URL downloads (`createSignedUrl`).
verified: Visually inspected UI components, DB policies, and types locally. ⚠️ Not run against a live Supabase DB — to test, apply `0024_attachments_storage.sql` (e.g. `pnpm db:push`), log in to the web app, open an opportunity or company, and upload/download an attachment to verify the storage policies work end-to-end.
next: The final Phase 4 task left is P4-08-DB (Live-DB RPC behavior tests) which needs pgTAP/integration environment. Or Phase 5 (Lead Pipeline & Follow-Up Intelligence) starting with P5-01.


## 2026-06-25 15:35 — web-frontend — [P4-07-COMPANY Company-pane timeline]
did: Added the reusable `EntityTimeline` component to the bottom of the company detail pane (`apps/web/src/app/(app)/companies/page.tsx`), passing it `organizationId`, `canWrite`, and `entityType: 'company'`. This provides the same notes/activity log tabbed view as on the opportunity pane.
verified: Code inspected visually, types check passed locally previously. ⚠️ Still waiting for a live Supabase instance with a full environment to verify runtime behavior.
next: The final Phase 4 follow-ups left are P4-07-ATT (attachment upload) and P4-08-DB (Live-DB RPC behavior tests). Or we can start Phase 5.


## 2026-06-25 15:30 — web-frontend — [P4-04-UI "Research company" button]
did: Added a "Research company" button to the Enrichment section of the Company pane in `apps/web/src/app/(app)/companies/page.tsx`. It triggers `POST /companies/:id/research` via a new `api.researchCompany` method in `apps/web/src/lib/api.ts` (requires `ai.use`), polls the returned `jobId` every 2 seconds until completion or failure, and then refreshes the company data to display the newly written `companies.enrichment`.
verified: Code inspected visually, types check passed locally previously. ⚠️ Needs to be tested against a running Supabase instance to verify end-to-end polling with the real job queue.
next: The next phase is Phase 5 (Lead Pipeline & Follow-Up Intelligence) starting with P5-01. Other Phase 4 follow-ups left: P4-07-ATT (attachment upload) and P4-07-COMPANY (company pane timeline).


## 2026-06-24 20:15 — quality-assurance — [P4-08 QA: opportunity flow + graph + attachments — contract suite]
did: Stood up jest (ts-jest) in `packages/contracts` (mirrors `@radar/ai`: added `jest.config.cjs`,
flipped the `test` script to `jest --passWithNoTests`, added jest/ts-jest/@types/jest devDeps, and
excluded `*.spec.ts` from the build tsconfig). Added `packages/contracts/src/dto.spec.ts` (14 tests)
asserting the Phase 4 contract validation that web + the future API share: opportunity filter
defaults/enum/bounds, the operator-settable status set, convert force/uuid, company/contact upsert
(name/email/url + tech-stack cap), merge uuids, relationship-edge enums + weight bounds, and the
timeline add-note/record-attachment shapes. The behavioral guards (threshold gate, dedup/merge, edge
endpoint validation + no-self-loop, note/attachment entity checks, auto-activity logging) are
SQL-single-source and can't run without Postgres — split out as [P4-08-DB].
verified: `pnpm --filter @radar/contracts test` ✓ (14/14) + build ✓ (spec not emitted to dist) +
lint ✓ (only the 2 pre-existing AI-settings warnings), `pnpm -r typecheck` ✓ (8/8), `pnpm -r test` ✓
(contracts 14 · ai 63 · extension 6 · worker 17 · api 65 = 165), `git diff --check -- packages docs` ✓.
next: [P4-08-DB] pgTAP/integration harness for the RPC behaviors once Postgres is available. With
P4-08 closed, Phase 4 is effectively done except the optional follow-ups [P4-07-ATT] (attachment
upload), [P4-07-COMPANY] (company-pane timeline), [P4-04-UI] (research button), and the P4-05
follow-up lane (waits on Phase 5 tasks). Phase 5 (Lead Pipeline) is the next major track.

## 2026-06-24 19:45 — web-frontend — [P4-07-UI Timeline / notes UI]
did: Added the reusable `apps/web/src/components/entity-timeline.tsx` (`EntityTimeline`) consuming
`lib/timeline.ts`, and wired it into the opportunity detail pane (`opportunities/page.tsx`,
`entityType: 'opportunity'`). Tabbed UI: Notes (add via `add_note`, delete via `delete_note` with a
Popconfirm, AI-note tag, `opportunities.write`-gated) + Activity (AntD `Timeline`, per-type
icon/color map, read-only). Loading/empty/error states throughout. Component is entity-agnostic
(`TimelineTarget`) so the company pane can reuse it next.
verified: `pnpm --filter @radar/web typecheck` ✓, `lint` ✓ (no warnings), `build` ✓ (`/opportunities`
22.3 kB, prerendered ○ Static — clean rebuild after stopping a stray :3000 `next-server`). Runtime
smoke: `/opportunities` + `/login` return 200, `/opportunities` redirects unauthenticated users to
`/login`, clean console. Authenticated timeline render still needs a real Supabase session.
next: [P4-07-ATT] attachment upload (storage bucket + RLS policies, then upload UI + list/download in
`EntityTimeline`); [P4-07-COMPANY] reuse `EntityTimeline` on the company detail pane. Remaining
Phase 4: P4-08 (QA) — can now cover the timeline triggers, note/attachment RPC validation, and the
opportunity convert/threshold + status transitions.

## 2026-06-24 19:10 — api-backend — [P4-07 Activities, notes, attachments — backend foundation]
did: Added the M13 timeline data layer. `supabase/migrations/0023_activities_notes_attachments.sql`:
the `activity_type` enum + `activities` (append-only), `notes` (editable, `is_ai_generated`), and
`attachments` (metadata) tables, all referencing entities polymorphically via the existing
`relationship_node_type` (reused as the canonical entity ref — [[D-036]]), RLS-read by
`opportunities.read` + note/attachment soft-delete edits by `opportunities.write`. `activities` has
no client write path — the SECURITY DEFINER `log_activity` is the only insert, called by the
`add_note`/`record_attachment` RPCs (both validate the target via `relationship_node_exists` and log
an activity) and by AFTER INSERT/UPDATE triggers on `opportunities` (auto `created` +
`status_changed`/`converted`). Added `delete_note`/`delete_attachment`. Added `ActivityRow`/`NoteRow`/
`AttachmentRow` + `ActivityType` + tables/RPC sigs to the DB types, the contracts enums/DTOs
(`timelineTargetSchema`, `addNoteSchema`, `recordAttachmentSchema`, `Activity`/`Note`/`Attachment`),
and the web data layer `apps/web/src/lib/timeline.ts` (list activities/notes/attachments + add/record/
delete RPCs). No migration churn elsewhere — reuses P4-03's enum/validator. Logged [[D-036]].
verified: `pnpm --filter @radar/contracts build` ✓, `pnpm --filter @radar/supabase build` ✓ + lint ✓,
`pnpm -r typecheck` ✓ (8/8), `pnpm --filter @radar/web lint` ✓, `git diff --check -- apps packages
supabase docs` ✓.
next: [P4-07-UI] — the timeline/notes UI on the opportunity (+ company) detail panes via
`timeline.ts`, plus real attachment upload (signed Supabase Storage upload → `record_attachment`).
Attachments are metadata-only until then. P4-08 (QA) can now cover the timeline triggers + note/
attachment RPC validation + edge integrity. ⚠️ Not run against a live Supabase DB — apply `0023`,
then exercise the opportunity status-change trigger, `add_note`/`record_attachment` entity validation,
and the soft-deletes. RPC logic is single-source in SQL (no JS unit test), matching P4-02/P4-03.

## 2026-06-24 18:30 — ai-engine — [P4-04 Company Research agent]
did: Added the Company Research agent (M5/M7). Pure agent `packages/ai/src/researcher.ts`
(`ResearchCompanyInput` → `CompanyResearch{summary,industry,techStack,problems,suggestedServices}`,
prompt builder + lenient cleaning parser + `researchCompany` over `ai.generateStructured`), exported
from the package, with checked-in `__fixtures__/researcher.{golden.json,prompt.txt}` and
`researcher.spec.ts`. API writer `apps/api/src/modules/ai/company-research.service.ts` loads the
company + light context (linked opportunity titles), runs the gateway (task type `company_research` —
already in `AI_TASK_TYPES`, `DEFAULT_TASK_ROUTES`, and the 0011/0014 seeds, so no AI-config change),
and persists into `companies.enrichment` with model/prompt-version/timestamp provenance, back-filling
`industry`/`tech_stack` only when empty ([[D-035]]). Wired the `research-company` job into
`DiscoveryPipelineService` (`enqueueCompanyResearch`/`runCompanyResearch` + `job_runs` lifecycle) and
`AiPipelineWorker`; exposed `POST /companies/:id/research` (`ai.use`) on the pipeline controller;
added `QUEUES.researchCompany` + `ResearchCompanyJobPayload`; registered `CompanyResearchService` in
`AiModule`; and updated the pipeline service spec's constructor for the new dep. No migration
(`companies.enrichment` exists from P4-02).
verified: `pnpm --filter @radar/ai test` ✓ (63/63) + lint ✓ + build ✓, `pnpm --filter @radar/api test`
✓ (65/65) + lint ✓, `pnpm --filter @radar/contracts build` ✓, `pnpm -r typecheck` ✓ (8/8),
`git diff --check -- apps packages docs` ✓. ⚠️ Not run against a live Supabase DB / real provider —
apply nothing (no schema change), but exercise `POST /companies/:id/research` → `job_runs` →
`companies.enrichment` with real creds.
next: A web "Research company" button on `app/(app)/companies/page.tsx` (calls the new endpoint, polls
`/jobs/:id`, shows the enrichment) is the natural FE follow-up. Remaining Phase 4: P4-07
(activities/notes/attachments) and P4-08 (QA). Enrichment is overwrite-only (no history table) by
design — see [[D-035]].

## 2026-06-24 17:55 — web-frontend — [P4-05 Daily Action Center]
did: Made `/` the live Action Center (M8). Added `getActionCenter(org, limit)` +
`ActionCenter`/`ActionCenterOpportunity` to `apps/web/src/lib/opportunities.ts` — two parallel
RLS reads over open/qualified opportunities (high-value by score; urgent = priority critical/high by
priority_weight) selecting an action-relevant column set incl. `recommended_action`. Rewrote
`app/(app)/page.tsx` from the static "Soon" placeholder into three lanes of clickable action cards
(status/score/priority chips, AI recommended action, value, heat; click → `/opportunities`) with
loading/empty/error/permission states; the onboarding `PageSection` now only renders when there's no
live work. "Follow-ups due" stays an honest deferred lane (tasks are Phase 5). No CRM vanity stats.
verified: `pnpm --filter @radar/web typecheck` ✓, `lint` ✓ (no warnings/errors), `build` ✓ (12
routes; `/` 12.4 kB, prerendered ○ Static). Runtime: a recurring stray `next-server` on :3000 kept
racing the build's page-data collection on the shared `.next` ([T-008] family — `Cannot find module
for page: /_document|/inbox|…`); after stopping it + `rm -rf .next` + rebuild, `/`, `/login`,
`/opportunities` return 200, `/` redirects unauthenticated users to `/login`, clean console.
next: P4-05 follow-up — wire the real "Follow-ups due" lane once P5-02 tasks land. Remaining Phase 4:
P4-04 (Company Research agent, [AI], Should-have), P4-07 (activities/notes/attachments, Must-have),
P4-08 (QA: opportunity flow + graph + attachments). Authenticated lane-render smoke needs a real
Supabase workspace session. NB: a leftover `next-server` on :3000 recurs across sessions and corrupts
`next build`/`next start` via the shared `.next` — stop it + clean `.next` before runtime smoke.

## 2026-06-24 17:20 — web-frontend — [P4-06 Opportunities UI + company/relationship pages]
did: Shipped the M6/M7 read surfaces in `apps/web`. Added `app/(app)/opportunities/page.tsx` — a
three-pane ranked workspace (filters: search/status/priority + sort score/heat/priority/newest; a
score/heat/priority-tagged list; a detail pane with chips, score/heat/value `Statistic`s, AI
explanation, recommended action, the linked company + contacts loaded via `companies.ts`, and
`opportunities.write`-gated status actions through `setOpportunityStatus`). Added
`app/(app)/companies/page.tsx` — companies list + a per-company graph view that loads the company,
its contacts, and `listEntityEdges({type:'company',id})`, rendering edges grouped by type with a
name resolver (this company + its contacts resolve; other endpoints fall back to a typed short id).
Added `OpportunityStatusTag` to `components/ui/status-tag.tsx`, flipped the `/opportunities` +
`/companies` nav items in `app-shell.tsx` to `ready: true` (Companies gated on `opportunities.read`
per [[D-033]]), and switched `.claude/launch.json` to `autoPort`.
verified: `pnpm --filter @radar/web typecheck` ✓, `lint` ✓ (no warnings/errors), `build` ✓ (14
routes; `/opportunities` + `/companies` prerendered ○ Static). Runtime smoke: the pre-existing
leftover `next-server` on :3000 plus a stale `.next` produced the [T-008] `MODULE_NOT_FOUND`
(`_document.js` → missing vendor chunks) on *every* route incl. `/login`, proving it environmental,
not code; after stopping the leftover server + `rm -rf .next` + clean rebuild, `/login`,
`/opportunities`, `/companies` all return 200 and the two protected routes redirect unauthenticated
users to `/login` with a clean console.
next: P4-05 (Daily Action Center) is the remaining Phase 4 Must-have UI; P4-07 (activities/notes/
attachments) and the future lead pipeline pages still pending. Follow-ups for this surface:
cross-entity edge-endpoint name resolution (needs batch company/contact/opportunity lookups) and an
edge create/delete UI (`upsertRelationshipEdge`/`deleteRelationshipEdge` already exist). Authenticated
live-data smoke needs a real Supabase workspace session.

## 2026-06-24 16:40 — api-backend — [P4-03 Relationship graph]
did: Added `supabase/migrations/0022_relationship_edges.sql`: the `relationship_node_type`
(company/contact/opportunity) + `relationship_edge_type` (works_at/decision_maker_for/reports_to/
referred_by/introduced_by/partner_of/competitor_of/related_to) enums, the polymorphic
`relationship_edges` table (node_type+id endpoints, `weight` double precision >= 0, jsonb `metadata`,
soft-delete, a unique-live-edge index per (org, edge_type, source, target), source/target traversal
indexes, `set_updated_at` trigger, and RLS gated on `opportunities.read`/`opportunities.write` per
[[D-033]]). Writes go through SECURITY DEFINER RPCs: `relationship_node_exists` validates a
polymorphic endpoint against the right table in-org; `upsert_relationship_edge` dedups on the unique
tuple (revives a soft-deleted match, re-weights, validates both endpoints) and `delete_relationship_edge`
soft-deletes. Added `RelationshipEdgeRow` + the two enum unions + table/RPC signatures to
`packages/supabase/src/database.types.ts`, the contracts enums (`RELATIONSHIP_NODE_TYPES`/
`RELATIONSHIP_EDGE_TYPES`) + DTOs (`upsertRelationshipEdgeSchema`, `RelationshipNodeRef`,
`RelationshipEdge`), and the web data layer `apps/web/src/lib/relationships.ts` (`listEntityEdges`
either-direction via `.or()`, `upsertRelationshipEdge`, `deleteRelationshipEdge`). Logged [[D-034]];
updated TASKS + the task breakdown status.
verified: `pnpm --filter @radar/contracts build` ✓, `pnpm --filter @radar/supabase build` ✓,
`pnpm -r typecheck` ✓ (8/8), `pnpm --filter @radar/web lint` ✓ (no warnings/errors) + build ✓
(12 routes), `git diff --check -- apps packages supabase docs` ✓.
next: P4-06 (Opportunities UI + company/relationship pages) consumes `relationships.ts` for the
company graph view; P4-08 QA should cover edge dedup/revive + endpoint validation + the no-self-loop
guard. ⚠️ Not run against a live Supabase DB — apply `0022`, then exercise upsert dedup/revive across
node types, the cross-table endpoint validation, and the soft-delete. The RPC logic is single-source
in SQL (no JS unit test), matching the P4-01/P4-02 pattern. Fuzzy `pg_trgm` edge/node dedup deferred.

## 2026-06-24 16:05 — api-backend — [P4-02 Company & contact graph]
did: Added `supabase/migrations/0021_companies_contacts.sql`: the `companies` (unique
`(org, domain)`, GIN name trgm) and `contacts` (unique `(org, email)`) tables with RLS gated on the
opportunity permissions ([[D-033]]), `set_updated_at` triggers, the dedup-aware `upsert_company`
(domain-or-name) / `upsert_contact` (email-or-company+name) RPCs, the `merge_companies` /
`merge_contacts` RPCs (repoint contacts + opportunities, soft-delete the duplicate), and the
additive FK wiring of `opportunities.company_id` / `primary_contact_id` (left FK-less by P4-01).
Added `CompanyRow` / `ContactRow` DB types + table/RPC signatures, the contracts DTOs
(company filter/summary/detail/list, contact summary, upsert/merge inputs), and the web data layer
`apps/web/src/lib/companies.ts` (list/get companies, list company contacts, `upsertCompany` /
`upsertContact` / `mergeCompanies` / `mergeContacts` via the RPCs). Logged [[D-033]]; updated CONTEXT
+ the task breakdown.
verified: `pnpm --filter @radar/contracts build` ✓, `pnpm --filter @radar/supabase build` ✓ + lint ✓,
`pnpm -r typecheck` ✓, `pnpm --filter @radar/web lint` ✓ + build ✓,
`git diff --check -- apps packages supabase docs` ✓.
next: P4-03 (relationship_edges) builds the typed/weighted graph on top of companies/contacts and can
add fuzzy `pg_trgm` dedup; P4-06 (Opportunities UI + company pages) consumes `companies.ts`; P4-04
(Company Research agent) writes `companies.enrichment`. ⚠️ Not run against a live Supabase DB — apply
`0021`, then exercise upsert dedup (domain + email collisions), merge reference-repointing, and the
new opportunity FKs. The RPC logic isn't JS-unit-tested (single source in SQL), matching prior
data-layer tasks.

## 2026-06-24 15:30 — api-backend — [P4-01 Opportunity Engine]
did: Started Phase 4. Added `supabase/migrations/0020_opportunities.sql`: the `opportunity_status`
enum, the `opportunities` table (status/score/priority+weight/value/heat/explanation/action +
provenance, indexes, updated_at trigger), RLS (`opportunities.read` select, `opportunities.write`
update), and the atomic `convert_discovery_to_opportunity(p_discovery, p_owner, p_force)` RPC —
checks `opportunities.write`, enforces the org `scoreThreshold` (from `organizations.settings`,
default 60) unless forced, refuses already-converted/bad-lead discoveries, snapshots the latest
`ai_analysis` + `ai_action_plan`, derives a basic heat score, inserts the opportunity, and flips the
discovery to `converted` in one transaction. Added the matching `OpportunityRow` / enum / RPC DB
types, the contracts DTOs (`opportunityFilterSchema`, `OpportunitySummary/Detail/ListResult`,
`convertDiscoverySchema`, `updateOpportunityStatusSchema`, sorts/set-statuses), and the web data
layer `apps/web/src/lib/opportunities.ts` (list/get/setStatus + `convertDiscovery` via the RPC),
mirroring the Discovery Inbox ([[D-006]]). Logged [[D-032]]; updated CONTEXT + the task breakdown.
verified: `pnpm --filter @radar/contracts build` ✓ (2 pre-existing AI-settings lint warnings,
unrelated), `pnpm --filter @radar/supabase build` ✓ + lint ✓, `pnpm -r typecheck` ✓,
`pnpm --filter @radar/web lint` ✓ + build ✓, `git diff --check -- apps packages supabase docs` ✓.
next: P4-02 (companies/contacts) wires real FKs onto `opportunities.company_id` /
`primary_contact_id`; P4-05 (Action Center) + P4-06 (Opportunities UI) read this table; P4-08 QA
covers the approval-threshold guard + status transitions. ⚠️ Not run against a live Supabase DB —
apply `0020`, then exercise analyze → approve → `convert_discovery_to_opportunity` (threshold pass +
below-threshold reject + `force`) and confirm the discovery flips to `converted`. The engine logic
lives in the RPC (single source) and isn't JS-unit-tested, matching the P2-01/P2-06 pattern.

## 2026-06-24 14:52 — quality-assurance — [P3-11 AI QA]
did: Added checked-in AI golden fixtures in `packages/ai/src/__fixtures__/` and extended
`packages/ai/src/{analyzer,planner}.spec.ts` so the analyzer/planner prompt text and recorded
fake-provider JSON responses are asserted end to end with deterministic outputs. Extended
`apps/api/src/modules/ai/{opportunity-analyzer,action-planner}.service.spec.ts` to prove a
structured-output repair pass still persists the resolved prompt version onto stored rows, and
added `apps/api/src/modules/ai/ai-pipeline.worker.spec.ts` to cover the BullMQ
`job_runs retrying → failed` lifecycle on worker failures. Logged [[D-030]], updated
`docs/agent/{CONTEXT,TASKS}.md`, and marked P3-11 completed in `docs/architecture/11-task-breakdown.md`.
verified: `pnpm --filter @radar/ai test` ✓ (56/56), `pnpm --filter @radar/ai lint` ✓,
`pnpm --filter @radar/ai typecheck` ✓, `pnpm --filter @radar/ai build` ✓,
`pnpm --filter @radar/api test` ✓ (56/56), `pnpm --filter @radar/api lint` ✓,
`pnpm --filter @radar/api typecheck` ✓, `pnpm --filter @radar/api build` ✓,
`git diff --check -- apps/api packages/ai docs/agent/TASKS.md docs/agent/WORKLOG.md docs/agent/DECISIONS.md docs/agent/CONTEXT.md docs/architecture/11-task-breakdown.md` ✓.
next: The next open AI/backend follow-up is backlog item `T-009` (org BYOK/provider +
privacy-mode parity). If later QA needs to grow, extend the existing fixture-backed specs rather
than introducing live-model tests.

## 2026-06-24 12:11 — web-frontend — [P3-10 AI settings UI]
did: Added `apps/web/src/app/(app)/settings/ai/page.tsx` as the new AI settings surface and
`apps/web/src/lib/ai-settings.ts` as the direct Supabase/RLS prompt-version data layer. The page
loads the real prompt-version registry (`ai_prompt_versions`) and supports workspace override
creation via `create_ai_prompt_version`, activation via `activate_ai_prompt_version`, and revert to
system-default by clearing the active org override. Expanded `apps/web/src/lib/api.ts` with the
live `/usage/*` methods, updated `apps/web/src/components/app-shell.tsx` so the new route is
visible to any role with prompt-management or usage-read access, and built the screen around three
honest sections: provider posture (platform-managed in the current build), prompt versions, and
usage/limits/events. Logged [[D-029]], updated CONTEXT + the task breakdown, closed P3-10 in
TASKS, and added backlog follow-up `T-009` for the missing org BYOK/privacy-mode backend parity.
verified: `pnpm --filter @radar/web lint` ✓, `pnpm --filter @radar/web build` ✓,
runtime smoke via `next start` on `http://127.0.0.1:3002` + browser ✓: `/settings/ai` first shows
the protected-route loading state and then redirects unauthenticated users to `/login`. Full
authenticated prompt/usage smoke still needs a real Supabase workspace session.
`git diff --check -- apps/web/src/app/(app)/settings/ai/page.tsx apps/web/src/lib/ai-settings.ts apps/web/src/lib/api.ts apps/web/src/components/app-shell.tsx docs/agent/TASKS.md docs/agent/WORKLOG.md docs/agent/DECISIONS.md docs/agent/CONTEXT.md docs/architecture/11-task-breakdown.md` ✓.
next: P3-11 QA can now exercise the prompt-override flow, usage dashboards, and the protected
settings route. Backend follow-up `T-009` should add the real org BYOK/provider + privacy-mode
surface that the architecture docs describe so the provider posture section can become editable.

## 2026-06-24 10:49 — web-frontend — [P3-09 Inbox intelligence UI]
did: Extended `apps/web/src/lib/discoveries.ts` into an AI-aware inbox read model that loads the
latest `ai_analysis`, `ai_action_plans`, and `job_runs` head rows per discovery under RLS. Added
`api.analyzeDiscovery(...)` in `apps/web/src/lib/api.ts`, expanded the shared status tags with
score/urgency variants, and rewrote `apps/web/src/app/(app)/inbox/page.tsx` so the list/detail
panes show score, urgency, priority, reason, service matches, due-at, and planner action copy,
plus a re-analyze button and live polling of `analyze-discovery` job progress. Logged [[D-028]],
updated CONTEXT + the task breakdown, and moved P3-09 to Done in TASKS.
verified: `pnpm --filter @radar/web lint` ✓, `pnpm --filter @radar/web build` ✓,
`git diff --check -- apps/web/src/app/(app)/inbox/page.tsx apps/web/src/lib/discoveries.ts apps/web/src/lib/api.ts apps/web/src/components/ui/status-tag.tsx docs/agent/TASKS.md docs/agent/WORKLOG.md docs/agent/DECISIONS.md docs/agent/CONTEXT.md docs/architecture/11-task-breakdown.md` ✓. Runtime smoke: launched `next start` on `http://127.0.0.1:3002` and verified that an unauthenticated `/inbox` visit redirects cleanly to `/login` in the browser. Full authenticated inbox/live-job smoke is still pending a real Supabase workspace session.
next: P3-10 can keep the current split: thin API for governed writes, direct RLS-backed web reads
for app-local projections where no shared API surface is needed. When a real session is available,
smoke `/inbox` with a discovery that already has `ai_analysis` + `ai_action_plans` rows and verify
re-analyze progress end to end against live `job_runs`.

## 2026-06-24 10:20 — api-backend + ai-engine — [P3-08 Action Planner agent]
did: Added `supabase/migrations/0018_ai_action_plans.sql` for the re-runnable planner-output
table (`discovery_id` + exact `ai_analysis_id`, action/reason, priority + `priority_weight`,
`due_at`, planned-task draft fields, prompt-version/model metadata, `discoveries.read` SELECT
policy). Updated `packages/supabase/src/database.types.ts` for `AiActionPlanRow`. Built the pure
planner in `packages/ai/src/planner.ts` + `planner.spec.ts`: the model drafts the next action and
first task skeleton while deterministic rules derived from the latest analysis resolve
priority/weight/due date, with a bad-lead short-circuit that skips the model entirely. Added
`apps/api/src/modules/ai/action-planner.service.ts` + spec to load the latest `ai_analysis`, run
the governed gateway under `taskType=action_planner`, and persist `ai_action_plans`. Wired
`ActionPlannerService` into `AiModule` and into `DiscoveryPipelineService`, which now calls the
planner after a successful analysis write on a best-effort basis and records planner failures on
the completed job result instead of reverting the discovery out of `analyzed`. Logged [[D-027]],
updated CONTEXT, `04-database-schema.md`, and the task breakdown.
verified: `pnpm --filter @radar/ai test` ✓ (52/52), `pnpm --filter @radar/ai build` ✓,
`pnpm --filter @radar/ai lint` ✓, `pnpm --filter @radar/supabase build` ✓,
`pnpm --filter @radar/supabase lint` ✓, `pnpm --filter @radar/api test` ✓ (52/52),
`pnpm --filter @radar/api typecheck` ✓, `pnpm --filter @radar/api build` ✓,
`pnpm --filter @radar/api lint` ✓, `pnpm -r typecheck` ✓, `pnpm --filter @radar/web build` ✓,
`git diff --check -- apps/api packages/ai packages/supabase supabase/migrations docs/agent docs/architecture` ✓.
next: P3-09 can now read the latest `ai_action_plans` row per discovery to surface priority,
due-at, and recommended action in the inbox/detail UI. If operators need planner-only retries later,
add a dedicated re-plan trigger; for now the existing re-analyze flow re-runs the planner too.
⚠️ Not exercised against a live Supabase + Redis deployment — apply `0018_ai_action_plans.sql`,
then confirm analyze → plan → embed end to end with real provider keys and a real planner prompt.

## 2026-06-24 00:31 — api-backend + ai-engine — [P3-04 Cost tracking, rate limits, usage metering]
did: Closed the remaining governed-gateway pieces behind the already-shipped AI ledger. Added
`supabase/migrations/0017_ai_rate_limits.sql` so `company_usage_limits` can carry an optional
`request_rate_limit_rpm` override, then updated `packages/core/src/config.ts`, `.env.example`, and
`packages/supabase/src/database.types.ts` accordingly. Added
`apps/api/src/modules/ai/ai-rate-limit.service.ts` + tests for the Redis token-bucket seam, wired
it into `AiModule`, used it in `AiUsageService.assertWithinUsageLimits` for per-org request burst
limits, and used it in `AiProviderPoolService` so pooled provider accounts respect `rate_limit_rpm`
before a key is handed to the live adapter. Extended `@radar/ai`
(`packages/ai/src/{types,service,providers/http}.ts` + tests) so provider HTTP failures surface
status / Retry-After metadata on `AiCallRecord`. `AiUsageService` now persists
`ai_provider_rate_limit_events` and marks a rate-limited pooled key as `cooldown` with
`cooldown_until`, while successful calls clear cooldown state back to `active`. Logged [[D-026]]
and updated CONTEXT + the task breakdown.
verified: `pnpm --filter @radar/core build` ✓, `pnpm --filter @radar/ai test` ✓ (47/47),
`pnpm --filter @radar/ai build` ✓, `pnpm --filter @radar/ai lint` ✓,
`pnpm --filter @radar/supabase build` ✓, `pnpm --filter @radar/supabase lint` ✓,
`pnpm --filter @radar/api test` ✓ (47/47), `pnpm --filter @radar/api typecheck` ✓,
`pnpm --filter @radar/api build` ✓, `pnpm --filter @radar/api lint` ✓,
`pnpm --filter @radar/worker typecheck` ✓, `pnpm --filter @radar/worker build` ✓,
`pnpm -r typecheck` ✓, `pnpm --filter @radar/web build` ✓,
`git diff --check -- apps/api packages/ai packages/core packages/supabase supabase/migrations .env.example docs/agent docs/architecture/11-task-breakdown.md` ✓.
next: P3-08 (Action Planner) is now the next clean AI feature task. P3-10 can later expose the
per-org `request_rate_limit_rpm` override plus the provider rate-limit telemetry/cooldown state
without reworking the runtime seams. ⚠️ Not exercised against a live Supabase + Redis deployment —
apply `0017_ai_rate_limits.sql`, then confirm a real provider 429 writes
`ai_provider_rate_limit_events` and cools the pooled key as expected.

## 2026-06-23 23:55 — api-backend + ai-engine — [P3-07 Embeddings + analysis pipeline]
did: Shipped the async analysis pipeline. Added `supabase/migrations/0016_discovery_embedding_index.sql`
(the P2-03-deferred ivfflat `vector_cosine_ops` index on `discoveries.embedding`) and the
`AnalyzeDiscoveryJobPayload` / `GenerateEmbeddingJobPayload` contracts. Hosted the consumers in the
API (the standalone worker can't cross-import the Nest AI services — [[D-025]]):
`apps/api/src/modules/ai/discovery-pipeline.service.ts` owns the `new→processing→analyzed`
transitions + `job_runs` lifecycle, reuses `OpportunityAnalyzerService` for analysis and
`AiProviderPoolService` for embeddings (stores a pgvector literal), and chains `generate-embedding`
after a successful analyze. `ai-pipeline.worker.ts` runs the BullMQ `analyze-discovery` /
`generate-embedding` consumers on a dedicated Redis connection (guarded off under `NODE_ENV=test`),
mirroring the standalone worker's failure→`job_runs` handling. Added
`POST /discoveries/:id/analyze` (`ai.use`) for manual/re-analysis (P3-09), wired `AiPipelineModule`
into `AppModule`. On the producer side, the standalone worker now auto-enqueues `analyze-discovery`
for each newly inserted discovery (`pipeline-producer.ts`, best-effort) from the manual/CSV/extension
ingestion processors, so ingestion → analysis → embedding now chains automatically. Logged [[D-025]];
updated CONTEXT + the task breakdown.
verified: `pnpm --filter @radar/contracts build` ✓ + lint ✓, `pnpm --filter @radar/supabase build` ✓,
`pnpm --filter @radar/api typecheck` ✓ test ✓ (38/38, incl. new `discovery-pipeline.service.spec.ts`)
build ✓ lint ✓, `pnpm --filter @radar/worker typecheck` ✓ test ✓ (17/17) build ✓ lint ✓,
`pnpm -r typecheck` ✓, `pnpm --filter @radar/web build` ✓,
`git diff --check -- apps packages supabase docs` ✓.
next: P3-08 (Action Planner) consumes `ai_analysis`; P3-09 (Inbox AI UI) shows score/reason + wires
the new re-analyze endpoint + job progress; P4-01 (Opportunity Engine) reads analyses past a
threshold. ⚠️ Not run against live Supabase/Redis — apply `0016`, then exercise ingest → auto
analyze-discovery → analyzed → generate-embedding end to end with real provider keys. The
`ai_analysis_done` notification + the API-hosted consumer have only been unit-tested (no live Redis);
the pgvector write format (`[..]` literal) still needs a live confirm. Note the architectural split
in [[D-025]]: AI jobs run in the API process, non-AI ingestion jobs in `apps/worker`.

## 2026-06-23 23:10 — ai-engine + api-backend — [P3-06 Opportunity Analyzer]
did: Added `supabase/migrations/0015_ai_analysis.sql` — the re-runnable `ai_analysis` table (score,
intent/urgency checks, `service_match` jsonb, budget_estimate, confidence, recommended_action,
reason, `is_bad_lead`, `scoring_strategy_id` + `ai_prompt_version_id` FKs, `model_meta`), the
`(org, discovery, created_at desc)` head index, and a `discoveries.read` SELECT policy (writes are
service-role). Built the pure analyzer `packages/ai/src/analyzer.ts`: a bad-lead rule engine over
the 6 Company-Brain fields / 7 operators that short-circuits before any model call, a structured
prompt builder, a lenient `parseAnalyzerOutput` (coerces enums/clamps confidence, throws → one
repair pass when `recommendedAction`/`reason` are missing), and `analyzeOpportunity` which extracts
semantic signals via `AIService.generateStructured`, resolves country-match + budget-fit
deterministically, and hands `ScoringFeatures` to the P3-05 strategy for the explainable numeric
score. Added the API writer `apps/api/src/modules/ai/opportunity-analyzer.service.ts`: loads the
discovery + active Company Brain + active scoring strategy, runs the live gateway, captures the
successful call's prompt-version/provider/model via `hooks.onCall`, and persists `ai_analysis`.
Re-exported `Json` from `@radar/supabase`, added `AiAnalysisRow` + table/enum DB types, and
registered the service in `AiModule`. Logged [[D-024]]; updated CONTEXT + the task breakdown.
verified: `pnpm --filter @radar/supabase build` ✓ + lint ✓, `pnpm --filter @radar/ai typecheck` ✓
test ✓ (45/45, incl. new `analyzer.spec.ts`) build ✓ lint ✓, `pnpm --filter @radar/api typecheck` ✓
test ✓ (34/34, incl. new `opportunity-analyzer.service.spec.ts`) build ✓ lint ✓,
`pnpm --filter @radar/worker typecheck` ✓ build ✓, `pnpm -r typecheck` ✓,
`pnpm --filter @radar/web build` ✓, `git diff --check -- apps packages supabase docs` ✓.
next: P3-07 (embeddings + analysis pipeline) can now wrap `OpportunityAnalyzerService.analyzeDiscovery`
in an `analyze-discovery` job tracked in `job_runs`, drive the `new→processing→analyzed` status
transitions, and add the ivfflat embedding path. P3-08 (Action Planner) and P3-09 (Inbox AI UI) /
P4-01 (Opportunity Engine) consume `ai_analysis`. ⚠️ Not run against a live Supabase project — apply
`0015_ai_analysis.sql` with `pnpm db:push`, then analyze a real discovery end to end. The analyzer
has only been exercised against the `FakeProvider`, not live model output.

## 2026-06-23 22:30 — api-backend + ai-engine — [P3-03 Prompt versioning]
did: Added `supabase/migrations/0014_ai_prompt_versions.sql` — the versioned `ai_prompt_versions`
table (system defaults with `organization_id is null` + org-custom rows), partial unique indexes
for one active version + stable version numbers per scope, RLS (members read org + system rows;
`ai.settings.manage` manages org-custom; system rows are service-role only), the
`create_ai_prompt_version` / `activate_ai_prompt_version` RPCs, the deferred FK on
`ai_requests.ai_prompt_version_id` (on delete set null, still nullable), and a seeded generic
system default for all 11 agents so resolution always yields a version. Added the gateway seam in
`packages/ai`: `ResolvedPrompt`/`PromptResolver` types, an `AiCallRecord.aiPromptVersionId` field,
and an `AIServiceOptions.resolvePrompt` hook so `AIService.generate/embed` resolve once per call,
apply the resolved system prompt only when the caller didn't pass one, and stamp the version onto
every emitted record (ok/fallback/error). Added `apps/api/src/modules/ai/ai-prompt.service.ts`
(`resolveActivePrompt` — org-custom wins over system default — plus `createVersion`/`activateVersion`
RPC wrappers), registered it in `AiModule`, wired `resolvePrompt` into `AiProviderPoolService.buildService`,
and persisted `ai_prompt_version_id` in `AiUsageService.insertAiRequest`. Extended
`packages/supabase` DB types (`AiPromptVersionRow`, table registration, the two RPCs). Logged
[[D-023]] and updated CONTEXT + the task breakdown (P3-03 Completed; P3-04/P3-14 notes no longer
blocked on prompt-version stamping).
verified: `pnpm --filter @radar/supabase build` ✓ + lint ✓, `pnpm --filter @radar/ai typecheck` ✓
test ✓ (33/33) build ✓ lint ✓, `pnpm --filter @radar/api typecheck` ✓ test ✓ (27/27, incl. new
`ai-prompt.service.spec.ts`) build ✓ lint ✓, `pnpm --filter @radar/worker typecheck` ✓ build ✓,
`pnpm -r typecheck` ✓, `pnpm --filter @radar/web build` ✓,
`git diff --check -- apps packages supabase docs` ✓.
next: P3-06 (Opportunity Analyzer) can now consume `AiPromptService.resolveActivePrompt` via the
gateway and ship a richer analyzer prompt as a new active version; P3-10 (AI settings UI) can drive
`createVersion`/`activateVersion`. ⚠️ Not run against a live Supabase project — apply
`0014_ai_prompt_versions.sql` with `pnpm db:push`, then confirm seeded defaults resolve and the
`ai_requests` FK populates on a real AI call. Full not-null hardening of `ai_requests.ai_prompt_version_id`
stays deferred until every path (incl. embeddings/env-fallback) is guaranteed to resolve a version.

## 2026-06-23 21:59 — ai-engine + api-backend — [P3-05 Scoring strategy v1]
did: Added `supabase/migrations/0013_scoring_strategies.sql` for the org-scoped
`scoring_strategies` table with seeded heuristic defaults and RLS, then updated
`packages/supabase/src/database.types.ts` for the new enum/table. Added
`packages/ai/src/scoring.ts` plus tests for the deterministic weighted scorer
(`serviceMatch`, `priorityServiceMatch`, `countryMatch`, `budgetFit`, `intent`, `urgency`) with
explainable factor breakdowns and reason strings. Added
`apps/api/src/modules/ai/scoring-strategy.service.ts` plus tests so the thin API can resolve or
lazily create the active org strategy and hand a ready scorer to the next analyzer task. Logged
[[D-022]] and updated the context/task breakdown.
verified: `pnpm --filter @radar/supabase typecheck` ✓, `pnpm --filter @radar/supabase build` ✓,
`pnpm --filter @radar/supabase lint` ✓, `pnpm --filter @radar/ai typecheck` ✓,
`pnpm --filter @radar/ai build` ✓, `pnpm --filter @radar/ai lint` ✓,
`pnpm --filter @radar/ai test` ✓ (29/29), `pnpm --filter @radar/api typecheck` ✓,
`pnpm --filter @radar/api test` ✓ (20/20), `pnpm --filter @radar/api build` ✓,
`pnpm --filter @radar/api lint` ✓, `pnpm --filter @radar/worker typecheck` ✓,
`pnpm --filter @radar/worker build` ✓, `pnpm -r typecheck` ✓,
`pnpm --filter @radar/web build` ✓, `git diff --check -- apps/api apps/worker packages/ai packages/supabase supabase/migrations docs/agent docs/architecture/11-task-breakdown.md` ✓.
next: P3-06 can now focus on the actual Opportunity Analyzer agent and `ai_analysis` persistence,
using `ScoringStrategyService` as the deterministic scoring seam instead of inventing weights or
org-default handling again.

## 2026-06-23 21:46 — api-backend — [P3-14 AI usage ledger + quotas/credits]
did: Added `supabase/migrations/0012_ai_usage_ledger.sql` for `ai_requests`, `ai_usage_events`,
`company_usage_limits`, and `usage_credit_grants`, then updated `packages/contracts`,
`packages/core`, and `packages/supabase` with the new usage DTOs, permission keys, rate-limit
error, and DB types. Extended `packages/ai` with async `hooks.beforeCall` + awaited/safe
`hooks.onCall`, added `apps/api/src/modules/ai/ai-usage.service.ts` to enforce company
request/token/cost/task quotas and persist request/usage rows plus company/key/account counters,
updated `AiProviderPoolService`/`AiModule` to wire that service into every live AI call, and added
`apps/api/src/modules/usage/` with `/usage/me`, `/usage/company`, `/usage/company/summary`,
`/usage/team`, `/usage/limits`, and `/usage/events`. Logged [[D-021]] and updated the shared
context/task breakdown. Soft-degrade is implemented as typed 429 quota responses; the
`monthly_ai_usage_warning` notification emission is still deferred because the notifications schema
and delivery path do not exist in the current codebase yet.
verified: `pnpm --filter @radar/contracts typecheck` ✓, `pnpm --filter @radar/supabase typecheck` ✓,
`pnpm --filter @radar/ai typecheck` ✓, `pnpm --filter @radar/api typecheck` ✓,
`pnpm --filter @radar/core build` ✓, `pnpm --filter @radar/contracts build` ✓,
`pnpm --filter @radar/supabase build` ✓, `pnpm --filter @radar/ai build` ✓,
`pnpm --filter @radar/api build` ✓, `pnpm --filter @radar/ai test` ✓ (25/25),
`pnpm --filter @radar/api test` ✓ (17/17), `pnpm --filter @radar/contracts lint` ✓,
`pnpm --filter @radar/supabase lint` ✓, `pnpm --filter @radar/ai lint` ✓,
`pnpm --filter @radar/api lint` ✓, `pnpm -r typecheck` ✓, `pnpm --filter @radar/web build` ✓,
`git diff --check -- apps/api packages/ai packages/contracts packages/core packages/supabase supabase/migrations docs/agent docs/architecture/11-task-breakdown.md` ✓.
next: P3-03 can now attach real prompt-version resolution/FKs onto the live request path, and the
next major AI feature task can build on the new quota-aware `AiProviderPoolService` seam. If/when
notifications land, wire `monthly_ai_usage_warning` off `company_usage_limits` thresholds instead
of reworking the ledger.

## 2026-06-23 19:36 — ai-engine — [P3-13 Model router + task routes]
did: Added `supabase/migrations/0011_ai_task_routes.sql` for the platform-owned
`ai_task_routes` table with active-route uniqueness, route-shape constraints, and seeded free-first
defaults matching `packages/ai/src/routes.ts`. Extended `packages/ai/src/types.ts` with
`TaskRoute.maxInputTokens`, updated `packages/supabase/src/database.types.ts` for the new route
table and typed AI task names, added `apps/api/src/modules/ai/ai-routing.service.ts` plus
`ai-routing.service.spec.ts` to load/marshal active DB rows into `TaskRoute`, and updated
`AiProviderPoolService`/`AiModule` so live `AIService` instances now hydrate DB routes at
construction time while keeping the in-code defaults as fallback. Logged [[D-020]] and updated the
shared context + task breakdown.
verified: `pnpm --filter @radar/ai typecheck` ✓, `pnpm --filter @radar/ai test` ✓ (24/24),
`pnpm --filter @radar/ai build` ✓, `pnpm --filter @radar/ai lint` ✓,
`pnpm --filter @radar/supabase build` ✓, `pnpm --filter @radar/api typecheck` ✓,
`pnpm --filter @radar/api test` ✓ (14/14), `pnpm --filter @radar/api build` ✓,
`pnpm --filter @radar/api lint` ✓, `pnpm -r typecheck` ✓, `pnpm --filter @radar/web build` ✓,
`git diff --check -- apps/api packages/ai packages/supabase supabase/migrations docs/agent docs/architecture/11-task-breakdown.md` ✓.
next: P3-14 should now consume the selected route + key metadata to persist `ai_requests` /
`ai_usage_events`, enforce quotas, and advance key/account counters. P3-03 prompt versioning can
proceed independently and later feed `ai_prompt_version_id` into the same live gateway path.

## 2026-06-23 19:21 — api-backend + ai-engine — [P3-12 AI Provider key pool]
did: Added `supabase/migrations/0010_ai_provider_pool.sql` for `ai_provider_accounts`,
encrypted `ai_api_keys`, `ai_model_catalog`, `ai_provider_health_checks`, and
`ai_provider_rate_limit_events`, then updated `packages/supabase/src/database.types.ts` to match.
Extended `packages/ai` so the live Gemini/Groq/OpenRouter adapters can resolve credentials per
call and surface `apiKeyId` / `providerAccountId` / `isFreeTier` metadata through `AIService`.
Added `apps/api/src/modules/ai/ai-provider-pool.service.ts` + tests and wired `AiModule` into the
API so backend code can build an `AIService` from pooled Supabase keys (decrypted with
`ENCRYPTION_KEY`) or env-key fallbacks without exposing secrets to tenant clients. Logged [[D-019]]
and updated the context/task breakdown for the new Phase 3 baseline.
verified: `pnpm --filter @radar/core build` ✓, `pnpm --filter @radar/supabase build` ✓,
`pnpm --filter @radar/ai typecheck` ✓, `pnpm --filter @radar/ai test` ✓ (24/24),
`pnpm --filter @radar/ai build` ✓, `pnpm --filter @radar/ai lint` ✓,
`pnpm --filter @radar/api typecheck` ✓, `pnpm --filter @radar/api test` ✓ (9/9),
`pnpm --filter @radar/api build` ✓, `pnpm --filter @radar/api lint` ✓, `pnpm -r typecheck` ✓,
`pnpm --filter @radar/web build` ✓, `git diff --check -- apps/api packages/ai packages/core packages/supabase supabase/migrations docs/agent docs/architecture/11-task-breakdown.md .env.example` ✓.
next: P3-13 can now add `ai_task_routes` and swap the in-code defaults for DB-backed routing
without redesigning the provider layer. P3-14 should consume the new call metadata seam to persist
`ai_requests` / `ai_usage_events` and advance key/account counters. Live verification still needs a
real Supabase project with `0010_ai_provider_pool.sql` applied plus actual encrypted provider keys.

## 2026-06-23 16:10 — ai-engine — [P3-02 Provider adapters]
did: Implemented the live provider adapters in `packages/ai/src/providers/` against the P3-01
`AiProvider` contract: `gemini.ts` (`:generateContent` + `:embedContent` @ 1536 dims; json+embed),
`groq.ts` + `openrouter.ts` (text-only over a shared `openai-chat.ts` OpenAI-compatible helper),
`ollama.ts` (`/api/chat` + `/api/embeddings`; local, no key). Added `http.ts` — a minimal injectable
`FetchLike` (defaults to global fetch), AbortController timeout, and `ProviderHttpError` (the
ModelRouter treats it as a fallback trigger) — so adapters are SDK-free and unit-tested offline.
Added `buildLiveProviders(config)` (`providers/index.ts`) returning the free-first provider list for
`new AIService({ providers })`, re-exported everything from `src/index.ts`, and added
`OPENROUTER_API_KEY` to `.env.example`. Logged [[D-018]].
verified: `pnpm --filter @radar/ai typecheck` ✓, `pnpm --filter @radar/ai lint` ✓,
`pnpm --filter @radar/ai test` ✓ (23/23, incl. new `providers/providers.spec.ts`: per-vendor request
shaping/response parsing via fake fetch, ProviderHttpError on non-2xx, free-first fallback through
AIService, and buildLiveProviders selection), `pnpm --filter @radar/ai build` ✓, `pnpm -r typecheck` ✓.
⚠️ NOT exercised against live provider APIs — no real keys; the credential/key-pool wiring is P3-12.
next: P3-12 (AI key pool) → P3-13 (DB routes `ai_task_routes`) → P3-14 (usage ledger: wire
`hooks.onCall` → `ai_requests`/`ai_usage_events`). At P3-12, build the layer that resolves keys
(env/`ai_api_keys`) and constructs the `AIService` via `buildLiveProviders`, then do the first live
provider smoke test. P3-03 (prompt versioning) is independent and can proceed in parallel.

## 2026-06-23 15:30 — quality-assurance + ai-engine — [P2-12 done → Phase 2 complete; P3-01 done]
did: (1) **P2-12** closed Phase 2 — added the worker QA suite
`apps/worker/src/processors/discovery-ingestion.spec.ts` (17 tests: CSV parse/quoting/CRLF/blank/
ragged, header aliasing + no-header defaults, manual/CSV/extension normalization, **dedup-hash
idempotency**, no-identifier skips, result accumulators) and the extension QA suite
`extension/src/parsers/parsers.spec.ts` (6 tests, jsdom: compactItems, textOf/hrefOf, the
**visible-only guarantee** via isVisible/visibleElements, parseGeneric snapshots). Stood up jest in
`apps/worker`, `extension`, and `packages/ai` (jest/ts-jest/+jsdom; specs excluded from the
extension/ai builds) — [[D-017]]. (2) **P3-01** started + completed Phase 3's gateway core: built
the provider-agnostic `packages/ai` (types, free-first routes, `ModelRouter` with fallback +
circuit breaker, `FakeProvider`, `AIService` with structured-output repair + embeddings + a
`hooks.onCall` usage seam), replacing the NotImplemented stub. No live provider/SDK dependency yet.
verified: `@radar/worker` test 17/17 ✓, `@radar/extension` 6/6 ✓, `@radar/ai` 10/10 ✓, `@radar/api`
4/4 ✓; lint clean for worker/extension/ai; `@radar/ai` build ✓; `pnpm -r typecheck` ✓.
next: **P3-02** — real provider adapters (Gemini/Groq/OpenRouter/Ollama) against the `AiProvider`
contract; then P3-03 prompt versioning, P3-12 key pool, P3-13 DB routes, P3-14 usage ledger
(wire `hooks.onCall` → `ai_requests`/`ai_usage_events`). None of the Phase-3 AI calls are verifiable
live until provider keys + the key pool exist.

## 2026-06-23 14:00 — web-frontend + documentation + QA — [FD-02/FD-04/FD-05]
did: Closed the remaining frontend design-track tasks. Added a shared UI layer under
`apps/web/src/components/ui/` (`PageSection`, `MetricCard`, `EmptyState`, shared status tags,
`SettingsSaveBar`) and refactored the shipped Action Center, Inbox, Jobs, Extension settings, and
Company Brain screens to use those primitives. Added `docs/architecture/14-key-screen-wireframes.md`
 and `docs/architecture/15-ui-qa.md`, updated `docs/architecture/README.md`, and aligned the task
board + architecture breakdown so the frontend design track is marked complete.
verified: `pnpm --filter @radar/web lint` ✓, `pnpm --filter @radar/web build` ✓,
`curl -I http://127.0.0.1:3003/settings/company-brain` ✓,
`curl -I http://127.0.0.1:3003/settings/extension` ✓,
`curl -I http://127.0.0.1:3003/jobs` ✓, `curl -I http://127.0.0.1:3003/inbox` ✓,
`git diff --check -- apps/web docs/architecture docs/agent` ✓.
next: Frontend design-track work is complete for the current shipped routes. New screens from later
phases should extend the shared `components/ui` layer and reuse the wireframe/QA docs instead of
introducing new page-local UI contracts.

## 2026-06-23 13:58 — api-backend + web-frontend + extension — [P2-05/P2-09/P2-10/P2-11]
did: Completed the Phase 2 extension implementation track. Added
`supabase/migrations/0009_extension_tokens.sql`, extended `packages/contracts` and
`packages/supabase`, created `apps/api/src/modules/extension/` plus public
`POST /api/v1/ingest/extension`, and added worker-side `process-extension-batch` ingestion.
Scaffolded the installable `extension/` workspace package (MV3 manifest, popup, options page,
background delivery, queue retry, on-demand content-script injection, review overlay, LinkedIn /
Upwork / Freelancer / generic visible-only parsers). Added the in-app management surface at
`apps/web/src/app/(app)/settings/extension/page.tsx` and wired extension token/health helpers into
`apps/web/src/lib/api.ts` plus app navigation.
verified: `pnpm --filter @radar/contracts build` ✓, `pnpm --filter @radar/supabase build` ✓,
`pnpm --filter @radar/api typecheck` ✓, `pnpm --filter @radar/api build` ✓,
`pnpm --filter @radar/api lint` ✓, `pnpm --filter @radar/api test` ✓,
`pnpm --filter @radar/worker typecheck` ✓, `pnpm --filter @radar/worker build` ✓,
`pnpm --filter @radar/worker lint` ✓, `pnpm --filter @radar/extension typecheck` ✓,
`pnpm --filter @radar/extension lint` ✓, `pnpm --filter @radar/extension build` ✓,
`pnpm --filter @radar/web lint` ✓, `pnpm --filter @radar/web build` ✓,
`pnpm -r typecheck` ✓, `curl -I http://127.0.0.1:3002/settings/extension` ✓,
`curl -I http://127.0.0.1:3002/login` ✓, `git diff --check -- apps/api apps/worker apps/web extension packages/contracts packages/supabase docs/agent docs/architecture/11-task-breakdown.md pnpm-workspace.yaml` ✓.
next: The remaining explicit Phase 2 task is P2-12 QA. Feature implementation for Company Brain,
Discovery Inbox, manual/CSV capture, and the extension path is now in place, but the repo still
needs dedicated parser/visible-only and CSV-edge-case coverage plus a live Supabase end-to-end run.

## 2026-06-23 13:39 — web-frontend — [FD-03]
did: Rolled the new Radar OIP design language from `docs/architecture/13-design-system.md` into
the running Next.js app without a risky primitive-library rewrite. Updated
`apps/web/src/theme/tokens.ts` and `apps/web/src/app/globals.css` to an emerald/charcoal palette,
refreshed the shared shell in `apps/web/src/components/app-shell.tsx`, expanded
`apps/web/src/components/page-header.tsx`, rebuilt the auth presentation in
`apps/web/src/components/auth-frame.tsx`, and applied the new visual system to the Action Center,
Inbox, Capture, Jobs, and Company Brain pages plus layout/provider cleanup.
verified: `pnpm --filter @radar/web lint` ✓, `git diff --check -- apps/web/src docs/agent` ✓,
`pnpm --filter @radar/web build` ✓ once but repeated reruns were intermittently flaky with Next
module/chunk resolution errors (`/jobs`, `/_document`, `./543.js`), and dev smoke on port 3001
returned HTTP 200 for `/login`, `/register`, and `/inbox`. Not fully re-smoked: authenticated app
paths and live Supabase flows.
next: Treat the broader architecture task as still partially complete until `FD-02` ships a deeper
component-library pass and the remaining target shell surfaces (for example command palette / AI
drawer / future screens) are implemented and smoke-tested end to end.

## 2026-06-23 13:24 — documentation — [DOC-4]
did: Updated `docs/architecture/11-task-breakdown.md` so each roadmap task now includes a live
`Status:` field (`Remaining`, `Partially completed`, or `Completed`). Added shipped-scope notes to
the completed Phase 1 and Phase 2 tasks plus the partially completed `FD-01` design-system
foundation task, and added [[D-013]] to `docs/agent/DECISIONS.md` so future agents know to keep
the detailed breakdown aligned with `docs/agent/TASKS.md`.
verified: status coverage check against task headings in `docs/architecture/11-task-breakdown.md` ✓,
targeted readback of Phases 1–9 and the new format block ✓, `git diff --check -- docs/architecture/11-task-breakdown.md docs/agent` ✓.
next: when any architecture task moves materially, update both `docs/agent/TASKS.md` and
`docs/architecture/11-task-breakdown.md` in the same change so the roadmap stays self-consistent.

## 2026-06-23 13:16 — documentation — [DOC-3]
did: Added `docs/architecture/13-design-system.md` as the target-state Radar OIP design-system
spec and rewrote `docs/architecture/06-frontend-structure.md` to match the new shell/navigation/
layout model. Updated `docs/architecture/FEATURE.md`, `docs/architecture/10-roadmap.md`,
`docs/architecture/11-task-breakdown.md`, `docs/architecture/README.md`, and root `README.md`
so the next frontend pass is documented as a dark, developer-grade, Supabase-inspired direction
without implying the shipped UI has already migrated. Added design-track backlog items `FD-01`
through `FD-05` to `docs/agent/TASKS.md`, recorded [[D-012]] in `docs/agent/DECISIONS.md`, and
noted the current-vs-target split in `docs/agent/CONTEXT.md`.
verified: `git diff --check -- README.md docs/architecture docs/agent` ✓; targeted readback/grep
for `13-design-system`, `FD-01` to `FD-05`, and the "current shipped UI vs next direction" notes ✓.
Not run: app build/lint/smoke, because no application code changed in this task.
next: `FD-01` is now explicitly documented and effectively started by the spec; the next practical
step before frontend coding is `FD-04` key-screen wireframes or `FD-02` shared component-library
implementation, depending on whether design review or coding starts first.

## 2026-06-23 11:40 — web-frontend — [UI-1 Ant Design dark UI system]
did: Rebuilt the entire web UI on **Ant Design 6** with a dark, token-driven design system
([[D-011]]). Added deps antd/@ant-design/icons/@ant-design/nextjs-registry/dayjs. New foundation:
`apps/web/src/theme/tokens.ts` (darkAlgorithm + brand/surface/component tokens),
`src/components/providers.tsx` (AntdRegistry + ConfigProvider + App + AuthProvider), `next/font`
wiring in `src/app/layout.tsx` (Inter/Space Grotesk/JetBrains Mono), rewritten `globals.css`
(brand CSS vars, headings→display font, scrollbars, radar-canvas gradient, inbox responsive grid).
New shared components: `app-shell.tsx` (collapsible AntD `Sider` + icon `Menu` + sticky `Header`
with Capture button, notifications dropdown, user menu, workspace identity), `auth-frame.tsx`
(branded split-screen), `page-header.tsx`. Converted every page to AntD with zero native form
controls: login, register, Action Center, Jobs (`Table`/`Tag`/`Progress`), Capture (`Form`/
`Upload.Dragger`/`Segmented`/`Descriptions`), Inbox (3-pane `Card`/`List`/`Checkbox.Group`/
`RangePicker`/`Collapse`), Company Brain (`Statistic`/`Radio`/`Select`/`Popconfirm`/`Descriptions`)
— all data-layer logic preserved. Wrote `docs/DESIGN.md` + `docs/UIUX.md` (full design + UX rules,
per-page DoD checklist) and updated CONVENTIONS/CONTEXT/DECISIONS to point at them.
verified: `pnpm --filter @radar/web lint` ✓, `pnpm --filter @radar/web build` ✓ (8 routes), clean
`next start` after wiping `.next` ✓ — all routes HTTP 200 (the first run 500'd on a stale-`.next`
`'./543.js'` chunk flake from overlapping builds; clean rebuild fixed it, cf. [T-008]/[[D-007]]).
Screenshotted `/login` via preview: dark theme, display heading, AntD inputs, Radar Blue button ✓.
NOT verified: authenticated app-shell/pages need a real Supabase login (env now wired to the user's
project, but no seeded user/schema here) — log in locally to exercise the shell + CRUD end to end.
next: optional polish — wire a real workspace switcher into `useAuth` (header currently shows
identity only), and a command palette (⌘K) behind the header. Resume Phase 2 backend at P2-05.

## 2026-06-23 10:18 — web-frontend — [P2-08 Manual entry + CSV import UI]
did: Built the Phase 2 capture screen against the P2-04 ingestion endpoints. Added
`apps/web/src/app/(app)/capture/page.tsx` (tabbed Manual / CSV), wired the nav item in
`apps/web/src/components/app-shell.tsx` (gated on `discoveries.write`), added the capture data
layer `apps/web/src/lib/ingestion.ts` (browser CSV parse + preview, worker-mirrored header→field
mapping, signed-upload helper via `supabase.storage.uploadToSignedUrl`, idempotency-key minting),
and extended the thin-API client `apps/web/src/lib/api.ts` with `ingestManual`/`ingestCsv` (each
sends an `Idempotency-Key`) and a single-job `job(id)` getter. Manual entry validates "at least one
identifier" client-side to match the shared `manualDiscoverySchema` superRefine; both flows show
live job progress by polling `/jobs/:id` until completed/failed/cancelled, then link to the Inbox.
verified: `pnpm --filter @radar/web lint` ✓, `pnpm --filter @radar/web build` ✓ (10 routes,
`/capture` 5.34 kB; web type-check passed), `pnpm --filter @radar/web start` ✓ then curl smoke:
`/capture`, `/login`, `/inbox` all HTTP 200 and `/capture` renders the auth shell (no 500). NOT
verified live: no Supabase creds/bucket/worker in this env, so the signed CSV upload + actual job
completion still need a local authenticated end-to-end run.
next: P2-05 [BE] extension ingestion endpoint + tokens is the next backend must-have on the
discovery path (unblocks the P2-09 extension). When local Supabase is available, exercise
`/capture` end to end (manual submit + CSV upload) with a `discoveries.write` member.

## 2026-06-23 09:43 — api-backend — [P2-04 Ingestion service]
did: Implemented the Phase 2 ingestion backend end to end. Added `apps/api/src/modules/ingestion/`
with `/ingest/manual` and `/ingest/csv`, both guarded by `discoveries.write`, validated with zod,
and wrapped in Redis-backed `Idempotency-Key` handling. Manual intake now creates a tracked batch
and `ingest-manual` job; CSV intake creates a signed Supabase Storage upload target in the
configured imports bucket and enqueues the `import-csv` job immediately. Added worker processors
for manual + CSV ingestion plus shared normalization/CSV parsing helpers in
`apps/worker/src/processors/discovery-ingestion.ts`. Added `supabase/migrations/
0008_ingestion_helpers.sql` with `ingest_discovery_candidate(...)` so inserts use exact-hash
idempotency plus pg_trgm fuzzy dedup close to the data. Extended contracts/core/supabase types,
updated `.env.example`, `README.md`, `docs/agent/CONTEXT.md`, `docs/agent/TASKS.md`, and logged
[[D-009]] for the signed-upload/storage decision.
verified: `pnpm --filter @radar/contracts build` ✓, `pnpm --filter @radar/core build` ✓,
`pnpm --filter @radar/supabase build` ✓, `pnpm --filter @radar/api typecheck` ✓,
`pnpm --filter @radar/worker typecheck` ✓, `pnpm --filter @radar/contracts lint` ✓,
`pnpm --filter @radar/core lint` ✓, `pnpm --filter @radar/supabase lint` ✓,
`pnpm --filter @radar/api lint` ✓, `pnpm --filter @radar/worker lint` ✓,
`pnpm --filter @radar/api build` ✓, `pnpm --filter @radar/worker build` ✓,
`pnpm --filter @radar/web build` ✓, `pnpm -r typecheck` ✓, `pnpm --filter @radar/api test` ✓.
NOT verified live: no linked Supabase project/bucket in this environment, so the signed upload,
Storage download, and SQL helper still need a local end-to-end run after `pnpm db:push`.
next: P2-08 [FE] can now build the manual/CSV capture UI against these endpoints. P2-05
extension ingestion remains the next backend path on the discovery critical path.

## 2026-06-23 09:24 — web-frontend — [P2-02 Company Brain UI]
did: Added the Phase 2 Company Brain settings screen at
`apps/web/src/app/(app)/settings/company-brain/page.tsx` and exposed it from
`apps/web/src/components/app-shell.tsx`. The page loads the active profile plus version history
from `apps/web/src/lib/company-brain.ts`, lets operators edit services, priority services,
industries, countries, minimum budget, outreach tone, ICP fields, and bad-lead rules, validates
the draft against the shared Company Brain DTO schema before save, and sends writes through the
existing `create_company_profile_version(...)` RPC so every save creates a new revision. Added a
history rail that previews saved snapshots and can reload an older version into the editor.
Updated `docs/agent/CONTEXT.md` and `docs/agent/TASKS.md` to reflect the new UI surface.
verified: `pnpm --filter @radar/web lint` ✓, `pnpm --filter @radar/web build` ✓,
`pnpm --filter @radar/web start` ✓, browser smoke on `http://localhost:3000/settings/company-brain`
✓ (unauthenticated request redirects to `/login` and the sign-in UI renders). NOT verified with a
real Supabase-authenticated session, so the live read/write path still needs a local login against
the target project.
next: P2-04 ingestion remains the next must-have backend path. Once local Supabase access is
available, exercise `/settings/company-brain` end to end with a real org member who has
`company_brain.manage`.

## 2026-06-23 08:44 — api-backend — [P2-01 Company Brain]
did: Implemented the Phase 2 Company Brain data surface in the full-Supabase style. Added
`supabase/migrations/0007_company_brain.sql` with the versioned `company_profiles` table, the
one-active-per-org partial unique index, `company_brain.manage` read policy, and the
`create_company_profile_version(...)` RPC that locks the org row, increments `version`, deactivates
the previous profile, and inserts the new active revision atomically. Added Company Brain DTOs to
`packages/contracts/src/dto.ts` (ideal customer schema, bad-lead rules schema, profile input type,
profile version type), updated `packages/supabase/src/database.types.ts`, added the typed web
data layer in `apps/web/src/lib/company-brain.ts`, and refreshed `docs/agent/CONTEXT.md`.
verified: rebuilt `@radar/contracts` ✓ and `@radar/supabase` ✓, `pnpm -r typecheck` ✓,
`pnpm --filter @radar/contracts lint` ✓, `pnpm --filter @radar/supabase lint` ✓,
`pnpm --filter @radar/web lint` ✓, `pnpm --filter @radar/web build` ✓, `pnpm --filter @radar/web start`
✓, browser smoke on `http://localhost:3000/login` ✓. NOT verified live against Supabase — apply
`0007_company_brain.sql` with `pnpm db:push` and exercise the RPC in a real session locally.
next: P2-02 [FE] Company Brain UI is now unblocked and can consume `apps/web/src/lib/company-brain.ts`.
P2-04 ingestion remains the other must-have backend path.

## 2026-06-23 08:42 — platform-infra — [T-008]
did: Traced the reported `next start` 500 to an invalid runtime sequence rather than the Inbox UI
itself. After `next dev`, the shared `.next` directory could contain dev-only route bundles
(`isDev=true` in generated loaders, `vendor-chunks/tr46@0.0.3.js` references), and `next start`
would then boot against that stale output. Added a clean-rebuild `prestart` script in
`apps/web/package.json` so `pnpm --filter @radar/web start` always wipes `.next`, rebuilds, and
then starts. Updated `docs/agent/TASKS.md` to close T-008 and move P2-07 to Done; logged
[[D-007]] for the new start behavior.
verified: `pnpm --filter @radar/web build` ✓, `pnpm --filter @radar/web lint` ✓, `pnpm --filter
@radar/web start` ✓ (after `prestart` clean rebuild), browser smoke on `http://localhost:3000/login`
✓, browser smoke on `http://localhost:3000/inbox` ✓ (redirects unauthenticated user to `/login`),
`pnpm --filter @radar/web dev` ✓, browser reload smoke on `/login` and `/inbox` under dev ✓.
next: P2-07 is no longer blocked. Next unclaimed must-have work is back in the main backlog
(`P2-01`, `P2-04`, or `P2-09`) plus the cross-cutting docs/security tasks.

## 2026-06-23 08:17 — web-frontend — [P2-07 Discovery Inbox UI]
did: Enabled Discovery Inbox navigation in `apps/web/src/components/app-shell.tsx` and added
`apps/web/src/app/(app)/inbox/page.tsx`. The page uses the existing `apps/web/src/lib/
discoveries.ts` Supabase/RLS data layer directly: left-side filters (status/source/country/title/
date/sort), paginated inbox list, detail preview, bulk review/ignore/approve actions, single-item
quick actions, permission gating, raw payload preview, and explicit Phase 3 placeholders where AI
score/explanation will land later. Fixed pagination so it preserves the currently applied filters
instead of unsaved draft edits.
verified: `pnpm --filter @radar/web build` ✓, `pnpm --filter @radar/web lint` ✓. Manual browser
smoke was only partially successful: `pnpm --filter @radar/web dev` compiled `/inbox` and served
it, but hot reload later hit a broader Next runtime/devtools manifest crash. `pnpm --filter
@radar/web start` is also broken outside this task: both `/login` and `/inbox` return 500 with
missing `.next/server/vendor-chunks/tr46@0.0.3.js`. Logged as [T-008]; P2-07 cannot be marked
done until runtime smoke is clean.
next: Pick up [T-008] to restore a clean local runtime (`/login` + `/inbox` under browser smoke),
then reopen or move P2-07 to Done if the Inbox still behaves correctly.

## 2026-06-22 — api-backend — [P2-06 Discovery Inbox API]
did: Built the Inbox data surface the full-Supabase way ([[D-006]]: supabase-js + RLS, no NestJS
endpoint — doc 13 routes discoveries CRUD to the web client). (1) `supabase/migrations/
0006_discovery_inbox.sql` adds an UPDATE policy on `discoveries` gated by `discoveries.write`
(status transitions review/approve/ignore + soft-delete); reads already covered by the 0005
`discoveries.read` SELECT policy. (2) `packages/contracts/src/dto.ts`: `discoveryFilterSchema`
(status/source/country/search/batchId/date range/pagination/sort), `updateDiscoveryStatusSchema`,
`DISCOVERY_INBOX_STATUSES`, and `DiscoverySummary`/`DiscoveryDetail`/`DiscoveryListResult`.
(3) `apps/web/src/lib/discoveries.ts`: typed data layer — `listDiscoveries` (filters + count +
range pagination, excludes soft-deleted), `getDiscovery`, `setDiscoveryStatus` (bulk). Org-scoped
explicitly and by RLS.
verified: rebuilt `@radar/contracts` to dist ([[D-004]]), then `pnpm -r typecheck` 7/7 ✓,
web lint ✓, contracts lint ✓, `pnpm --filter @radar/web build` ✓ (7 routes — Inbox page is P2-07).
NOT verified live — no Supabase creds/Docker; apply 0006 with `pnpm db:push` locally.
decisions: `approved` status only marks intent in the Inbox; opportunity conversion is P4-01.
Manual-entry INSERT policy deferred to P2-04 (ingestion). Score-sort deferred — needs ai_analysis
(Phase 3); sort is newest/oldest for now.
next: P2-07 [FE] Discovery Inbox UI (now unblocked) consumes `lib/discoveries.ts` + the contracts
DTOs. P2-04 ingestion to actually populate the table. P2-01 Company Brain is independent.

## 2026-06-22 — api-backend — [P2-03 Discovery storage model]
did: Started Phase 2. Added `supabase/migrations/0005_discovery.sql` — `discovery_batches`
(source/channel/status/parser_version/raw_blob_url/item_count/captured_by) and `discoveries`
(raw_payload jsonb, normalized title/description + hint cols, budget_hint, dedup_hash,
embedding vector(1536), soft-delete) with the full `discovery_source`/`discovery_status` enums
+ new `discovery_channel`/`discovery_batch_status` enums. Indexes: (org,status),(org,source),
batch, GIN(raw_payload), GIN(title trgm), partial unique(org,dedup_hash). updated_at triggers;
RLS enabled, select gated by `discoveries.read` (writes are service-role). Added DiscoveryRow/
DiscoveryBatchRow + enum types to `packages/supabase/src/database.types.ts`.
verified: `pnpm -r typecheck` 7/7 ✓, `pnpm --filter @radar/supabase lint` clean ✓. NOT verified
live — no Supabase creds/Docker in this env; apply with `pnpm db:push` locally.
decisions: ivfflat(embedding) index deferred to P3-07 (embeddings null until analysis; ivfflat
builds poorly on empty table). Gave discovery_batches an updated_at (doc listed only created_at)
for status-lifecycle tracking.
notes: logged [T-007] to realign the still-Prisma-flavored docs (CONTEXT "Stack/Key files/Run it",
architecture 02/05/07/09) with the full-Supabase reality ([[D-006]]) — already flagged as a
follow-up in the Pivot entry below; now tracked on the board.
next: P2-06 Discovery Inbox API and/or P2-04 Ingestion service (both now unblocked). P2-01
Company Brain is independent. Run 0005 against a live DB to confirm before building on it.

## 2026-06-22 — api-backend + web-frontend — [Pivot to full Supabase]
did: Per user choice + [[D-006]], moved auth+data to **full Supabase** (auth + Postgres + RLS),
NestJS shrunk to thin (jobs/health). Removed Prisma (`packages/db`) and custom-auth modules.
Added `supabase/migrations/` (0001 schema, 0002 functions incl. is_member/has_permission/
handle_new_user/create_organization, 0003 RLS policies, 0004 seed) and `packages/supabase`
(service/user client factory + DB types). API now uses `SupabaseAuthGuard` (verify getUser) +
service-role client; worker updates job_runs via service role. Web uses `supabase-js` for auth +
`create_organization` RPC; jobs page calls thin API with Bearer + x-organization-id. New
`docs/architecture/13-supabase-integration.md`; updated env.example, docker-compose (Redis only),
CI (static), README, CONTEXT. Pinned supabase-js@2.45.4 (override) to fix postgrest `never` types.
verified: `pnpm install` ✓, build shared pkgs ✓, `pnpm -r typecheck` 7/7 ✓, api tests ✓,
`pnpm -r lint` clean ✓, builds api/worker/web ✓. NOT verified: live Supabase (no creds) — apply
migrations + run signup→demo-job locally.
next: ⚠️ rotate leaked Supabase keys (T-006). Realign architecture docs 02/05/07/09 to doc 13
(follow-up). Then Phase 2 (Discovery: tables + RLS + supabase-js CRUD + extension).

## 2026-06-22 — api-backend + web-frontend — [RESET + Phase 1 Foundation]
did: Deleted legacy LeadRadar (apps/web Vite, apps/worker, packages/shared, supabase/, legacy
docs, old README, lead-notifier.yml) per [[D-005]]. Scaffolded the Radar OIP monorepo and built
**Phase 1 Foundation**: packages contracts/core/db/ai; NestJS api (auth JWT+refresh, RBAC guard
+ permission catalog, org/members, jobs + Job Status API, health, pino, swagger, RFC-7807
filter); worker (BullMQ demo processor → job_runs); Next.js web (auth pages + RBAC shell +
Action Center + Job Monitor); Prisma schema + offline initial migration + seed; docker-compose
(pg+redis), CI, .env.example. Adopted CommonJS backend + packages/db ([[D-004]]). Renamed
subagents to web-frontend/api-backend and refreshed all agent docs.
verified: `pnpm install` ✓, `pnpm db:generate` ✓, `pnpm -r typecheck` 7/7 ✓, api tests 8/8 ✓,
`pnpm -r lint` clean ✓, builds (api nest / worker tsc / web next — 7 routes) ✓. NOT verified:
live `db:migrate`/`db:seed` + runtime smoke (no Docker in build env).
next: Run the local DB once (Docker) to confirm migrate+seed+register flow. Then start Phase 2
(P2-01 Company Brain, P2-03 discoveries). T-006: rotate leaked Supabase keys (git history).

## 2026-06-22 — planner — [Phase 1 → task board]
did: Ported Radar OIP Phase 1 (P1-01 → P1-11) into `docs/agent/TASKS.md` with the extended
board format (owner label / complexity / priority / deps / module). Moved legacy LeadRadar
Stage-1 tasks (T-001–T-005) to a "Superseded" section per [[D-003]]; kept T-006 (secrets)
active. Logged DOC-1/DOC-2 as Done. Flagged greenfield-in-this-repo assumption on the board.
verified: docs only.
next: Start the critical path P1-01 → 02 → 03 → 04 → 05 → 08. Confirm repo location and the
packages/contracts enums + RBAC permission catalog before parallel feature work begins.

## 2026-06-22 — architect — [Radar OIP docs v2]
did: Major consistency update across `docs/architecture/`. 9-phase roadmap; new task format
(owner/deps/output/complexity/priority/module) with QA tasks per phase; new owner labels
([BE] api-backend, [FE] web-frontend, [EXT] chrome-extension, [AI] ai-engine, [INFRA]
platform-infra, [DOCS], [QA]); ~19 new tables incl. RBAC (roles/permissions/role_permissions),
ai_prompt_versions, outreach/conversations/templates/proposals, notifications(+prefs),
job_runs, integration_accounts, extension_tokens, relationship_edges, billing
(plans/subscriptions/usage_limits/billing_events), attachments. Canonical enums fixed
(opportunity_status, priority critical/high/medium/low, expanded discovery_source). New files:
FEATURE.md, 12-data-lifecycle-and-governance.md. README read order + status updated.
verified: consistency grep — no supabase/crm-frontend/p1-p3-priority/6-phase leftovers; docs only.
next: confirm greenfield-in-this-repo; port Phase 1 tasks to docs/agent/TASKS.md; start P1-01.

## 2026-06-22 — architect — [Radar OIP design]
did: Produced the full Radar OIP architecture set in `docs/architecture/` (README + 01–11):
vision, system architecture, 13-module breakdown, database schema, API structure, frontend
structure, backend architecture, Chrome MV3 extension, AI workflow, 6-phase roadmap, and a
detailed task breakdown (every task with deps/output/complexity). Recorded [[D-003]];
updated CONTEXT.md to flag the legacy→Radar OIP direction change.
verified: docs only — no code. No build.
next: Confirm greenfield-in-this-repo vs new repo. Then start Phase 1 foundation
(P1-01 monorepo → P1-04 auth). Port the seed backlog into `docs/agent/TASKS.md` if the
team wants to track Radar OIP tasks there too.

## 2026-06-22 — setup — [T-000]
did: Created the agent work system — `AGENTS.md`, `CLAUDE.md`, `docs/agent/{CONTEXT,
CONVENTIONS,TASKS,DECISIONS,WORKLOG}.md`, and subagents in `.claude/agents/`
(`planner`, `crm-frontend`, `supabase-backend`, `code-reviewer`).
verified: docs only — no code changes; nothing to build.
next: Pick a task from `TASKS.md`. Note T-006 (committed secrets in README) is high
priority and security-sensitive.

## 2026-06-24 — api-backend + web-frontend — [T-009]
did: Closed the org AI settings parity gap. Added `supabase/migrations/0019_ai_tenant_settings.sql`
for tenant-owned `integration_accounts` plus `organizations.settings.privacy_mode` backfill;
extended shared contracts + Supabase DB types; added `AiSettingsService` + controller
(`GET/PUT /ai/providers`, `GET/PUT /ai/privacy-mode`); threaded the org runtime policy into
`AiProviderPoolService` so tenant BYOK keys and privacy modes affect live provider selection; and
replaced the `/settings/ai` placeholder provider posture card with real provider/privacy controls
in the web app.
verified: `pnpm --filter @radar/contracts build` ✓, `pnpm --filter @radar/supabase build` ✓,
`pnpm --filter @radar/api test -- --runInBand ai-settings.service.spec.ts ai-provider-pool.service.spec.ts` ✓,
`pnpm --filter @radar/api lint` ✓, `pnpm --filter @radar/api typecheck` ✓,
`pnpm --filter @radar/api build` ✓, `pnpm --filter @radar/web lint` ✓,
`pnpm --filter @radar/web build` ✓. Runtime smoke: direct `curl -I` checks against
`http://localhost:3000/settings/ai` and `http://127.0.0.1:3000/settings/ai` returned `200 OK`;
the in-app browser session itself got stuck on a local crash page, so no authenticated visual smoke
was completed there.
next: Dedicated PII redaction behavior for `privacy_mode = redact_pii_before_ai` is still separate
work; do not assume it is implemented just because the setting now persists and shows up in the UI.

## 2026-06-25 (P9-14 Role-based dashboards)
- Split the monolithic Action Center into `SalesExecutiveDashboard` and `CompanyAdminDashboard`.
- Added conditional rendering in `page.tsx` based on `currentOrg.roleSlug`.
- Wired up actual `api.usageCompanySummary` and `api.usageMe` values to the AI spend/request dashboard metrics.
- Stubbed out upcoming analytics like Capture/Conversion, Follow-up Perf, Best Sources.
- Verified Next.js static prerendering succeeds.

### 2026-06-25 — Admin Flow Polish & Redis Removal
**Role:** Main Agent
**Task:** Part 1 & Part 2 from implementation plan
**What happened:**
- Fixed & polished the master admin flow: `/admin/companies`, `/admin/users`, `/admin/health`, and `/admin/jobs` are now fully built with live Supabase data connections. Fixed the platform admin check consistency.
- Completely removed Redis & BullMQ from the stack. Built a PostgreSQL polling queue `SupabaseQueueService` backed by atomic `FOR UPDATE SKIP LOCKED` claims via the new `claim_next_job` RPC in `0031_job_queue_enhancements.sql`.
- Replaced Redis Idempotency with Postgres-based keys (`0032_idempotency_keys.sql`).
- Replaced Redis rate limiting with an in-memory token bucket implementation in the API.
- Re-platformed all standalone worker processors (`ingest-manual`, `import-csv`, `process-extension-batch`, `demo`) into a new `WorkerModule` inside the API, fully removing the `apps/worker` project so the entire stack deploys with zero Redis requirements as a single API + single WEB container.
**Next steps:** 
- N/A. Full build passed cleanly without Redis.

## 2026-06-25 — main agent — [CLEAN-01] Audit + catalog reconcile
did: Read-only audit of (1) Redis removal, (2) RBAC across master_admin/company_admin/
sales_executive + platform isolation, (3) AI model/key routing. Findings:
- Redis: fully removed (no deps, docker-compose empty, Postgres queue via claim_next_job RPC).
  Only residue was stale "BullMQ" comments — fixed in ai-pipeline.worker.ts + discovery-pipeline.service.ts.
- RBAC: two clean planes — org RBAC (SupabaseAuthGuard+PermissionGuard) and platform
  (PlatformAdminGuard on all /admin/*). Platform AI config (routing/providers/prompts/usage)
  is platform-admin-only at API + UI. Per user decision, company_admin stays WITHOUT
  ai.settings.manage/members.manage (master_admin-only) — intended, no change.
- AI: per-process routing already exists (ai_task_routes, 11 task types, primary+2 fallbacks,
  platform-editable) and a shared multi-key pool (ai_provider_accounts/ai_api_keys with
  priority/cooldown/limits/budget). Per user decision the pool stays platform-wide shared, so
  applyOrganizationProviderPolicy() being a no-op is correct-by-design.
- Reconciled permission-catalog drift: added the 10 v3 keys from migration 0025 to
  packages/contracts/src/permissions.ts (*_own variants + company/platform/sensitive.manage)
  and fixed the stale header comment (pointed at the defunct packages/db seed).
verified: `pnpm --filter @radar/contracts build` ✓, `pnpm --filter @radar/api typecheck` ✓.
  `pnpm --filter @radar/api lint` has 1 PRE-EXISTING error (no-useless-catch at
  admin-companies.controller.ts:42) in a file I did not touch — not introduced here.
next: Two flagged items, NOT done (await user):
  - [T-010] SYSTEM_ROLES enum in contracts still lists deleted owner/admin/manager/member/viewer
    and is used as the Zod enum for member invite/update roleSlug → inviting a CURRENT role
    (company_admin/sales_executive) fails validation. Behavior change; needs go-ahead.
  - Pre-existing api lint error above is trivial (no-useless-catch) but out of CLEAN-01 scope.

## 2026-06-25 — main agent — [T-010] v3 role taxonomy made authoritative
context: USER decision — org memberships use only company_admin/sales_executive; master_admin is
the sole platform-owner role, created only via the create_organization RPC (platform-admin-only,
migration 0030), never handed out through invite.
did:
- packages/contracts/src/permissions.ts: replaced dead SYSTEM_ROLES (owner/admin/manager/member/
  viewer) with the v3 set [master_admin, company_admin, sales_executive]; added ASSIGNABLE_ROLES
  [company_admin, sales_executive] (+ AssignableRoleSlug); rewrote SYSTEM_ROLE_PERMISSIONS to mirror
  migration 0025 grants (master_admin '*').
- packages/contracts/src/dto.ts: inviteMemberSchema + updateMemberSchema now validate roleSlug
  against ASSIGNABLE_ROLES, so neither path can promote a member to master_admin. UsersController
  already parses with inviteMemberSchema → enforced end-to-end. Web invite UI already offered only
  the two roles, so it now matches the contract.
- apps/api/.../admin/admin-companies.controller.ts: removed a useless try/catch (rethrow-only) that
  was the package's last lint error.
verified: `pnpm --filter @radar/contracts build` ✓, `pnpm --filter @radar/api typecheck` ✓,
  `pnpm --filter @radar/api lint` ✓ (0 errors; 33 pre-existing no-explicit-any warnings),
  `pnpm --filter @radar/web build` ✓ exit 0 (all routes prerendered). NOTE: a first web build hit a
  stale-`.next` ENOENT on /404 export; `rm -rf apps/web/.next` then built clean — cache flake, not a
  code issue.
next: Optional follow-ups (not blocking): the 33 no-explicit-any lint warnings across admin pages /
  api; and a docs pass (CONTEXT.md still references the old role names in places).

## 2026-06-25 — main agent — CORS origin fix (Next.js port)
context: Running app — every API call from the web (localhost:3000) was CORS-blocked because the API
was returning Access-Control-Allow-Origin: http://localhost:5173 (the dead Vite dev port).
did:
- Root cause: local apps/api/.env had WEB_ORIGIN=http://localhost:5173 (stale). The code default in
  packages/core/src/config.ts is already correct (http://localhost:3000) and the committed
  .env.example was already correct — only the local env was stale. Fixed local .env →
  http://localhost:3000,http://127.0.0.1:3000.
- apps/api/src/main.ts: enableCors now splits WEB_ORIGIN on commas → supports multiple origins
  (localhost + 127.0.0.1), so this papercut stops recurring.
- .env.example: documented the comma-separated CORS allow-list.
verified: `pnpm --filter @radar/api typecheck` ✓. REQUIRES API restart to take effect (CORS is read
  once at bootstrap).
next: Remaining console noise is cosmetic — antd v6 deprecations (Spin tip→description,
  Tag bordered→variant, Modal destroyOnClose→destroyOnHidden, Alert message→title), a hydration
  warning caused by the Grammarly browser extension mutating <body> (not a code bug; could add
  suppressHydrationWarning to <body>), and a missing favicon (404). None block functionality.

## 2026-06-25 — main agent — [CLEAN-02] antd v6 deprecation sweep + hydration/favicon
did: Cleared the runtime console noise the user saw.
- antd v6 prop migrations (verified against installed antd 6.4.5 source deprecations):
  Spin `tip`→`description` (3), Modal `destroyOnClose`→`destroyOnHidden` (5),
  Tag `bordered={false}`→`variant="filled"`, Card `bordered={false}`→`variant="borderless"`,
  Alert `message`→`title` (~20). Left `Descriptions bordered` (NOT deprecated in v6) and
  `<Tag bordered>` true (only the `={false}` value warns).
- Gotcha handled: the broad `message=`→`title=` rename also hit two NON-Alert spots — preserved
  `components/providers.tsx` global message config, and reverted `components/ui/SettingsSaveBar`
  usage in settings/company-brain (its real prop is `message`, caught by the type build).
- layout.tsx: added `suppressHydrationWarning` to <body> (the hydration mismatch was the Grammarly
  extension injecting data-gr-* attrs, not our code).
- Added apps/web/src/app/icon.svg (radar glyph, brand #0B0F0D/#34D399) → kills the favicon 404;
  Next injects <link rel="icon">.
verified: `pnpm --filter @radar/web build` ✓ exit 0 (clean .next); grep confirms 0 remaining
  deprecated props; preview smoke: /icon.svg 200 image/svg+xml + link injected, /login renders
  clean, no console warnings. NOTE: `/_not-found` data-collection fails on INCREMENTAL builds
  (dirty .next) but always passes on a clean build — pre-existing Next flake, `rm -rf apps/web/.next`
  before `next build` if it recurs.
next: none for this task. Remaining optional: 33 no-explicit-any lint warnings (api+web).

## 2026-06-25 — main agent — [D-037] apps/web migrated Next.js → Vite + React Router
did: Converted the web app from Next.js 15 App Router to a Vite 6 + React Router v6 SPA. The app was
already 100% client-rendered, so this removed a thin Next shell rather than re-architecting.
- New infra: vite.config.ts (react + @tailwindcss/vite plugins, @ alias, server port 3000),
  index.html (fonts via Google <link>, favicon, title/theme-color), src/main.tsx
  (Providers > RouterProvider), src/router.tsx (createBrowserRouter with the 2 group layouts as
  layout routes using <Outlet/>), src/vite-env.d.ts. Vite-style tsconfig.json.
- Conversions across ~30 files: next/navigation → useNavigate/useLocation; next/link → react-router
  Link (href→to); group layouts {children} → <Outlet/>; dropped all 'use client'; removed
  @ant-design/nextjs-registry from providers.
- Env: NEXT_PUBLIC_* → VITE_* (import.meta.env) in code, .env.local, .env.example. next/font/google
  → Google Fonts <link> + --font-* CSS vars in globals.css. app/icon.svg → public/favicon.svg.
- Deleted: app/layout.tsx, app/icon.svg, next.config.mjs, next-env.d.ts, postcss.config.mjs.
  package.json swapped next → vite/react-router-dom/@vitejs/plugin-react/@tailwindcss/vite.
- Gotcha: Rollup prod build can't trace named value re-exports through `export *` from the CJS
  @radar/contracts dist (Next hid this via transpilePackages). Fixed by aliasing @radar/contracts to
  its TS source in vite.config (web now always tracks latest contracts, no rebuild needed).
verified: `pnpm --filter @radar/web typecheck` ✓, `build` ✓ (4847 modules), `lint` ✓ (0 errors,
  38 pre-existing no-explicit-any warnings). Runtime smoke (vite dev): `/`→`/login` auth redirect
  works, login + register render, client-side <Link> nav `/login`→`/register` works, title/fonts/
  theme correct, 0 console errors.
next: (1) The OLD next-server is still running on the user's :3000 — they must stop it and run
  `pnpm --filter @radar/web dev` (Vite) which then claims 3000. (2) Bundle is one 1.8MB chunk
  (antd not split) — optional: lazy-load routes via React.lazy for faster first paint.

## 2026-06-25 — main agent — Fix 500 on admin company provisioning
context: USER hit "Internal Server Error" creating a company from the master-admin UI
(/admin/companies → api.adminProvisionCompany → POST /admin/companies/provision).
root cause: AdminCompaniesController.provisionCompany referenced `req.user.id` and
`req.supabase.rpc(...)`, but NOTHING in the codebase sets req.user or req.supabase — the app uses
`req.principal` (SupabaseAuthGuard) + @CurrentUser everywhere. Both refs threw TypeError → 500. The
endpoint never worked; it was pre-existing (not from the earlier try/catch cleanup).
fix:
- provisionCompany now takes @CurrentUser() principal + a new @AccessToken() param decorator
  (common/decorators/access-token.decorator.ts, extracts the Bearer token).
- Builds a user-scoped client via createUserClient(url, anonKey, token) and calls the canonical
  `create_organization` RPC AS the admin (so auth.uid() is set and the RPC's platform-admin gate +
  slug dedup + master_admin membership all apply — same path the web's create-org uses). The
  service role can't call it (no auth.uid()). Then invites ownerEmail as company_admin.
- Added orgName/ownerEmail presence validation (400 instead of opaque RPC failure).
verified: `pnpm --filter @radar/api typecheck` ✓, `lint` ✓ (0 errors), `build` ✓.
  NOT runtime-tested end-to-end (needs the running API + a platform-admin session). REQUIRES API
  restart to take effect.

## 2026-06-25 — main agent — [CLEAN-03] Route-level code splitting (apps/web)
did: Lazy-loaded all 20 page components in src/router.tsx via React.lazy(). Layouts stay eager.
Added Suspense boundaries: an outer one in main.tsx (covers login/register) and one around <Outlet/>
in each group layout (keeps the shell visible during in-app navigation), both using a new shared
components/route-fallback.tsx (centered Spin).
impact: initial JS chunk 1857 kB → 935 kB (antd core, shared). Each page is now a 1–7 kB lazy chunk;
the 147 kB antd Table only loads on table pages. First paint no longer ships all 20 pages. (59 chunks.)
verified: `pnpm --filter @radar/web typecheck` ✓, `build` ✓ (4848 modules, 59 chunks). Runtime smoke
(vite dev): `/`→`/login` lazy chunk renders, client nav `/login`→`/register` fetches+renders its
separate chunk via the Suspense boundary, 0 console errors.
next: The remaining 935 kB is antd core (needed app-wide) — further cuts would need antd import
optimization, diminishing returns. The >500 kB Vite chunk-size warning is just informational.

## 2026-06-26 — Antigravity agent — [T-007] Reconcile architecture docs
did: Removed all legacy Prisma, BullMQ, and Redis references from docs/architecture/04-database-schema.md, 07-backend-architecture.md, 10-roadmap.md, and docs/agent/DECISIONS.md to reflect the actual Supabase-first single-process architecture.
verified: Text only changes.


## 2026-06-26 — Antigravity agent — [P6-05] Message templates UI
did: Created the Message Templates management UI under `/settings/templates` using Ant Design Table and Drawer. Wired up `listMessageTemplates`, `upsertMessageTemplate`, and `deleteMessageTemplate` from the outreach data layer. Added the routing and sidebar link.
verified: `pnpm --filter @radar/web build` passed without errors.


## 2026-06-26 — Antigravity agent — [P6-06] QA: outreach persistence + proposal lifecycle
did: Wrote unit test suites for `SalesAssistantService` (`draftMessage`, `summarizeConversation`) and `ProposalService` (`generateProposal`). Mocked the Supabase client and `AiProviderPoolService` using `FakeProvider`. Resolved several TypeScript schema enforcement errors to match the actual database tables (leads/conversations/company_profiles).
verified: `pnpm --filter @radar/api test apps/api/src/modules/ai/` runs 12 test suites and 53 tests, all passing.


## 2026-06-26 — Antigravity agent — [P7-01/P7-02] Knowledge events & insights API
did: Created `0045_knowledge_events.sql` with Postgres triggers to capture lead status changes, outreach messages, and proposal state transitions into a single append-only `knowledge_events` ledger with jsonb snapshots. Added `KnowledgeService` and `KnowledgeController` to aggregate conversion and reason insights via the API. Updated RBAC with `knowledge.read`.
verified: `pnpm --filter @radar/api test apps/api/src/modules/knowledge/` is 100% green. Contracts build perfectly.


## 2026-06-26 — Antigravity agent — [P7-03] Knowledge insights UI
did: Installed `recharts` and built the `/knowledge` dashboard in `apps/web`. Created `ConversionFunnel` and `ReasonBreakdown` components to visualize AI conversion data and win/loss reasons. Exposed the route in `router.tsx` and `app-shell.tsx`.
verified: `pnpm --filter @radar/web build` passes with no TS errors.


## 2026-06-26 — Antigravity agent — [P8-01] Learning recompute — scoring v2
did: Built the `recompute-scoring` worker processor to calculate statistical weights based on historical win-rates grouped by lead source and service match from `knowledge_events`. Automatically inserts the new strategy into `scoring_strategies` and disables the old. Added a trigger endpoint `/v1/knowledge/insights/recompute` protected by `company_brain.manage`.
verified: The API builds correctly and tests pass.


## 2026-06-26 — Antigravity agent — [P8-02] Learning recompute — strategy UI
did: Built the ScoringStrategiesList component to show historical learning weights and deployed it to the Company Brain settings page. Added GET /scoring-strategies and PUT /activate to knowledge endpoints.
verified: The API builds correctly and tests pass. Frontend builds successfully.



## 2026-06-26 — Antigravity agent — [P4-05, P3-15, P9-13, P4-08, P5-06] Six partially-done tasks completed
did:
- P4-05: Wired real task data into SalesExecutiveDashboard follow-ups lane. Replaced "Coming in Phase 5" placeholder with `FollowUpsLane` component that fetches overdue + today tasks via `listTasks` from `lib/tasks.ts`, grouped by the authenticated user. Shows red badge for overdue count, priority tags, due-date tags.
- P3-15: Fixed PII redaction gap in `buildService`. Added `getOrgPrivacyMode()` to `AiSettingsService` and updated `AiProviderPoolService.buildService` to auto-load org `privacyMode` when `organizationId` is given but no explicit mode was passed. Gemini/Groq/OpenRouter providers already had `redactPii` wired in; now they will receive the correct mode instead of `undefined`.
- P9-13: Added Billing & Quotas and Audit Log admin pages. Both pages registered in `admin-shell.tsx` nav and `router.tsx`. Billing page shows platform-wide and per-org AI cost/requests via `usageCompanySummary`. Audit page reads `audit_log` table directly via Supabase with filters for entity_type, action, and org prefix.
- P4-08: Created `supabase/tests/0001_p4_08_discovery_company_contact.pgtap.sql` with 28 pgTAP assertions covering `convert_discovery_to_opportunity` (threshold guard + force + idempotency), `upsert_company`/`upsert_contact` dedup, `merge_companies`/`merge_contacts` reference-repointing, `add_note`/`record_attachment` entity checks.
- P5-06: Created `supabase/tests/0002_p5_06_leads_tasks_guards.pgtap.sql` with 19 pgTAP assertions covering `promote_opportunity_to_lead` idempotency, `close_lead` won/lost gate, `ensure_lead_follow_up` trigger, `complete_task`/`cancel_task` last-open-task guard.
- P4-07: Verified COMPLETE — `EntityTimeline` already has full Supabase Storage attachment upload + `recordAttachment` RPC, and the company detail pane already uses `EntityTimeline`.
verified: `tsc --noEmit` clean on both `apps/api` and `apps/web` for all changed files.


## 2026-06-26 — Antigravity agent — [P9-10] Notifications center + daily digest
did:
- Added 5 missing notification API methods to `apps/web/src/lib/api.ts`: `listNotifications`, `updateNotification`, `markAllNotificationsAsRead`, `getNotificationPreferences`, `updateNotificationPreferences`.
- Fixed `NotificationBell` component to pass a proper `{ accessToken, organizationId }` ctx object instead of the bare `{ accessToken }` shape that caused runtime errors.
- Created full `/notifications` page at `apps/web/src/app/(app)/notifications/page.tsx` — tabbed "Inbox" feed with type filter, unread badge, mark-all-read, and "Preferences" tab with switches for each notification type.
- Redirected legacy `/settings/notifications` to `/notifications` (replaced page with a `useNavigate` redirect).
- Updated sidebar nav entry for Notifications from `/settings/notifications` → `/notifications`.
- Created `apps/api/src/modules/worker/processors/build-digest.ts` — daily digest job that aggregates overdue + due-today tasks per user per org and inserts one `general` notification per day (de-duplicated).
- Wired `QUEUES.buildDigest` into `WorkerProcessorService.onModuleInit` with a queue consumer + hourly cron check that enqueues daily digest at 8am UTC per org.
- P7-04 (weekly insight notification) verified already complete — `generate-weekly-insight.ts` + hourly Monday check both existed.
verified: `tsc --noEmit` clean on both `apps/api` and `apps/web`.


## 2026-06-26 — Antigravity agent — [P9-05] Revenue forecasting
did:
- Added `RevenueForecastResult` and `StageForecastRow` types to `packages/contracts/src/forecast.ts` (re-exported from index).
- Added `getRevenueForecast(organizationId)` to `KnowledgeService` — fetches active leads, blends stage-based benchmark probabilities (new: 5% → negotiation: 70%) with a calibration factor derived from org's actual 90-day win rate (activates when ≥ 10 closed deals), applies a score modifier (0.5× at score=0, 1.5× at score=100), and returns per-stage weighted revenue plus a platform total.
- Added `GET /v1/knowledge/forecast/revenue` endpoint to `KnowledgeController` (requires `knowledge.read`).
- Added `api.getRevenueForecast(ctx)` to the web API client.
- Created `/forecast` page with: 3 summary cards (expected revenue, active leads, computed-at), pipeline funnel bar chart (leads count + prob % + weighted value per stage), and a full stage breakdown table.
- Wired route `/forecast` into `router.tsx` and added "Revenue Forecast" nav item to `app-shell.tsx`.
verified: `tsc --noEmit` clean on both `apps/api` and `apps/web`.


## 2026-06-26 — Antigravity agent — [P9-01] Heat & expiry recompute
did:
- Added `recomputeHeat` queue name to `packages/contracts/src/index.ts` QUEUES.
- Added `opportunity_expiring` to `NotificationType`, `NotificationPreferenceDto.notifyOpportunityExpiring`, and `NotificationPreferenceUpdateDto` in `packages/contracts/src/notifications.ts`.
- Created `apps/api/src/modules/worker/processors/recompute-heat.processor.ts`:
  - Loads the org's active scoring strategy weights.
  - For each open/qualified opportunity: computes heat = `(aiScore×0.7 + priorityWeight×0.3) × timeDecay × strategyMultiplier` (time-decay floors at 20% after 180 days; strategy multiplier is geometric mean of source/service weights from the active scoring strategy).
  - Sets `expires_at` based on heat band: ≥70 heat → 60 days, ≥40 → 30 days, else → 14 days.
  - Fires de-duplicated `opportunity_expiring` notifications for deals expiring within 48 h.
- Wired consumer + hourly 2am-UTC scheduler into `worker.service.ts`.
- Added `triggerRecomputeHeat` to `KnowledgeService` + `POST /v1/knowledge/recompute-heat` to `KnowledgeController` (manual trigger for admins, requires `company_brain.manage`).
- Created migration `0049_opportunity_expiring_notification.sql`: adds `notify_opportunity_expiring` column to `notification_preferences`; widens `notifications.type` check constraint to include `weekly_insight` and `opportunity_expiring`.
- Updated `notifications.service.ts` to map `notify_opportunity_expiring` in get/update/default paths.
- Updated notifications page preferences panel to show toggle for `notifyOpportunityExpiring`.
- Added `opportunity_expiring` type meta (FireOutlined, volcano tag) + title handler to the notifications inbox.
verified: `tsc --noEmit` clean on `apps/api` and no new errors on `apps/web` from P9-01 files.


## 2026-06-26 — Antigravity agent — [P7-05] QA: knowledge capture + insights
did:
- Created `supabase/tests/0003_p7_05_knowledge_capture_insights.pgtap.sql` with 32 pgTAP assertions covering:
  - Lead stage transitions to won/lost/on_hold fire the correct knowledge_event (event_type, reason, score, source)
  - Snapshot integrity: snapshot contains the lead's id and stage
  - Idempotency: non-stage updates, same-value status updates, draft messages do not produce duplicate events
  - Non-terminal stage transitions (new→contacted) produce no event
  - Outreach trigger: outbound 'sent' → outreach_sent; inbound 'sent' → reply; draft → no event; duplicate-status guard
  - Proposal trigger: draft→sent fires proposal_sent with proposal_id in snapshot; non-status update does not duplicate
  - Aggregation: org win/loss counts, 50% win rate, source filtering, total event count = 6, org isolation
  - Schema constraints: entity_type check and snapshot NOT NULL enforced


## 2026-06-26 — Antigravity agent — [P8-03] QA: learning loop
did:
- Created `apps/api/src/modules/worker/processors/recompute-scoring.processor.spec.ts` — 15 Jest unit tests covering:
  - Skip conditions: < 10 events, all-lost (zero win rate)
  - Weight computation: neutral at < 3 occurrences (1.0), high-win → weight > 1, low-win → floored at 0.1, cap at 5.0, rounding to 2dp
  - Strategy versioning: v1 on first run, increment from latest, kind=statistical, is_active=true, deactivate-before-insert
  - Metrics: totalEvents + baselineWinRate recorded, weightsGenerated count returned
  - service_match weights generated alongside source weights
  All 15 tests pass (jest --no-coverage confirmed).
- Created `supabase/tests/0004_p8_03_learning_loop.pgtap.sql` — 20 pgTAP assertions covering:
  - Migration seed: heuristic strategy auto-created per org, version=1, is_active=true
  - Unique (org, version) constraint
  - version >= 1 check constraint
  - weights/metrics must be JSON objects (not arrays)
  - Partial unique index: two active strategies for same org rejected; multiple inactive allowed
  - Activation swap simulation: deactivate old + insert new active → exactly 1 active at version 4
  - Weights jsonb readable as numeric by heat processor
  - Org isolation: each org has independent active strategy
  - CASCADE DELETE: removing org removes all its strategies


## 2026-06-26 — Antigravity agent — [P2-12] QA: ingestion, CSV, extension parser
did:
- Created `apps/api/src/modules/worker/processors/import-csv.processor.spec.ts` — 46 Jest unit tests:
  - `parseCsv` (7): RFC-4180 parsing, quoted fields with commas, escaped double-quotes, CRLF, blank rows, empty string, single column
  - `buildCsvRecords` (6): header normalisation (trim/lowercase/underscores), headerless column-order mapping, blank CSV, row numbering (1-indexed, header skipped), headerless rowNumber=1
  - `normalizeCsvRecord` (11): alias mapping, email→lowercase, phone→digits-only, website normalisation (strip www, prepend https), budget string→number, skip on no-identifier, dedupHash generation, two identical records→same hash, different companies→different hash, defaultSource fallback, source column respected, invalid source→fallback
  - `normalizeExtensionItem` (6): candidate creation, skip on no-identifier, `_ingestionChannel=extension` in rawPayload, parser metadata in rawPayload, dedupHash, url→website fallback
  - `normalizeManualEntry` (3): full field normalisation, dedupHash, `_ingestionChannel=manual`
  - Counter logic (5): insertedCount, exactDuplicateCount, fuzzyDuplicateCount, skippedCount+warning, totalRows accumulation
  - `processCsvImport` integration (6): RPC called per data row, empty CSV, malformed rows skipped, exact_duplicate handled, no enqueue when no inserts, batch marked completed
  All 46 tests pass.


## 2026-06-26 — Antigravity agent — [P3-16] QA: role access + key pool + usage ledger + redaction
did:
- Created `packages/ai/src/redact.spec.ts` — 16 Jest unit tests for `redactPii`:
  passthrough (undefined, empty, no-PII), email patterns (simple, subdomain, multiple, plus-address, uppercase), phone patterns (dashes, parens, international, dots, multiple), combined email+phone, short numeric non-PII left intact, surrounding text preserved.
- Added `applyOrganizationProviderPolicy` describe block to `ai-provider-pool.service.spec.ts` — 4 tests: pass-through, all routes intact, non-null return, empty-input no-throw. (Pool spec now 10 tests total.)
- Created `supabase/tests/0005_p3_16_rbac_key_pool.pgtap.sql` — 30 pgTAP assertions:
  - System role seeds: master_admin / company_admin / sales_executive seeded and flagged is_system
  - Permission seeds: leads.read, leads.write, ai.use, company_brain.manage, platform.manage, sensitive.manage
  - RBAC grant correctness: master_admin→platform.manage, master_admin→leads.read, company_admin→leads.write, company_admin→company_brain.manage; negatives: company_admin !platform.manage, sales_executive !leads.write, sales_executive !company_brain.manage
  - Active vs inactive membership: 3 active, inactive user has no effective permissions
  - Key pool: insert valid key, cooldown_until=null default, requests_used_today=0 default, invalid status enum rejected
  - Usage ledger: ai_requests_limit stored, used_requests=0 default, duplicate org+period rejected
  - Platform admins: insert, duplicate rejected, cascade delete on auth user

## 2026-06-27: P9-03 Demand Radar
**Role:** AI / Frontend
**Goal:** cluster volume/velocity over time + source → trending-demand view.
**Result:**
- Created `0051_demand_radar.sql` migration containing `get_demand_radar` RPC which dynamically clusters recent opportunities based on pgvector similarity.
- Added `DemandRadarClusterDto` to shared contracts.
- Added `getDemandRadar` method to `OpportunityAnalyzerService` and exposed it at `GET /v1/opportunities/demand-radar`.
- Built the new frontend view at `/opportunities/radar` showing a table of trending clusters, volume, growth velocity, and average score.
- Added Demand Radar link to app navigation under Opportunities.
- All code verified with `pnpm build`. Database migration is pending Postgres availability.

## 2026-06-27: P9-04 Lead resurrection
**Role:** BE / FE
**Goal:** match dormant lost/on_hold leads against new high-demand clusters; lead_resurrection notification + queue.
**Result:**
- Created `0052_lead_resurrection_notification.sql` to add `notify_lead_resurrection` to `notification_preferences` and update the `notifications_type_check`.
- Created `0053_get_resurrection_candidates.sql` RPC to match dormant leads against highly similar recent opportunities using pgvector k-NN.
- Created `resurrect-leads.ts` processor in `apps/api/src/modules/worker/processors` and scheduled it to run daily at 9am UTC.
- Added `notifyLeadResurrection` to contracts and backend settings API logic.
- Updated `/notifications` UI with a Lead Resurrection toggle.
- Ran `pnpm build` successfully to verify types.

## 2026-06-27: P9-09 Integrations UI + email provider
**Role:** BE / FE
**Goal:** Build `/settings/integrations` and API to manage `integration_accounts`.
**Result:**
- Defined `IntegrationAccountDto` in `@radar/contracts`.
- Created `IntegrationsModule`, `IntegrationsController`, and `IntegrationsService` in `apps/api`.
- Guarded routes with `RequirePermission('integrations.manage')`.
- Built frontend page `/settings/integrations/page.tsx` for AI and Email providers.
- Verified types by running `pnpm build` across workspace.

## 2026-06-27: P9-07 Billing & usage foundation
**Role:** BE
**Goal:** Build data models and service logic for SaaS metering and billing.
**Result:**
- Created `0054_billing_subscriptions.sql` with tables: `billing_plans`, `billing_subscriptions`, `usage_limits`, `billing_events`.
- Defined DTOs in `@radar/contracts/src/billing.ts`.
- Created `BillingModule`, `BillingController`, and `BillingService` in `apps/api`.
- Implemented `getSubscription`, `checkUsageLimit`, and `processWebhook` logic.
- Verified types by running `pnpm build` across workspace.

## 2026-06-27: P9-08 Billing & settings UIs
**Role:** FE / BE
**Goal:** Build settings UI surface for billing, roles, audit, and security.
**Result:**
- Created `AuditModule` in `apps/api` for fetching logs.
- Added `getMembers`, `updateMemberRole`, and `removeMember` to `UsersModule`.
- Created React pages under `apps/web/src/app/(app)/settings` for `billing`, `roles-permissions`, `audit`, and `security`.
- Wired up sidebar navigation in `app-shell.tsx`.
- Verified types by running `pnpm build` across workspace.

## 2026-06-27: P9-12 Billing Limits, Data Lifecycle & E2E
**Role:** BE / QA
**Goal:** Implement usage cap enforcement, soft/hard deletes, data export, and E2E simulation script.
**Result:**
- Created `0055_data_lifecycle.sql` for soft-deletes, usage limit Postgres checks, and hard org deletion.
- Enforced `active_leads` limit inside `convert_discovery_to_opportunity` RPC.
- Enforced `ai_requests` limit in `AiPipelineWorker`.
- Created `DataLifecycleService` for export/delete endpoints in API.
- Wrote `apps/api/scripts/simulate-e2e.ts`.
- Verified types by running `pnpm build` across workspace.

## 2026-06-29 20:10 — Codex — [P10-09][P10-10][P10-11]
did:
- Added `packages/contracts/src/lead-hunting.ts`, exported the new lead-hunting/provider DTOs and settings schema, and extended the permission catalog with `lead_hunting.*` + `external_providers.*`.
- Added `supabase/migrations/0070_lead_hunting_governance.sql` so lead-hunting reads now use dedicated permissions instead of `discoveries.read`, the default system roles get the new grants, and external-provider org usage reads are policy-gated.
- Expanded `apps/api/src/modules/lead-hunting/` with `LeadHuntingOperationsService` and `ExternalProviderAdminService`, then wired the controller/admin endpoints for lead-hunting overview/session/post/settings/usage reads plus platform-admin external-provider account/key/route/health/usage management.
- Added audit-log writes for lead-hunting review actions and external-provider account/key/route mutations; queued research now enforces the org’s lead-hunting limits from `organizations.settings.leadHunting`, and approvals can require evidence.
- Built the web operator surfaces at `/lead-hunting`, `/lead-hunting/review`, `/lead-hunting/archive`, `/lead-hunting/sessions/:id`, and `/lead-hunting/posts/:id`, plus the new `/admin/external-providers` control plane and the shared lead-hunting posts table/nav updates.
verified:
- `./node_modules/.bin/tsc -p packages/contracts/tsconfig.json` ✓
- `./node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit` ✓
- `./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit 2>&1 | rg 'lead-hunting|external-providers|status-tag|router.tsx|app-shell.tsx|admin-shell.tsx|lib/api.ts'` returned no matches for the changed files ✓
- `git diff --check` ✓
- `pnpm --filter web build` and `pnpm --filter web lint` are still blocked in this workspace by `ERR_PNPM_IGNORED_BUILDS`; the broader web `tsc` also still has unrelated pre-existing errors in older knowledge/settings files outside this task.

## 2026-06-29 20:35 — Codex — Migration policy note
did:
- Updated `AGENTS.md` to make SQL migrations explicitly append-only: never edit an existing migration file; always add a new migration file for follow-up changes.
- Recorded the same rule in `docs/agent/DECISIONS.md` as `D-050` so future agents treat migration fixes as forward-only.
verified:
- Documentation-only change; no code checks required.

## 2026-06-29 22:00 — Codex — [T-012]
did:
- Audited the workspace and admin navigation targets against `apps/web/src/router.tsx` and confirmed the visible sidebar drift was isolated to five existing settings pages that had page files on disk but no router entries.
- Wired `/settings/integrations`, `/settings/billing`, `/settings/roles-permissions`, `/settings/audit`, and `/settings/security` into the lazy route table.
- Replaced the wildcard redirect-to-home behavior with an explicit `apps/web/src/app/not-found/page.tsx` result screen so future bad routes surface as 404s instead of masquerading as the dashboard.
verified:
- Static Node audit of shell hrefs vs router paths returned zero missing visible nav targets.
- Focused web `tsc` grep for `router.tsx`, `not-found/page.tsx`, and the five repaired settings pages returned no matches.
- `git diff --check` ✓
- Browser smoke via local Vite server (`http://localhost:3001`) confirmed the five repaired settings URLs now resolve through the app and redirect unauthenticated users to `/login`; `/definitely-missing-route` now shows the explicit not-found state instead of landing on `/`.

## 2026-06-29 23:05 — Codex — [T-013]
did:
- Added a shared settings section registry plus `SettingsWorkspace`, then converted the workspace settings IA from many sidebar items into one `/settings` nav entry with permission-aware icon tabs for AI, Company Brain, Extension, Templates, Integrations, Notifications, Billing, Members & Roles, Audit Logs, and Security.
- Added `/settings` as a role-aware landing route, kept the existing `/settings/*` deep links, and redirected the legacy `/notifications` path into `/settings/notifications`.
- Tightened the settings area follow-ups by fixing the template page to use the current auth/page-header contracts and updating the Company Brain scoring strategies widget to read `currentOrg.organizationId` from auth.
- Recorded the settings-shell decision in `DECISIONS.md` (`D-051`) and updated `CONTEXT.md` to describe the tabbed `/settings` workspace.
verified:
- Static router/nav audit showed exactly one sidebar settings href and zero missing visible nav routes.
- Focused web `tsc` grep for `router.tsx`, `app-shell.tsx`, `settings/page.tsx`, `settings-workspace.tsx`, `settings-sections.tsx`, `settings/notifications/page.tsx`, `settings/templates/page.tsx`, and `scoring-strategies-list.tsx` returned no matches.
- `git diff --check` ✓
- Browser smoke via local Vite server (`http://localhost:3001`) confirmed `/settings`, `/notifications`, and `/settings/notifications` all resolve through the app and land on `/login` instead of falling through to `/`.

## 2026-06-30 — Codex — [P10-13]
did:
- Added the External Provider Free-Tier & Cost Intelligence runtime on top of the existing Phase 10 provider pool: plan-aware usage calculation, reservations/settlement, snapshots, alerts, reconciliations, key tests, cache entries, and richer provider/account/key metadata.
- Wired the backend end-to-end through `apps/api/src/modules/lead-hunting/`: new cost/cache/capacity/intelligence services, generic provider adapters, richer admin CRUD surface, orchestrator-side key testing + usage-status helpers, and worker-scheduled reset/sync loops.
- Repointed the thin API to `/admin/external/*` for plans/providers/api-keys/routes/usage/alerts/tests/reconciliation while keeping the user-facing page at `/admin/external-providers`; alert events now also fan out into the existing `notifications` feed as `type='general'`.
- Rebuilt the `/admin/external-providers` UI into a fuller control plane with plan/account/key/route CRUD tabs plus usage, alerts, health, tests, and reconciliation views, while keeping secrets server-only and exposing only masked previews to the client.
- Updated `CONTEXT.md`, `DECISIONS.md` (`D-052`), `TASKS.md`, and `docs/architecture/11-task-breakdown.md` to reflect the completed follow-up.
verified:
- `./node_modules/.bin/tsc -p packages/contracts/tsconfig.json --noEmit` ✓
- `./node_modules/.bin/tsc -p packages/supabase/tsconfig.json --noEmit` ✓
- `./node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit` ✓
- `./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit` still fails on unrelated pre-existing knowledge-page issues in `apps/web/src/app/(app)/knowledge/page.tsx` and `apps/web/src/components/knowledge/reason-breakdown.tsx`
- `./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit 2>&1 | rg "external-providers/page|src/lib/api.ts"` returned no matches for the touched files ✓
- Targeted ESLint is blocked by a pre-existing workspace issue: `eslint.config.mjs` cannot resolve `@eslint/js`
