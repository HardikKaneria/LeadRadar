# TASKS.md — Shared Task Board

> This is how agents coordinate. **Claim** a task before working it; **move** it as
> status changes; **log** the result in `WORKLOG.md`. Keep IDs stable.
>
> Status flow: `Backlog → In progress → In review → Done` (or `Blocked`).
>
> **Active product = Radar OIP** (see `docs/architecture/`). IDs match
> `docs/architecture/11-task-breakdown.md`. Owner labels:
> `[BE]` api-backend · `[FE]` web-frontend · `[EXT]` chrome-extension · `[AI]` ai-engine ·
> `[INFRA]` platform-infra · `[DOCS]` documentation · `[QA]` quality-assurance.
>
> Task format:
> ```
> - [ID] Title — owner: [LABEL] role — complexity: X — priority: X — deps: … — updated: YYYY-MM-DD
>       what / output / module
> ```

---

## 🔴 Blocked

_(none)_

---

## 🟡 In progress

_(none)_

---

## 🔵 In review

_(none)_

---

## ✅ Done — Phase 10 Cost Intelligence (P10-14)

- [P10-14] External Provider Cost Intelligence — Cost Rules Hierarchy — owner: [BE] api-backend — complexity: XL — priority: Must-have — deps: P10-13 — updated: 2026-06-30
      what: Migration 0072, DB types, contracts, cost-calculator hierarchy engine, admin CRUD, controller routes.
      output: 8 files created/modified; see WORKLOG.md 2026-06-30 entry.
      module: lead-hunting / cost-intelligence

- [P10-14-FE] Cost Intelligence Admin UI — owner: [FE] web-frontend — complexity: Medium — priority: Must-have — deps: P10-14 — updated: 2026-06-30
      what: API client methods + 4 new admin tabs (Cost Rules, Endpoints, Multipliers, Cost Simulator) + events table cost breakdown expandable row.
      output: apps/web/src/lib/api.ts, apps/web/src/app/(admin)/admin/external-providers/page.tsx; tsc 0 new errors, build passes.
      module: web / admin / cost-intelligence

---

## ⚪ Backlog — Phase 3 · AI Intelligence (next)

> Phase 2 is complete. P3-01 (AI Gateway core) is done. Full task list in
> `docs/architecture/11-task-breakdown.md` (P3-* + v3 additions). Critical path P3-01 → P3-02 →
> P3-12 (key pool) → P3-13 (DB routes) → P3-14 (usage ledger) → P3-06 (analyzer) → P3-07 (pipeline).

---

## ⚪ Backlog — Frontend design track

_(none)_

---

## ⚪ Backlog — Phase 5 follow-ups

_(none)_

## ⚪ Backlog — Phase 4 follow-ups

_(none)_

## ⚪ Backlog — Phase 10 · Lead Hunting Research Pipeline

> New roadmap phase for M16. Critical path: `P10-01 → P10-03 → P10-04 → P10-05 → P10-06 → P10-07 → P10-08`,
> with UI, limits, and QA following those backend seams.

- [P10-12] QA: parser, provider fallback, evidence, and approval flow — owner: [QA] quality-assurance — complexity: High — priority: Must-have — deps: P10-02, P10-06, P10-07, P10-08, P10-11 — updated: 2026-06-29
      what: verify visible-only capture, dedup/idempotency, provider fallback, evidence completeness, archive routing, and end-to-end approval
      output: green M16 quality gate before rollout
      module: QA / M16





---

## ⚪ Backlog — Cross-cutting (still valid)



- [T-006] 🔒 Rotate the leaked Supabase keys (history scrub) — owner: [BE] api-backend — complexity: Low — priority: Must-have — deps: — — updated: 2026-06-22
      what: legacy README (now deleted) still exists in git history with live Supabase keys / DB passwords. Working tree is clean (.env.example added, .gitignore covers .env), but the USER must rotate the keys in Supabase and optionally scrub git history (filter-repo/BFG).
      output: rotated credentials; no live secrets reachable
      module: Platform / security



---

## ✅ Done

- [x] [P10-13] External Provider Free-Tier & Cost Intelligence — owner: [BE] api-backend + [FE] web-frontend — complexity: XL — priority: Must-have — deps: P10-04, P10-05, P10-10, P10-11 — updated: 2026-06-30
  > Extended the shipped Phase 10 provider stack into a full Provider Capacity Pool with configurable plan profiles, reservation/settlement-backed usage metering, snapshots, alerts, reconciliation, reset/sync jobs, key test flows, and a richer Master Admin control plane on the existing `/admin/external-providers` route. The thin API now serves the `/admin/external/*` surface for plans/accounts/keys/routes/usage/alerts/tests, the worker runs renewal + reconciliation loops, alert events also feed the existing notifications substrate, and the admin UI now exposes forecasts, snapshots, alerts, health, test runs, and reconciliation views without exposing decrypted secrets. Verification: `tsc -p packages/contracts --noEmit` ✓, `tsc -p packages/supabase --noEmit` ✓, `tsc -p apps/api --noEmit` ✓. Full web `tsc` still fails on unrelated pre-existing knowledge-page issues, but the error stream contained no hits for `external-providers/page.tsx` or `src/lib/api.ts`; targeted ESLint is also blocked in this workspace because `eslint.config.mjs` cannot resolve `@eslint/js`.

- [x] [T-013] Consolidated settings workspace — owner: [FE] web-frontend — complexity: High — priority: Must-have — deps: P1-09, P9-08, P9-09, P6-05, T-012 — updated: 2026-06-29
  > Replaced the scattered workspace settings sidebar entries with a single `/settings` destination and a shared icon-tab settings shell that wraps AI, Company Brain, Extension, Templates, Integrations, Notifications, Billing, Members & Roles, Audit Logs, and Security. Existing deep links were preserved, `/notifications` now redirects into `/settings/notifications`, and `/settings` resolves to the first visible tab for the current role instead of requiring a hard-coded default. Verification: static router/nav audit showed exactly one sidebar settings target and zero missing nav routes ✓, focused web `tsc` showed no errors in the touched settings/router files ✓, `git diff --check` ✓, and browser-smoked `/settings`, `/notifications`, and `/settings/notifications` on `http://localhost:3001` to confirm they resolve through the app and land on `/login` instead of `/`.

- [x] [T-012] Navigation route audit — owner: [FE] web-frontend — complexity: Medium — priority: Must-have — deps: P1-09, P9-08, P10-09 — updated: 2026-06-29
  > Reconciled the web router with the visible workspace settings/sidebar targets so `/settings/integrations`, `/settings/billing`, `/settings/roles-permissions`, `/settings/audit`, and `/settings/security` now resolve to their existing page files instead of falling through to the wildcard redirect. The router wildcard now renders an explicit `Page not found` screen with the missing pathname, which keeps future route drift visible instead of silently landing on `/`. Verification: static nav-vs-router audit via Node ✓, focused web `tsc` showed no errors in the touched route files ✓, `git diff --check` ✓, and browser-smoked the five repaired settings routes on `http://localhost:3001` to confirm they now resolve through the app and redirect unauthenticated users to `/login` rather than `/`.

- [x] [P10-08] CRM handoff + approval routing — owner: [BE] api-backend — complexity: Medium — priority: Must-have — deps: P10-07, P2-06, P4-01, P5-01 — updated: 2026-06-29
  > Added the lead-hunting handoff layer in `apps/api/src/modules/lead-hunting/lead-hunting-crm-handoff.service.ts` and the new operator routes in `lead-hunting.controller.ts` so qualified/reviewed posts now create or update canonical `discoveries` plus matching `ai_analysis` rows instead of living in a separate review silo (`D-047`). `raw_payload.leadHunting` now carries provenance links to the raw post, research report, classification, and canonical company/contact, `raw_posts.discovery_id` is maintained, archived/rejected decisions stay out of the CRM path, and `POST /lead-hunting/posts/:id/{research,classify,approve,archive,reject}` now supports rerun/approve/archive/reject directly on the backend. Verification: direct `tsc` for ai/contracts/supabase/api ✓, focused Jest suites ✓, `git diff --check` ✓.

- [x] [P10-11] Permissions, settings, limits, and audit — owner: [BE] api-backend — complexity: Medium — priority: Must-have — deps: P10-01, P10-04, P10-08 — updated: 2026-06-29
  > Added `0070_lead_hunting_governance.sql`, extending the permission catalog with `lead_hunting.*` and `external_providers.*`, rebinding the default system-role grants, and replacing the Phase 10 read policies so lead-hunting access no longer piggybacks on `discoveries.read`. The API now exposes governed lead-hunting overview/session/post/settings/usage reads plus platform-admin external-provider account/key/route/health/usage endpoints through `LeadHuntingOperationsService`, `ExternalProviderAdminService`, and the expanded `LeadHuntingController` / `AdminExternalProvidersController`. Lead-hunting settings now live under `organizations.settings.leadHunting`, queued research enforces the daily/monthly research and provider-budget caps server-side, approvals can require evidence, and review/provider mutations write audit-log rows. Verification: `tsc -p packages/contracts` ✓, `tsc -p apps/api --noEmit` ✓, `git diff --check` ✓. Full `pnpm --filter web build|lint` remained blocked in this workspace by `ERR_PNPM_IGNORED_BUILDS`.

- [x] [P10-10] Provider admin + usage UI — owner: [FE] web-frontend — complexity: Medium — priority: Should-have — deps: P10-04, P10-05 — updated: 2026-06-29
  > Added the new Master Admin surface at `/admin/external-providers`, including tabbed external-provider account/key/route/health/usage management on top of the new governed endpoints and without exposing raw keys back to the client. The app-side typed API client now covers the external-provider control plane and usage summary read models, and the Master Admin shell/nav expose the page directly. Verification: targeted web `tsc` output showed no errors in the new external-provider files ✓, `git diff --check` ✓. Full `pnpm --filter web build|lint` remained blocked by the workspace's ignored-build policy.

- [x] [P10-09] Lead-hunting operator UI — owner: [FE] web-frontend — complexity: High — priority: Must-have — deps: P10-03, P10-07, P10-08 — updated: 2026-06-29
  > Added the production lead-hunting workflow in `apps/web`: `/lead-hunting` overview, `/lead-hunting/review`, `/lead-hunting/archive`, `/lead-hunting/sessions/:id`, and `/lead-hunting/posts/:id`, plus the shared posts table component and new nav entry. Operators can now review recent sessions/posts, inspect evidence/provider activity/raw JSON, rerun research or classification, approve/archive/reject from the detail view, and manage workspace lead-hunting settings/usage warnings when they hold the new permissions. Verification: targeted web `tsc` output showed no errors in the new lead-hunting files ✓, `git diff --check` ✓. Full `pnpm --filter web build|lint` remained blocked by the workspace's ignored-build policy and pre-existing unrelated web TS issues outside this task.

- [x] [P10-07] Post classification + archive engine — owner: [AI] ai-engine + [BE] api-backend — complexity: High — priority: Must-have — deps: P10-06, P3-03 — updated: 2026-06-29
  > Added the strict-JSON lead-hunting AI tasks in `packages/ai/src/lead-hunting.ts` plus `supabase/migrations/0069_lead_hunting_ai_tasks.sql`, extending `ai_task_routes`, `ai_prompt_versions`, `ai_requests`, and `ai_usage_events` for `post_research_classifier`, `archive_classifier`, and `lead_quality_scorer`. `LeadHuntingClassificationService` now runs those tasks through the governed AI gateway, persists `post_classifications`, records prompt/model provenance in `reason_json`, and produces archive metadata before routing decisions. Verification: direct `tsc` for ai/contracts/supabase/api ✓, `packages/ai` Jest for the new parser coverage ✓, `git diff --check` ✓.

- [x] [P10-06] Full research workers + evidence builder — owner: [BE] api-backend + [AI] ai-engine — complexity: XL — priority: Must-have — deps: P10-03, P10-05, P4-02, P4-04 — updated: 2026-06-29
  > Added `LeadHuntingResearchService` and worker polling for `research-raw-post`, implementing the `post_research_jobs` stage machine (LinkedIn post/profile/company lookup, person/company/website/email/management/country/evidence, classification, decision routing), persisted `post_research_reports`, and wrote per-field `field_evidence_logs`. The worker now uses the external-provider orchestrator best-effort but degrades to visible-payload heuristics with explicit provenance when providers are unavailable (`D-048`), and it promotes confident company/contact findings into canonical `companies` / `contacts` before classification. Verification: direct `tsc` for ai/contracts/supabase/api ✓, focused API Jest helper coverage ✓, `git diff --check` ✓.

- [x] [P10-05] Provider router + call ledger — owner: [BE] api-backend — complexity: High — priority: Must-have — deps: P10-04 — updated: 2026-06-29
  > Added `supabase/migrations/0068_external_provider_routing.sql` plus the new lead-hunting external-provider module in `apps/api/src/modules/lead-hunting/` (`external-provider-routing.service.ts`, `external-provider-usage.service.ts`, `external-provider-orchestrator.service.ts`, adapter registry, rate-limit service, tests). Routes now load from `external_provider_routes`, provider attempts are audited into `external_provider_calls`, successful calls write `external_usage_events`, provider 429s write `external_provider_rate_limit_events`, and fallback/manual-fallback behavior is covered by focused orchestrator specs. Verification: direct `tsc` for contracts/supabase/api ✓, focused API Jest suites ✓, `git diff --check` ✓. Root `pnpm`/root `eslint` remain blocked in this workspace by the ignored-build policy and a missing `@eslint/js` install.

- [x] [P10-04] External research provider pool — owner: [BE] api-backend + [INFRA] platform-infra — complexity: High — priority: Must-have — deps: P3-12, P9-07, P10-01 — updated: 2026-06-29
  > Added `supabase/migrations/0067_external_provider_pool.sql`, updated `packages/supabase` DB types, and implemented the non-AI provider pool services in `apps/api/src/modules/lead-hunting/` (`external-provider-pool.service.ts`, `external-provider-rate-limit.service.ts`, module wiring, tests). External provider accounts/keys now support encrypted credentials, account/key allowlists, per-key request/cost limits, cooldowns, daily request resets, and account-budget-aware key selection, following the existing M15 governance pattern without coupling the new pool to AI model routing (`D-046`). Verification: direct `tsc` for contracts/supabase/api ✓, focused API Jest suites ✓, `git diff --check` ✓.

- [x] [P10-03] Capture ingestion + dedup + research enqueue — owner: [BE] api-backend — complexity: Medium — priority: Must-have — deps: P10-01, P10-02 — updated: 2026-06-29
  > Replaced extension-batch processing with the lead-hunting intake path: `supabase/migrations/0066_lead_hunting_capture_ingestion.sql` adds `lead_search_session_posts`, `raw_post_fingerprints`, read helpers/policies, and a unique research-job index; `apps/api/src/modules/worker/processors/lead-hunting-capture.ts` now creates/reuses `lead_search_sessions`, canonical `raw_posts`, per-session links, and `post_research_jobs`; `process-extension-batch.processor.ts` now queues `research-raw-post` jobs instead of feeding the legacy discovery ingestion seam. The shared contracts/queue names were extended so the worker can carry `captureMode`, `searchQuery`, and the new research payload. Verification: direct `tsc` for contracts/supabase/api ✓, focused API Jest suites ✓, `git diff --check` ✓. Root `pnpm` remains blocked in this workspace by `ERR_PNPM_IGNORED_BUILDS`.

- [x] [P10-02] LinkedIn visible-post capture v2 — owner: [EXT] chrome-extension — complexity: High — priority: Must-have — deps: P2-05, P2-09, P10-01 — updated: 2026-06-29
  > Upgraded the extension-side LinkedIn capture path to emit only viewport-visible posts, keep review selections stable across filter tabs, and send the richer M16 raw-post/session fields (`captureMode`, `searchQuery`, `postUrl`, `postText`, owner/company/date/engagement/media fields) while still backfilling the older discovery-shaped fields as compatibility shims for the current Phase 2 ingestion seam (`D-044`). Shared extension contracts were extended accordingly, and focused verification ran via `tsc -p extension/tsconfig.json --noEmit` plus `git diff --check`. Full contracts-package typecheck remains blocked in this workspace by missing installed `zod`/workspace deps.

- [x] [P10-01] Lead-hunting storage model + RLS — owner: [BE] api-backend — complexity: High — priority: Must-have — deps: P2-03, P1-05 — updated: 2026-06-29
  > Added `supabase/migrations/0065_lead_hunting_storage.sql` with the M16 tenant-facing storage tables, enums, helper read-RLS, and updated `@radar/supabase` DB types. Chose canonical `contacts` / `companies` over separate resolved staging tables and reused `discoveries.read` / `discoveries.read_own` until `P10-11` introduces dedicated `lead_hunting.*` permissions (`D-043`). Verification: `git diff --check` ✓, direct `database.types.ts` `tsc` parse ✓. Full repo `pnpm` checks were blocked in this workspace by `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` + missing installed deps.

- [x] [T-011] Formalize the Lead Hunting research pipeline into a shippable roadmap phase — owner: [DOCS] documentation — complexity: Medium — priority: Must-have — deps: `docs/architecture/linkedin-lead-hunting-research-pipeline.md` — updated: 2026-06-29
  > Added Phase 10 to the roadmap and milestone map, created `P10-01` → `P10-12` in the task breakdown, mapped the pipeline doc's implementation steps to those task IDs, added the Phase 10 backlog to the shared board, and recorded the phase-shaping decision in `DECISIONS.md` (`D-042`).

- [x] **[P5-06-DB]** Live-DB behavior tests — pipeline invariant + promote/close + queues.
  > `0002_p5_06_leads_tasks_guards.pgtap.sql` implemented.
- [x] **[P4-08-DB]** Live-DB RPC behavior tests (threshold/dedup/merge/edges/timeline).
  > `0001_p4_08_discovery_company_contact.pgtap.sql` implemented.

- [x] **[P9-11]** Performance & scale pass — Index review, database partitioning (ai_requests, job_runs, etc.), read replicas for analytics, dead-letter dashboards.

- [x] **[P9-06]** Scoring v3 groundwork (ML/embeddings) — owner: [AI] — 2026-06-27
  > ML scoring foundations.

- [P9-12] QA: billing limits + data lifecycle + E2E — owner: [BE/QA] — 2026-06-27
  > Created migration for soft deletes, org hard deletion, and usage limit checking in Postgres. Added API endpoints for data export and deletion. Updated AI pipeline to enforce limits. Added E2E simulation script.

- [P9-08] Billing & settings UIs (security/audit/billing/roles) — owner: [FE] — 2026-06-27
  > Added UI pages for billing, roles, audit, and security under `/settings`.
  > Built members API and audit API in the backend.

- [P9-07] Billing & usage (plans/subscriptions/limits/events) — owner: [BE] — 2026-06-27
  > Created DB migration `0054_billing_subscriptions.sql` for plans, subscriptions, limits, and events.
  > Built `BillingService` to fetch subscriptions and check usage limits.
  > Created webhook endpoint for provider events.

- [P9-09] Integrations UI + email provider — owner: [BE] [FE] — 2026-06-27
  > Created `IntegrationAccountDto` and `@radar/contracts` definitions.
  > Built `apps/api/src/modules/integrations` with `GET`/`POST`/`DELETE` endpoints.
  > Guarded integrations APIs with `integrations.manage` RBAC permission.
  > Added UI at `/settings/integrations` to list AI and Email providers and connect them.

- [P9-04] Lead resurrection — owner: [BE] [FE] — 2026-06-27
  > Added `lead_resurrection` notification type and preference in DB migrations `0052` and `0053`.
  > Created background worker processor `resurrectLeads` to poll daily for matches.
  > Added toggle for Lead Resurrection in `notifications/page.tsx` UI.

- [P9-03] Demand Radar — owner: [AI] [FE] — 2026-06-27
  > Created `0051_demand_radar.sql` with greedy clustering RPC based on opportunity embeddings.
  > Added `DemandRadarClusterDto` and exposed `GET /v1/opportunities/demand-radar` via `OpportunityAnalyzerService`.
  > Built the `/opportunities/radar` UI page to visualize trending themes and added navigation link.

- [P7-04] Weekly insight notification — owner: [BE] — 2026-06-26
  > Created a scheduled worker processor `generate-weekly-insight` to compute a 7-day conversion summary for each org.
  > Inserted `weekly_insight` notifications into the new substrate.
  > Added UI toggle to Settings and rendering logic to Notification Bell.


- [P9-02] Similar opportunity finder & clustering — owner: [AI/BE/FE] — 2026-06-26
  > Added `supabase/migrations/0050_opportunity_embeddings.sql` with `embedding` column, index, and trigger on `opportunities`.
  > Added `embedOpportunity` to `OpportunityAnalyzerService` + queue registration.
  > Built `GET /v1/opportunities/:id/similar` using Postgres `vector_cosine_ops`.
  > Added "Similar Deals" component to the opportunity details sidebar on the frontend.

- [P5-06-REST] Phase 5 QA — stale detection + notification-preference toggles — owner: [QA] — 2026-06-26
  > Wrote Jest specs to verify stale lead detection correctly ignores active task leads, identifies overdue tasks, and properly checks the opt-out preference toggles. Also added coverage for the Notifications API (Service and Controller).

  > Added `ScoringStrategiesList` to the `Company Brain` page.
  > Provided explainability by rendering the dimensional weights as tags.
  > Built endpoints for `GET /scoring-strategies` and `PUT /activate`.

- [P8-01] Learning recompute — scoring v2 (statistical) — owner: [AI] — 2026-06-26
  > Added `recompute-scoring` job to `WorkerProcessorService`.
  > Computes statistical weights from `knowledge_events` relative to the baseline win-rate.
  > Publishes new `scoring_strategy` (kind: `statistical`) and deactivates the old one.

- [P7-03] Knowledge insights UI — owner: [FE] — 2026-06-26
  > Built the `/knowledge` dashboard with `recharts` for Conversion Funnel and Reason Breakdown.
  > Wired it to the API and enabled the sidebar navigation item.

- [P7-01] Knowledge events capture — owner: [BE] — 2026-06-26
  > Added `supabase/migrations/0045_knowledge_events.sql` to capture `won`, `lost`, `outreach_sent`, etc.
  > Integrated Postgres triggers on `leads`, `outreach_messages`, and `proposals`.

- [P7-02] Knowledge insights API — owner: [BE] — 2026-06-26
  > Built `apps/api/src/modules/knowledge/` with `KnowledgeService` aggregating events.
  > Added `KNOWLEDGE_EVENT_TYPES` and DTOs to `@radar/contracts` + `knowledge.read` permission.

- [P6-06] QA: outreach persistence + proposal lifecycle — owner: [QA] — 2026-06-26
  > Validated the `outreach_messages` RPC `record_outreach_message` + trigger invariants (thread bumps).
  > Verified proposal lifecycle transitions in `proposals` table (ready→sent/accepted/rejected).
  > Checked RLS on `proposals` and `outreach_messages` against `leads.read`/`leads.write`.
  > No SQL errors or guard-clause rejections found in mock-test flow.

- [T-007] 📝 Reconcile architecture docs with the full-Supabase implementation — owner: [DOCS] — complexity: Low — priority: Should-have — deps: — — updated: 2026-06-26
      what: CONTEXT.md and several docs/architecture/* + DECISIONS [[D-004]] still describe a Prisma + packages/db + NestJS-ORM stack, but Phase 1 actually shipped full-Supabase (packages/supabase, supabase/migrations/*.sql, RLS, service-role thin API). Code is the source of truth ([[D-006]]); the docs lag and mislead new agents.
      output: docs match reality (Supabase, RLS, migrations 0001–000N), Prisma references removed/marked superseded
      module: docs
- [P6-05] Message templates UI — [FE] — 2026-06-26
  > Added `SettingsTemplatesPage` at `apps/web/src/app/(app)/settings/templates/page.tsx`.
  > Integrated with `listMessageTemplates`, `upsertMessageTemplate`, `deleteMessageTemplate`.
  > Added "Templates" route to `router.tsx` and menu item in `app-shell.tsx`.

- [P6-04] Assistant + outreach + proposals UI — [FE] — 2026-06-26
  > Added three-tab layout to `LeadWorkspace` drawer in `apps/web/src/app/(app)/pipeline/page.tsx`.
  > Tasks tab refactored into `TasksPanel`. New `OutreachPanel` shows recent messages via
  > `listMessages({ leadId })` in a Timeline; AI Assistant card with Draft Message modal
  > (`api.draftAssistantMessage`), Meeting Prep (`api.assistantMeetingPrep`), Next Action
  > (`api.assistantNextAction`). New `ProposalsPanel` lists proposals and has Generate button
  > (`api.generateProposal`). `accessToken`/`canAi` plumbed through. 0 TS errors; build clean.

- [P6-03] Proposal Generator — [AI] [BE] — 2026-06-26
  > `supabase/migrations/0040_proposals.sql` already existed (enum `proposal_status` + `proposals`
  > lifecycle table, RLS on `leads.read`/`leads.write`). Added `PROPOSAL_STATUSES` to
  > `@radar/contracts` enums; added DTOs (`generateProposalSchema`, `updateProposalStatusSchema`,
  > `proposalFilterSchema`, `ProposalSummary`, `ProposalDetail`, `GenerateProposalJobPayload`) to
  > `@radar/contracts`. The pure `@radar/ai` `proposal.ts` agent was already built (P6-03 partial).
  > Added the API writer `apps/api/src/modules/ai/proposal.service.ts` (loads lead/opportunity +
  > Company Brain services/tone, runs `generateProposal`, persists to `proposals` with status `ready`
  > and structured `content` JSON). Added `ProposalController` (`POST /proposals/generate` → enqueues
  > `generate-proposal` job, `GET /proposals?entityType&entityId&status`, `PATCH
  > /proposals/:id/status`) and registered in `AiModule`. Wired `enqueueGenerateProposal` +
  > `runGenerateProposal` into `DiscoveryPipelineService` and the `QUEUES.generateProposal` consumer
  > into `AiPipelineWorker`. Added `apps/web/src/lib/proposals.ts` (reads via RLS) + `api.ts`
  > `generateProposal`/`updateProposalStatus` helpers. Updated `discovery-pipeline.service.spec.ts`
  > constructor. Rendered file artifact (`file_attachment_id`) and `proposal_ready` notification
  > deferred (no live bucket / no notifications substrate). Verified: `pnpm -r typecheck` ✓ (7/7),
  > `@radar/api` build ✓ + lint ✓ (0 errors; 32 pre-existing warnings) + test ✓ (71/71),
  > `@radar/web` build ✓ + lint ✓ (0 errors), `git diff --check` ✓. ⚠️ Not run against a live DB.

- [P6-02] AI Sales Assistant endpoints — [AI] — 2026-06-25
  > Added the pure `packages/ai/src/assistant.ts` agent (+ `assistant.spec.ts`, 10 tests): prompt
  > builders + lenient structured parsers + `generate*` for all five M11 generation kinds —
  > `draftSalesMessage`/`draftFollowUpMessage` (→ `{subject,body}`), `summarizeConversation`,
  > `prepareMeeting` (talking points/questions/risks), `suggestNextAction` — over the governed
  > gateway (the `sales_message`/`follow_up_message`/`conversation_summary`/`meeting_prep`/
  > `next_action` routes were already seeded). Added the API writer
  > `apps/api/src/modules/ai/sales-assistant.service.ts` (loads lead/opportunity context + recent
  > outreach + Company Brain tone, runs the gateway, persists drafts to `outreach_messages`
  > [`is_ai_generated`, status `draft`] threading the conversation in code, updates
  > `conversations.summary`; meeting-prep/next-action are advisory) + the
  > `SalesAssistantController` (`POST /assistant/{draft-message,summarize,meeting-prep,next-action}`,
  > all `ai.use`), registered in `AiModule`. Added contracts DTOs (`draftAssistantMessageSchema`,
  > `summarizeConversationRequestSchema`, `assistantAdviceSchema` + meeting-prep/next-action/summary
  > response types). [[D-041]]. Verified: `@radar/ai` build + lint + test ✓ (73/73), `@radar/contracts`
  > build + test ✓ (29/29), `@radar/api` nest build ✓ + lint ✓ (0 errors on new files) + test ✓
  > (71/71), `pnpm -r typecheck` ✓ (7/7), `git diff --check` ✓. ⚠️ Not run against a live Supabase
  > DB / real model. `ai_request_id` provenance plumbing + an API-service spec are P6-06 follow-ups;
  > the assistant UI is P6-04 (web client methods land with it).

- [P6-01] Outreach & conversation model — [BE] — 2026-06-25
  > Opened Phase 6. Added `supabase/migrations/0039_outreach.sql`: the `outreach_channel`/
  > `outreach_direction`/`outreach_status` enums and the M11 tables — `conversations` (per-channel
  > thread + AI-maintained `summary` + `last_message_at`), `message_templates` (tone/service/stage-
  > keyed), and `outreach_messages` (subject/body, direction/status, `is_ai_generated`/`ai_request_id`/
  > `message_template_id` provenance, sent/opened/replied engagement timestamps). All RLS-gated on
  > `leads.read`/`leads.write` ([[D-040]]). The SECURITY DEFINER `record_outreach_message` RPC logs a
  > message and create-or-bumps its conversation thread atomically. Added the DB types
  > (`ConversationRow`/`MessageTemplateRow`/`OutreachMessageRow` + enums + tables + RPC), the contracts
  > enums (`OUTREACH_CHANNELS`/`OUTREACH_DIRECTIONS`/`OUTREACH_STATUSES`) and DTOs
  > (`recordOutreachMessageSchema`, `updateConversationSummarySchema`, `upsertMessageTemplateSchema` +
  > `ConversationSummary`/`OutreachMessage`/`MessageTemplate`), and the web data layer
  > `apps/web/src/lib/outreach.ts` (conversations/messages/templates reads + record/summary/template
  > writes). AI generation is P6-02; assistant/thread/template UI is P6-04/P6-05. Verified:
  > `@radar/contracts` + `@radar/supabase` build ✓, `pnpm -r typecheck` ✓ (7/7), `@radar/web` lint ✓
  > (0 outreach warnings), `pnpm -r test` ✓ (contracts 29 · ai 63 · extension 6 · api 71),
  > `git diff --check` ✓. ⚠️ Not run against a live Supabase DB.

- [T-010] QA the half-finished P9-14 admin area — [FE] — 2026-06-25
  > Full typecheck/lint/build pass over `apps/web/src/app/(admin)/**` + `components/dashboards/**`.
  > Cleared every admin-area lint warning (admin/dashboards 0; web total 39→14, rest pre-existing):
  > removed dead imports, replaced `catch (err: any)` with `unknown`+`instanceof Error`, and typed the
  > `any[]` data/forms (usage→`UsageEventSummary`, new `PromptRow`/`PromptFormValues`, routing via shared
  > `AdminRoute`/`AdminRouteUpdate`). Extracted the thrice-copied `generatePassword` to
  > `apps/web/src/lib/password.ts`. Fixed half-wired bugs: jobs page used non-existent `queue`/
  > `completed_at` (real cols `queue_name`/`finished_at`) → blank Queue column + runaway duration;
  > health page's `process.env.NODE_ENV` → `import.meta.env.MODE`; tidied a rambling comment in users.
  > Fixed a stale data-layer contract — `api.ts` `updateAdminRoute`/`adminRoutes` still declared the
  > old `{ attempts }` shape vs the rewritten provider/model routing form. Verified: web typecheck ✓,
  > lint ✓ (0 errors), build ✓, `git diff --check` ✓. Left observations (out of scope) in WORKLOG:
  > usage "Org ID" column maps a field absent from the DTO; prompts agent slugs differ from
  > `AiTaskTypeName`; company-admin dashboard uses static antd `message` + a non-existent permission key.

- [P5-06] Phase 5 QA — contract suite (lead pipeline + tasks DTOs) — [QA] — 2026-06-25
  > Extended `packages/contracts/src/dto.spec.ts` from 14→29 tests, adding the Phase 5 contract
  > validation that web + the API share: `leadFilterSchema` (defaults/stage/priority/sort/bounds),
  > `updateLeadStageSchema` (1..200 ids, settable stages only — won/lost rejected as terminal),
  > `promoteOpportunitySchema` (uuid + optional owner), `closeLeadSchema` (won/lost gate, reason trim),
  > `taskQueueSchema` (every tab + default today), and the task mutation schemas (`createTaskSchema`
  > default priority + dueAt shape, `rescheduleTaskSchema` ISO due, `reassignTaskSchema` uuid|null,
  > `completeTaskSchema` optional follow-up shape, `cancelTaskSchema`). Also removed a stray unused
  > `TASK_STATUSES` import in `dto.ts`. Verified: `@radar/contracts` test ✓ (29/29) + build ✓ (spec
  > excluded from dist) + lint ✓ (0 errors; 3 pre-existing warnings), `pnpm -r typecheck` ✓ (7/7),
  > `pnpm -r test` ✓ (ai 63 · extension 6 · contracts 29 · api 71). The behavioral SQL guards (promote
  > idempotency, close gate, the follow-up invariant trigger + complete/cancel guard) are
  > single-source RPCs and need live Postgres — split as [P5-06-DB]. Stale detection + notification
  > toggles wait on P5-05 — split as [P5-06-REST].

- [P5-04] Task queues UI — [FE] — 2026-06-25
  > Added `apps/web/src/app/(app)/tasks/page.tsx` (route `/tasks`, nav flipped to ready): the
  > follow-up queues surface over `listTasks` with Segmented tabs (Overdue / Today / Upcoming /
  > Assigned to me / All open), due pills (overdue in red, relative `fromNow`), priority chips, a
  > live count badge, pagination, and quick actions — inline reschedule (`rescheduleTask` via a
  > DatePicker) and complete (`completeTask`). The complete modal offers an optional follow-up and,
  > if the `complete_task` RPC rejects because this was the last open task on an active lead, makes
  > the follow-up required and lets the user retry (mirrors the P5-02 invariant). The "Assigned to
  > me" tab filters on the current `session.user.id`. Verified: `@radar/web` typecheck ✓, lint ✓
  > (0 errors), build ✓. ⚠️ Live browser smoke needs a real Supabase session (same env caveat as
  > P5-03). Drive-by: fixed two pre-existing typecheck breakages in untracked P9-14 admin files that
  > were blocking the app-wide `tsc` gate — a missing `generatePassword` helper in
  > `components/dashboards/company-admin-dashboard.tsx` and a missing `Flex` import in
  > `app/(admin)/admin/companies/page.tsx` (not P5-04, flagged here).

- [P5-03] Pipeline + lead workspace UI — [FE] — 2026-06-25
  > Added `apps/web/src/app/(app)/pipeline/page.tsx` (route `/pipeline`, nav flipped to ready): a
  > stage-column board (no DnD per spec) over `listLeads`, grouped by `lead_stage`, with lead cards
  > (priority/score/value/updated). Clicking a card opens a `LeadWorkspace` Drawer — lead facts,
  > stage controls (`setLeadStage` for active stages + Close won/lost via `closeLead` with a reason
  > modal), and the follow-up tasks list (`listLeadTasks`) with add/complete/reschedule. The
  > stage-guard is honoured in the UI: the `CompleteTaskModal` makes the next follow-up *required*
  > when completing the lead's only open task on an active lead (mirroring the `complete_task` RPC
  > guard), and an alert surfaces when an active lead has no open task. Added `LeadStageTag`/
  > `TaskStatusTag` to `ui/status-tag.tsx`, and a "Promote to lead" action on the opportunity detail
  > pane (`promoteOpportunity`, gated on `leads.write`, hidden once `promoted_to_lead`) as the
  > pipeline entry point. Verified: `@radar/web` typecheck ✓, lint ✓ (0 errors), build ✓.
  > ⚠️ Live browser smoke blocked in this env (dev-server/preview port mismatch + needs a real
  > Supabase session). Lead timeline (EntityTimeline) deferred — `relationship_node_type` has no
  > `lead` member. Standalone task-queues page is P5-04.

- [P5-02] Follow-Up Intelligence (tasks + invariant) — [BE] — 2026-06-25
  > Added `supabase/migrations/0035_tasks.sql`: the `task_status` enum + `tasks` table (lead-scoped,
  > priority/weight, due_at, assignee, RLS by `tasks.manage` team / `tasks.manage_own` own using the
  > codebase's ownership pattern, queue indexes). Enforced the M10 invariant "no active lead without
  > an open task" in the DB ([[D-039]]): the `ensure_lead_follow_up` trigger auto-creates an initial
  > task on lead insert / re-activation; the guarded `complete_task`/`cancel_task` SECURITY DEFINER
  > RPCs reject closing the last open task on an active lead unless an atomic follow-up is supplied;
  > and `active_leads_missing_open_task(org)` backs the periodic guard job (job wiring deferred — no
  > cron substrate). Added `TaskRow`/`TaskStatus` + table/RPC/enum DB types, the contracts DTOs
  > (`taskQueueSchema` overdue/today/upcoming/assigned/all, `createTaskSchema`, `rescheduleTaskSchema`,
  > `reassignTaskSchema`, `completeTaskSchema`/`cancelTaskSchema` with optional follow-up,
  > `TaskSummary`/`TaskDetail`/`TaskListResult`), and the web data layer `apps/web/src/lib/tasks.ts`
  > (queue list + per-lead list + create/reschedule/reassign + complete/cancel). Verified:
  > `@radar/contracts` + `@radar/supabase` build ✓, `pnpm -r typecheck` ✓ (7/7), `@radar/web` lint ✓
  > (0 errors), `@radar/contracts` test ✓ (14/14), `git diff --check` ✓. ⚠️ Not run against a live
  > Supabase DB. Task queues UI is P5-04; pipeline/workspace UI is P5-03; QA is P5-06.

- [P5-01] Lead Pipeline — [BE] — 2026-06-25
  > Added `supabase/migrations/0034_leads.sql`: the `lead_stage` enum (matches `LEAD_STAGES`), the
  > `leads` table (opportunity/company/contact provenance FKs, stage/score/priority+weight/value/
  > currency/source/owner/close_reason/closed_at, RLS by `leads.read`/`leads.write`, one-live-lead-
  > per-opportunity partial unique index, indexes, updated_at trigger), and two SECURITY DEFINER RPCs:
  > `promote_opportunity_to_lead` (carries the opportunity signals onto a fresh `new` lead + flips the
  > opportunity to `promoted_to_lead`, idempotency-guarded) and `close_lead` (won/lost + reason,
  > stamps `closed_at`). Added `LeadRow`/`LeadStage` + table/RPC/enum DB types, the contracts DTOs
  > (`leadFilterSchema`, `LEAD_SET_STAGES`/`updateLeadStageSchema`, `promoteOpportunitySchema`,
  > `closeLeadSchema`, `LeadSummary`/`LeadDetail`/`LeadListResult`), and the web data layer
  > `apps/web/src/lib/leads.ts` (list/get/setStage + promote/close). [[D-038]]. knowledge_event
  > emission deferred to P7-01; leads not yet on the polymorphic timeline (follow-ups). Verified:
  > `@radar/contracts` + `@radar/supabase` build ✓, `pnpm -r typecheck` ✓ (7/7), `@radar/web` lint ✓
  > (0 errors), `@radar/contracts` test ✓ (14/14), `git diff --check` ✓. ⚠️ Not run against a live
  > Supabase DB. Pipeline + lead-workspace UI is P5-03.

- [P1-08-FIX] Redis removal & Supabase queue transition — [BE] — 2026-06-25
  > Created `0031_job_queue_enhancements.sql` for atomic queue polling, `0032_idempotency_keys.sql` for Postgres-based idempotency, and implemented `SupabaseQueueService` to replace BullMQ. Removed `apps/worker` entirely and migrated its processors (`ingest-manual`, `import-csv`, `process-extension-batch`, `demo`) into a new API `WorkerModule`, running single-process. Refactored `AiPipelineWorker` and `IdempotencyService` to use Supabase, and converted `AiRateLimitService` to an in-memory bucket. Removed `bullmq` and `ioredis` from package dependencies and dropped Redis from `docker-compose.yml`.

- [P9-14] Admin Flow Polish — [FE/BE] — 2026-06-25
  > Created the four master admin views: `/admin/companies` with a "Create Company" form executing the `create_organization` RPC; `/admin/users` listing all memberships with resolved roles; `/admin/health` showing API and DB connection status; and `/admin/jobs` wiring directly to the new `job_runs` queue for live monitoring. Re-wired the main admin dashboard to fetch live counts for orgs, members, keys, and requests. Standardized the platform admin check in `(app)/layout.tsx` to use the client-side `useAuth()` hook.

- [P9-14] Role-based dashboards — [FE] — 2026-06-25
  > Created `CompanyAdminDashboard` (AI spend/requests via live usage, static stubs for conversion/services) and `SalesExecutiveDashboard` (Action Center + My Usage + Captures Waiting stub). Refactored `apps/web/src/app/(app)/page.tsx` to conditionally render the appropriate dashboard based on `currentOrg?.roleSlug`. Verified web build passes static prerendering.

- [P9-13] Master Admin area (Foundation) — [BE/FE] — 2026-06-26
  > Created `ai_provider_accounts`, `ai_api_keys`, `platform_admins`, and `system_roles` DB tables; seeded initial platform admin. Implemented Platform Admin backend APIs and wired them to the frontend `AdminShell` layout and stub views for the Master Admin Dashboard, AI Providers pool, and Usage Ledger.

- [P9-13] Master Admin area (Foundation) — [FE] — 2026-06-25
  > Created the `isPlatformAdmin` guard in frontend auth, the `AdminShell` layout, and the stub views for the Master Admin Dashboard, AI Providers pool, and Usage Ledger (`/admin/*`). Authored `0027_v3_seed_platform_admins.sql` to elevate current users for dev testing.


- [P3-15] Privacy mode + PII redaction — [BE] [AI] — 2026-06-25
  > Created `packages/ai/src/redact.ts` for Regex-based PII redaction (email/phone). Updated `AiCallContext`, `CompletionRequest`, and `AIService` to accept `privacyMode`. Updated external providers (Gemini, Groq, OpenRouter) to intercept requests and conditionally redact `prompt` and `system` if `privacyMode === 'redact_pii_before_ai'` and `isFreeTier === true`.

- [P2-13] Discovery ownership + capture attribution — [BE] — 2026-06-25
  > Created `0026_v3_discovery_attribution.sql` to add specific ownership assignments (`captured_by_user_id`, `assigned_to_user_id`, etc.) and `capture_channel` directly to `discoveries`. Updated `DiscoverySummary` and `DiscoveryDetail` DTOs, and extended `lib/discoveries.ts` thin API queries to select and map the new columns.

- [P1-12] Role taxonomy + platform_admins — [BE] — 2026-06-25
  > Created `0025_v3_roles_platform_admins.sql` to seed the new `master_admin`, `company_admin`, `sales_executive` system roles and `platform_admins` table. Expanded permissions catalog and mapped existing members to new roles. Also updated the frontend `AppLayout` to display a "Create Workspace" form for users that sign in without an active org, fixing the auth flow gap.


- [P4-07-ATT] Attachment upload (storage + UI) — [BE/FE] — 2026-06-25
  > Created the `attachments` Supabase storage bucket via `0024_attachments_storage.sql` with appropriate RLS policies for org-based access control. Updated `EntityTimeline` component to include an "Attachments" tab with file uploading, downloading, and soft-deleting capabilities.


- [P4-07-COMPANY] Company-pane timeline — [FE] — 2026-06-25
  > Dropped the reusable `EntityTimeline` component onto the company detail pane in `companies/page.tsx` (`entityType: 'company'`), passing down `organizationId` and `canWrite`.


- [P4-04-UI] "Research company" button — [FE] — 2026-06-25
  > Added a "Research company" button to the Enrichment section of the Company pane in `companies/page.tsx` that calls `api.researchCompany`, polls the returned `jobId`, and refreshes the company data upon completion to display the enriched data.


- [P4-08] QA: opportunity flow + graph + attachments — contract suite — [QA] — 2026-06-24
  > Stood up jest (ts-jest) in `packages/contracts` (mirroring `@radar/ai`: `jest.config.cjs`, `test`
  > script, `*.spec.ts` excluded from the build tsconfig) and added `src/dto.spec.ts` (14 tests)
  > covering the Phase 4 contract validation both web + API depend on: `opportunityFilterSchema`
  > defaults/enums/bounds, `updateOpportunityStatusSchema` (1..200 ids, operator-settable statuses
  > only), `convertDiscoverySchema` (force default + uuid), `companyFilterSchema`,
  > `upsertCompanySchema`/`upsertContactSchema` (name/email/url + tech-stack cap),
  > `mergeEntitiesSchema`, `upsertRelationshipEdgeSchema` (edge/node enums + weight bounds), and the
  > timeline `addNoteSchema`/`recordAttachmentSchema`. Verified: `@radar/contracts` test 14/14 ✓ +
  > build ✓ (spec excluded from dist) + lint ✓ (only 2 pre-existing AI-settings warnings),
  > `pnpm -r typecheck` ✓ (8/8), `pnpm -r test` ✓ (contracts 14 · ai 63 · extension 6 · worker 17 ·
  > api 65). The behavioral guards (convert threshold/force, dedup/merge, edge integrity, note/
  > attachment entity checks) live in SQL RPCs (single source) and need a live Postgres/pgTAP —
  > tracked as [P4-08-DB].

- [P4-07-UI] Timeline / notes UI — [FE] — 2026-06-24
  > Added the reusable `apps/web/src/components/entity-timeline.tsx` (`EntityTimeline`) and wired it
  > into the opportunity detail pane. It loads activities + notes for an entity via `lib/timeline.ts`,
  > shows a tabbed Notes (add via `add_note`, delete via `delete_note` with a confirm, AI-note tag)
  > and Activity (AntD `Timeline` with per-type icons/colors) view, all `opportunities.write`-gated
  > and with loading/empty/error states. Component is entity-agnostic (`TimelineTarget`) so the
  > company pane can reuse it ([P4-07-COMPANY]). Verified: web typecheck ✓, lint ✓, build ✓
  > (`/opportunities` 22.3 kB; clean rebuild after stopping a stray :3000 server); runtime smoke —
  > `/opportunities` returns 200 and redirects unauthenticated users to `/login`, clean console.
  > Authenticated timeline rendering needs a real Supabase session. Attachment upload is [P4-07-ATT].

- [P4-07] Activities, notes, attachments — backend foundation — [BE] — 2026-06-24
  > Added `supabase/migrations/0023_activities_notes_attachments.sql`: the `activity_type` enum and
  > the `activities` (append-only timeline), `notes` (editable, `is_ai_generated` flag), and
  > `attachments` (metadata) tables. Entities are referenced polymorphically by the existing
  > `relationship_node_type` (opportunity/company/contact) reused as the canonical entity ref, RLS-read
  > by `opportunities.read` + note/attachment edits by `opportunities.write` ([[D-036]]). `activities`
  > is write-locked except through the SECURITY DEFINER `log_activity`, called by the `add_note` /
  > `record_attachment` RPCs (validate the target via `relationship_node_exists`, log a matching
  > activity) and by AFTER INSERT/UPDATE triggers on `opportunities` (auto `created` + every
  > `status_changed`/`converted`). Added `delete_note`/`delete_attachment` soft-delete RPCs. Added the
  > `ActivityRow`/`NoteRow`/`AttachmentRow` + enum DB types/tables/RPC signatures, the contracts
  > enums/DTOs (`addNoteSchema`, `recordAttachmentSchema`, `Activity`/`Note`/`Attachment`), and the web
  > data layer `apps/web/src/lib/timeline.ts`. Attachments store metadata only — binary upload wiring
  > is the FE follow-up [P4-07-UI]. Verified: `@radar/contracts` + `@radar/supabase` build ✓,
  > `pnpm -r typecheck` ✓ (8/8), `@radar/web` lint ✓, `@radar/supabase` lint ✓, `git diff --check` ✓.
  > ⚠️ Not run against a live Supabase DB. The timeline/notes/attachment-upload UI is [P4-07-UI].

- [P4-04] Company Research agent — [AI] — 2026-06-24
  > Added the pure `@radar/ai` researcher (`packages/ai/src/researcher.ts`:
  > `buildCompanyResearchPrompt` + lenient `parseCompanyResearchOutput` + `researchCompany` →
  > summary/industry/techStack/problems/suggestedServices via the governed gateway, no deterministic
  > post-processing), with checked-in golden fixtures + `researcher.spec.ts`. Added the API writer
  > `apps/api/src/modules/ai/company-research.service.ts` — loads the company, gathers light context
  > from its linked opportunity titles, runs the gateway (task type `company_research`, already routed
  > + prompt-seeded), and persists into `companies.enrichment` (provenance: model + prompt version +
  > timestamp), back-filling `industry`/`tech_stack` only when empty ([[D-035]]). Wired the
  > `research-company` BullMQ job into `DiscoveryPipelineService` (enqueue + `job_runs` lifecycle) and
  > `AiPipelineWorker`, exposed `POST /companies/:id/research` (`ai.use`), added
  > `QUEUES.researchCompany` + `ResearchCompanyJobPayload`, and registered the service in `AiModule`.
  > No migration — `companies.enrichment` already exists from P4-02. Verified: `@radar/ai` test 63/63 +
  > lint + build ✓, `@radar/api` test 65/65 + lint ✓, `pnpm -r typecheck` ✓ (8/8),
  > `git diff --check` ✓. ⚠️ Not run against a live Supabase DB / real model. A web "Research" button
  > on the companies page is a follow-up.

- [P4-05] Daily Action Center — [FE] — 2026-06-24
  > Turned the static `/` homepage into the live Action Center (M8). Added the read model
  > `getActionCenter(org)` in `apps/web/src/lib/opportunities.ts` — two parallel RLS reads over
  > open/qualified opportunities: high-value (by score) and urgent (priority critical/high by
  > priority_weight), returning a lightweight `ActionCenterOpportunity` shape (incl.
  > `recommended_action`). Rewrote `app/(app)/page.tsx` to render three lanes of action cards
  > (status/score/priority chips + AI recommended action + value + heat, click-through to
  > `/opportunities`), with loading/empty/error/permission states and an onboarding `PageSection`
  > shown only when there's no live work. The "Follow-ups due" lane is an honest deferred state
  > (tasks ship in Phase 5). No CRM vanity stats, per the M8 spec. Verified: web typecheck ✓, lint ✓,
  > build ✓ (12 routes; `/` now data-driven, prerendered static); runtime smoke after a clean `.next`
  > rebuild — `/`, `/login`, `/opportunities` return 200, `/` redirects unauthenticated users to
  > `/login`, clean console. Authenticated lane rendering still needs a real Supabase session.

- [P4-06] Opportunities UI + relationship/company pages — [FE] — 2026-06-24
  > Shipped the M6/M7 operator surfaces in `apps/web`, consuming the P4-01/P4-02/P4-03 data layers.
  > `app/(app)/opportunities/page.tsx` is a three-pane ranked workspace: filters (search + status +
  > priority + sort by score/heat/priority/newest), a score/heat/priority-tagged list, and a detail
  > pane (status/score/priority chips, score/heat/value stats, AI explanation, recommended action,
  > the linked company + its contacts, and `opportunities.write`-gated status actions via
  > `setOpportunityStatus`). `app/(app)/companies/page.tsx` is a companies list + a per-company graph
  > view: company facts, contacts, and `relationship_edges` grouped by type (endpoints resolved to
  > names where known — this company + its contacts — else a typed short id). Added
  > `OpportunityStatusTag` to the shared `ui/status-tag.tsx`, flipped the `/opportunities` +
  > `/companies` nav items to `ready` (Companies gated on `opportunities.read` per [[D-033]]), and
  > switched `.claude/launch.json` to `autoPort`. Verified: web typecheck ✓, lint ✓ (no warnings),
  > build ✓ (14 routes; both new pages prerendered static); runtime smoke after a clean `.next`
  > rebuild — `/opportunities` + `/companies` return 200 and redirect unauthenticated users to
  > `/login` with a clean console. Full authenticated data-path smoke still needs a real Supabase
  > session. Cross-entity edge-endpoint name resolution + edge-editing UI are follow-ups.

- [P4-03] Relationship graph (`relationship_edges`) — [BE] — 2026-06-24
  > Added `supabase/migrations/0022_relationship_edges.sql`: the `relationship_node_type`
  > (company/contact/opportunity) + `relationship_edge_type` (works_at/decision_maker_for/reports_to/
  > referred_by/introduced_by/partner_of/competitor_of/related_to) enums, the polymorphic
  > `relationship_edges` table (node_type+id endpoints, weighted, jsonb metadata, soft-delete, unique
  > live edge per direction+type, source/target traversal indexes, RLS on `opportunities.read`/
  > `opportunities.write` per [[D-033]]), the `relationship_node_exists` validator, and the
  > dedup-aware `upsert_relationship_edge` (revives soft-deleted matches, validates both endpoints in
  > the org) + `delete_relationship_edge` SECURITY DEFINER RPCs. Added `RelationshipEdgeRow` + enum
  > DB types/table/RPC signatures, the contracts enums/DTOs
  > (`upsertRelationshipEdgeSchema`/`RelationshipEdge`/`RelationshipNodeRef`), and the web data layer
  > `apps/web/src/lib/relationships.ts` (`listEntityEdges` either-direction, `upsertRelationshipEdge`,
  > `deleteRelationshipEdge`). [[D-034]]. Polymorphic endpoints stay FK-less (validated in the RPC);
  > fuzzy `pg_trgm` dedup deferred. ⚠️ Not run against a live Supabase DB.

- [P4-02] Company & contact graph — [BE] — 2026-06-24
  > Added `supabase/migrations/0021_companies_contacts.sql`: `companies` (unique `(org, domain)`, GIN
  > name trgm) + `contacts` (unique `(org, email)`) with RLS on the opportunity permissions, the
  > dedup-aware `upsert_company`/`upsert_contact` RPCs, the `merge_companies`/`merge_contacts` RPCs
  > (repoint + soft-delete), and the additive FK wiring of `opportunities.company_id`/
  > `primary_contact_id`. Added `CompanyRow`/`ContactRow` DB types + RPC signatures, contracts DTOs,
  > and the web data layer `apps/web/src/lib/companies.ts`. [[D-033]]. ⚠️ Not run against a live DB.

- [P4-01] Opportunity Engine — [BE] — 2026-06-24
  > Added `supabase/migrations/0020_opportunities.sql`: the `opportunity_status` enum, the
  > `opportunities` table (status/score/priority+weight/value/heat/explanation/action + provenance,
  > indexes, RLS by `opportunities.read`/`opportunities.write`), and the atomic
  > `convert_discovery_to_opportunity(p_discovery, p_owner, p_force)` RPC (threshold-gated on the org
  > `scoreThreshold`, snapshots latest `ai_analysis` + `ai_action_plan`, derives a basic heat score,
  > flips the discovery to `converted`). Added the `OpportunityRow`/enum/RPC DB types, contracts DTOs
  > (filter/summary/detail/list + convert/status inputs), and the web data layer
  > `apps/web/src/lib/opportunities.ts` (list/get/setStatus + `convertDiscovery`). [[D-032]].
  > company_id/primary_contact_id stay FK-less until P4-02. ⚠️ Not run against a live Supabase DB.

- [T-009] AI settings backend parity for org BYOK + privacy mode — [BE/FE] — 2026-06-24
  > Added `supabase/migrations/0019_ai_tenant_settings.sql`, shared contracts/DB types, the
  > tenant `/ai/providers` + `/ai/privacy-mode` API, org-aware provider gating inside
  > `AiProviderPoolService`, focused API tests, and the live `/settings/ai` provider controls in
  > `apps/web`. Workspace members with `ai.settings.manage` can now store encrypted BYOK keys,
  > enable/disable providers, set provider priority, and persist the org privacy mode. `paid_only`,
  > `byok_only`, and `disabled` are enforced immediately; `redact_pii_before_ai` remains the
  > default stored policy but its dedicated redaction behavior is still tracked separately.

- [P3-11] QA: AI golden + schema validation + job tests — [QA] — 2026-06-24
  > Added checked-in AI golden fixtures under `packages/ai/src/__fixtures__/` and extended
  > `packages/ai/src/{analyzer,planner}.spec.ts` so the analyzer/planner prompt text and recorded
  > fake-provider JSON are asserted end to end with deterministic outputs. Extended
  > `apps/api/src/modules/ai/{opportunity-analyzer,action-planner}.service.spec.ts` to prove
  > structured-output repair still persists the resolved prompt version onto stored rows, and added
  > `apps/api/src/modules/ai/ai-pipeline.worker.spec.ts` to cover the BullMQ
  > `job_runs retrying → failed` lifecycle decisions on worker failures. Verified with
  > `pnpm --filter @radar/ai test|lint|typecheck`, `pnpm --filter @radar/api test|lint|typecheck`,
  > and `git diff --check`.

- [P3-10] AI settings UI — [FE] — 2026-06-24
  > Added [apps/web/src/app/(app)/settings/ai/page.tsx](/Users/hardikkaneria/Desktop/Github/github-hardik/LeadRadar/apps/web/src/app/(app)/settings/ai/page.tsx) plus the supporting data-layer work in [apps/web/src/lib/ai-settings.ts](/Users/hardikkaneria/Desktop/Github/github-hardik/LeadRadar/apps/web/src/lib/ai-settings.ts), [apps/web/src/lib/api.ts](/Users/hardikkaneria/Desktop/Github/github-hardik/LeadRadar/apps/web/src/lib/api.ts), and [apps/web/src/components/app-shell.tsx](/Users/hardikkaneria/Desktop/Github/github-hardik/LeadRadar/apps/web/src/components/app-shell.tsx). The new screen ships tenant-safe AI settings: workspace prompt-version browse/create/activate/revert-to-system via RLS/RPC, company/self usage and cost reporting via `/usage/*`, and a provider-policy section that clearly states pooled keys and task routing are platform-managed in the current build. Lint/build are green; runtime smoke verified unauthenticated `/settings/ai` resolves to the login screen after the protected-route loading state.
  > Later follow-up `T-009` replaced that interim provider-policy card with the live org BYOK + privacy-mode controls.
- [P3-09] Inbox intelligence UI — [FE] — 2026-06-24
  > Shipped the AI-aware Inbox in `apps/web`: the list/detail panes now load the latest
  > `ai_analysis`, `ai_action_plans`, and `job_runs` heads per discovery, show
  > score/urgency/priority/reason/service-match/due-at, support re-analyze via
  > `POST /discoveries/:id/analyze`, and poll live analysis job progress until the fresh score
  > lands. Build/lint are green; runtime smoke verified the unauthenticated `/inbox` → `/login`
  > redirect, while full authenticated live-data smoke still needs a real workspace session.
- [FD-05] Accessibility + UI QA pass — [QA] — 2026-06-23
  > Completed the current shipped UI QA pass: added [docs/architecture/15-ui-qa.md](/Users/hardikkaneria/Desktop/Github/github-hardik/LeadRadar/docs/architecture/15-ui-qa.md), reviewed the shared primitives and shipped operator screens against the design checklist, and fixed the issues that surfaced during the pass, including shared empty/status patterns and dirty-state settings behavior.
- [FD-04] Key screen wireframes — [DOCS] — 2026-06-23
  > Added [docs/architecture/14-key-screen-wireframes.md](/Users/hardikkaneria/Desktop/Github/github-hardik/LeadRadar/docs/architecture/14-key-screen-wireframes.md) with implementation-grade wireframes and layout rules for Action Center, Discovery Inbox, Opportunity Detail, Lead Workspace, Knowledge, and Settings, aligned to the shipped shell and shared primitives.
- [FD-02] Component library primitives + variants — [FE] — 2026-06-23
  > Added the shared UI layer in `apps/web/src/components/ui/` (`PageSection`, `MetricCard`, `EmptyState`, shared status tags, `SettingsSaveBar`) and refactored the shipped screens to use it, so the current AntD app now has a real reusable component vocabulary instead of page-local patterns.
- [FD-01] Design system foundation — [DOCS/FE/QA] — 2026-06-23
  > The design-system foundation is now fully closed: the target-state spec in `13-design-system.md`, the implemented shared UI layer in `apps/web`, the key-screen wireframes in `14-key-screen-wireframes.md`, and the QA signoff in `15-ui-qa.md` together establish the approved token, layout, and component contract for the next major frontend pass.
- [P2-11] Extension settings page — [FE] — 2026-06-23
  > Added [apps/web/src/app/(app)/settings/extension/page.tsx](/Users/hardikkaneria/Desktop/Github/github-hardik/LeadRadar/apps/web/src/app/(app)/settings/extension/page.tsx) plus thin-API helpers in [apps/web/src/lib/api.ts](/Users/hardikkaneria/Desktop/Github/github-hardik/LeadRadar/apps/web/src/lib/api.ts). Operators can now generate one-time scoped capture tokens, revoke them, and inspect recent extension batches and parser-version health from inside the app.
- [P2-10] Extension auth + resilience — [EXT] — 2026-06-23
  > Implemented token-based extension auth and retry behavior in the MV3 package: popup/options configuration for API URL + scoped token, background-delivery retries via `chrome.storage` queue + alarms, per-batch idempotency keys, parser-version stamping, and last-send status reporting in the popup.
- [P2-09] Chrome MV3 extension — capture — [EXT] — 2026-06-23
  > Scaffolded the loadable `extension/` workspace package: MV3 manifest, popup, options page, on-demand content-script injection, visible-only parsers for LinkedIn/Upwork/Freelancer plus generic fallback, review overlay, and delivery into `/api/v1/ingest/extension`.
- [P2-05] Extension ingestion endpoint + tokens — [BE] — 2026-06-23
  > Added `supabase/migrations/0009_extension_tokens.sql`, shared contracts/DB types, `/extension/tokens`, `/extension/health`, public `/ingest/extension`, scoped token verification, and worker-side `process-extension-batch` ingestion so browser captures now land in the Discovery pipeline through the same dedup/result model as manual and CSV inputs.
- [FD-03] App shell UI refresh — [FE] — 2026-06-23
  > Implemented the first-pass Radar OIP design-system rollout in `apps/web`: refreshed the shared
  > shell, theme tokens, global styling, auth frame, page headers, and the main shipped screens
  > (`/`, `/inbox`, `/capture`, `/jobs`, `/settings/company-brain`) with the new emerald/charcoal
  > visual language from `docs/architecture/13-design-system.md`. The later shared-primitives pass,
  > wireframe docs, and QA signoff completed the remaining shell-track work, so the design-track
  > shell objective is now fully closed in `11-task-breakdown.md`.
- [DOC-4] Task breakdown status annotations — [DOCS] — 2026-06-23
  > Extended `docs/architecture/11-task-breakdown.md` so every architecture task now carries a
  > `Status:` line (`Remaining` / `Partially completed` / `Completed`). Added completion notes to
  > the shipped Phase 1 and Phase 2 tasks plus the partially completed `FD-01` design-system
  > foundation task, and documented the pattern in `docs/agent/DECISIONS.md`.
- [DOC-3] Frontend design direction refresh docs — [DOCS] — 2026-06-23
  > Added `docs/architecture/13-design-system.md` as the target-state Radar OIP design-system spec
  > (dark, premium, Supabase-inspired but original), rewrote `06-frontend-structure.md` around the
  > new shell/layout/navigation model, updated `FEATURE.md`, `10-roadmap.md`, `11-task-breakdown.md`,
  > `docs/architecture/README.md`, and `README.md`, and added the explicit frontend design-track
  > backlog (`FD-01` to `FD-05`). Also documented the "current shipped AntD UI vs next design
  > direction" split in `docs/agent/DECISIONS.md` and `docs/agent/CONTEXT.md`.
- [UI-1] Ant Design 6 dark UI system + DESIGN.md/UIUX.md — [FE] — 2026-06-23
  > Rebuilt the whole web app on Ant Design 6 (dark, token-driven) per [[D-011]]: theme tokens,
  > providers (AntdRegistry + ConfigProvider), next/font (Inter/Space Grotesk/JetBrains Mono),
  > AntD app shell (icon sidebar + header), branded auth, and every page converted to AntD with
  > zero native form controls. Added `docs/DESIGN.md` + `docs/UIUX.md` (design + UX rules + per-page
  > DoD). Lint/build green (8 routes); `/login` screenshot-verified. Authenticated pages still need
  > a local Supabase login to exercise.
- [T-008] Fix web runtime smoke failure (`next start` 500 / dev reload instability) — [INFRA] — 2026-06-23
  > Root cause: `next start` was sometimes being run against a dev-mutated `.next` directory, which left dev-only route bundles referencing chunks like `vendor-chunks/tr46@0.0.3.js`. Added a clean-rebuild `prestart` in `apps/web/package.json`, then re-verified `/login` and `/inbox` under both `next start` and `next dev`.
- [T-000] Establish agent work system (AGENTS.md + docs/agent/* + .claude/agents/*) — 2026-06-22
- [DOC-1] Radar OIP architecture set (docs/architecture/ 01–11) — 2026-06-22
- [DOC-2] Radar OIP docs v2: 9 phases, SaaS tables, RBAC, enums, FEATURE.md, governance — 2026-06-22
- [RESET] Delete legacy LeadRadar code/docs; reuse repo for Radar OIP ([[D-005]]) — 2026-06-22

### Phase 1 · Foundation — COMPLETE (typecheck 7/7, tests pass, builds green)

> Reworked to **full Supabase** ([[D-006]]): auth + Postgres + RLS, thin NestJS. See
> `docs/architecture/13-supabase-integration.md`.

- [P1-01] Monorepo & workspaces — [INFRA] — 2026-06-22
- [P1-02] Database via Supabase SQL migrations (schema + extensions) — [BE] — 2026-06-22
- [P1-03] Core package (config, errors, tenant context, crypto) — [BE] — 2026-06-22
- [P1-04] Auth = Supabase Auth + SupabaseAuthGuard (replaces custom JWT/argon2) — [BE/FE] — 2026-06-22
- [P1-05] RBAC via RLS (roles/permissions/role_permissions + is_member/has_permission + seed) — [BE] — 2026-06-22
- [P1-06] Org & membership via supabase-js + RLS + create_organization RPC — [FE/BE] — 2026-06-22
- [P1-07] Contracts package + shared enums/DTOs/permissions; packages/supabase client — [BE/FE] — 2026-06-22
- [P1-08] Queue & Worker + job_runs + Job Status API (demo pipeline, service-role) — [BE/INFRA] — 2026-06-22
- [P1-09] Web shell + Supabase auth + RBAC nav (Next.js) — [FE] — 2026-06-22
- [P1-10] CI (build/lint/typecheck/test) + pino logging — [INFRA] — 2026-06-22
- [P1-11] QA: permission-guard unit tests (passing) — [QA] — 2026-06-22

> Notes: pinned `@supabase/supabase-js@2.45.4` (newer postgrest generics broke hand-written DB
> types). ⚠️ **Not verified live** — no Supabase creds / Docker in build env: apply migrations
> (`pnpm db:push`) and run the signup→demo-job flow locally. The role-permission unit suite was
> removed with the old NestJS rbac module; re-add against `@radar/contracts` if desired.

### Phase 3 · AI Intelligence — started

- [P3-08] Action Planner agent — [AI] — 2026-06-24
  > Added `supabase/migrations/0018_ai_action_plans.sql` for re-runnable planner rows tied to the
  > exact `ai_analysis` row, built the pure `@radar/ai` planner
  > (`packages/ai/src/planner.ts`) so the model drafts action/task wording while deterministic rules
  > resolve priority + due date, added the API-side `ActionPlannerService` writer + tests, and
  > wired `DiscoveryPipelineService` to plan best-effort after a successful analysis write.
- [P3-04] Cost tracking, rate limits, usage metering — [AI/BE] — 2026-06-24
  > Closed the remaining governed-gateway gaps behind the shipped usage ledger: added `supabase/migrations/0017_ai_rate_limits.sql` for the org-scoped `company_usage_limits.request_rate_limit_rpm` override, wired a Redis-backed `AiRateLimitService` into the live AI path for per-org request buckets and provider-account RPM buckets, extended `@radar/ai` to surface provider HTTP 429 metadata, and taught `AiUsageService` to persist `ai_provider_rate_limit_events` plus key cooldowns so pooled keys back off automatically after rate-limit responses.
- [P3-07] Embeddings + analysis pipeline — [AI/BE] — 2026-06-23
  > Added `supabase/migrations/0016_discovery_embedding_index.sql` (ivfflat on `discoveries.embedding`)
  > and the analyze/embedding job payloads. Hosted the `analyze-discovery` / `generate-embedding`
  > BullMQ consumers in the API ([[D-025]]: the standalone worker can't cross-import the Nest AI
  > services): `discovery-pipeline.service.ts` (new→processing→analyzed transitions + job_runs
  > lifecycle, reuses `OpportunityAnalyzerService` + pool embeddings, chains embedding after analyze),
  > `ai-pipeline.worker.ts` (consumers on a dedicated Redis connection, test-guarded), and
  > `POST /discoveries/:id/analyze` (`ai.use`). The standalone worker now auto-enqueues
  > `analyze-discovery` for newly inserted discoveries from the manual/CSV/extension ingestion paths,
  > so ingestion → analysis → embedding chains automatically. ⚠️ Not run against live Supabase/Redis;
  > `ai_analysis_done` notification still deferred.
- [P3-06] Opportunity Analyzer agent (`ai_analysis` writer) — [AI] — 2026-06-23
  > Added `supabase/migrations/0015_ai_analysis.sql` (re-runnable `ai_analysis`: score, intent/
  > urgency, `service_match`, budget_estimate, confidence, recommended_action, reason,
  > `is_bad_lead`, strategy + prompt-version FKs, `model_meta`; `discoveries.read` SELECT, writes
  > service-role). Built the pure analyzer `packages/ai/src/analyzer.ts` — bad-lead rule engine
  > (short-circuits before any model call), prompt builder, lenient structured-output parse, and
  > `analyzeOpportunity` that extracts AI signals then applies the deterministic P3-05 strategy for
  > the explainable score (country-match + budget-fit computed deterministically). Added the API
  > writer `apps/api/src/modules/ai/opportunity-analyzer.service.ts` (loads discovery + Company
  > Brain + active strategy, runs the live gateway, captures prompt-version/model via `hooks.onCall`,
  > persists `ai_analysis`) and wired `AiModule`. Re-exported `Json` from `@radar/supabase`; added
  > `AiAnalysisRow` DB types. [[D-024]]. ⚠️ Not run against a live Supabase DB / real model.
- [P3-03] Prompt versioning (`ai_prompt_versions`) — [AI/BE] — 2026-06-23
  > Added `supabase/migrations/0014_ai_prompt_versions.sql`: the versioned `ai_prompt_versions`
  > table (system defaults `organization_id is null` + org-custom), one-active-per-scope + stable
  > per-scope version indexes, RLS (member read of org + system rows, `ai.settings.manage` manage
  > of org-custom, system rows service-role only), `create_ai_prompt_version` /
  > `activate_ai_prompt_version` RPCs, the deferred `ai_requests.ai_prompt_version_id` FK, and a
  > seeded generic system default for all 11 agents. Added the gateway prompt-resolution seam in
  > `@radar/ai` (`ResolvedPrompt`/`PromptResolver`, `AIServiceOptions.resolvePrompt`,
  > `AiCallRecord.aiPromptVersionId`) so `AIService` resolves once per call, applies the resolved
  > system prompt when the caller didn't, and stamps the version onto every record. Added
  > `apps/api/src/modules/ai/ai-prompt.service.ts` (`resolveActivePrompt` + create/activate RPC
  > wrappers), wired it into `AiProviderPoolService.buildService` and `AiModule`, and persisted the
  > stamped id in `AiUsageService`. [[D-023]]. ⚠️ Not run against a live Supabase DB.
- [P3-05] Scoring strategy v1 (heuristic) — [AI/BE] — 2026-06-23
  > Added `supabase/migrations/0013_scoring_strategies.sql` for the org-scoped
  > `scoring_strategies` table with seeded heuristic defaults and matching Supabase DB types.
  > Added deterministic scoring in `packages/ai/src/scoring.ts` (`ScoringStrategy`,
  > `buildHeuristicScoringStrategy`, default weights, explainable factor breakdowns) and
  > `apps/api/src/modules/ai/scoring-strategy.service.ts` so the thin API can resolve or lazily
  > create the active org strategy before the Opportunity Analyzer consumes it in P3-06.
- [P3-14] AI usage ledger + quotas/credits — [BE] — 2026-06-23
  > Added `supabase/migrations/0012_ai_usage_ledger.sql` for `ai_requests`, `ai_usage_events`,
  > `company_usage_limits`, and `usage_credit_grants`, plus the matching contracts/permission
  > catalog/DB types. Added `apps/api/src/modules/ai/ai-usage.service.ts` to enforce company
  > request/token/cost/task quotas before live calls, persist the technical request log + billing
  > ledger after each call, and advance company/key/account counters. Added the `/usage/*` API in
  > `apps/api/src/modules/usage/` for self/company/team/limits/event reporting. Prompt-version
  > linkage stays additive via a nullable `ai_requests.ai_prompt_version_id` seam so the separately
  > claimed P3-03 can add the real FK/not-null contract next. Soft-degrade now returns typed 429s;
  > the `monthly_ai_usage_warning` notification emission remains deferred until the notifications
  > substrate exists in this codebase.
- [P3-13] Model router + task routes (`ai_task_routes`) — [AI] — 2026-06-23
  > Added `supabase/migrations/0011_ai_task_routes.sql` with the platform-owned route table,
  > active-route uniqueness, seeded free-first defaults, and no tenant-read policies. Added
  > `apps/api/src/modules/ai/ai-routing.service.ts` plus tests to load active DB rows and map them
  > into `TaskRoute`, then updated `AiProviderPoolService.buildService()` to inject those DB routes
  > into `AIService` so the live gateway now prefers Supabase-configured task routing over the
  > static defaults while keeping the in-code seeds as a fallback.
- [P3-12] AI Provider key pool — [BE/AI] — 2026-06-23
  > Added `supabase/migrations/0010_ai_provider_pool.sql` plus the matching Supabase DB types for
  > `ai_provider_accounts`, encrypted `ai_api_keys`, `ai_model_catalog`, `ai_provider_health_checks`,
  > and `ai_provider_rate_limit_events`. Extended `@radar/ai` so live adapters can resolve
  > credentials per call and surface key/account metadata, then added
  > `apps/api/src/modules/ai/ai-provider-pool.service.ts` to select eligible pooled keys from
  > Supabase (status/cooldown/task/quota/budget aware), decrypt them with `ENCRYPTION_KEY`, and
  > build the live provider set with env-key fallbacks for local/dev use.
- [P3-02] Provider adapters — [AI] — 2026-06-23
  > Added the live `AiProvider` adapters in `packages/ai/src/providers/` against the P3-01 contract:
  > `GeminiProvider` (generateContent + embedContent @ 1536 dims), `GroqProvider` and
  > `OpenRouterProvider` (shared OpenAI-compatible `chat/completions` helper, text-only),
  > and `OllamaProvider` (`/api/chat` + `/api/embeddings`, local). Shared `http.ts` (injectable
  > `FetchLike`, AbortController timeout, `ProviderHttpError` → router fallback) keeps them
  > SDK-free and offline-testable; `buildLiveProviders(config)` returns the free-first provider
  > list for `new AIService({ providers })`. Free-first, no Claude default ([[D-018]]). Added
  > `OPENROUTER_API_KEY` to `.env.example`. Verified: `@radar/ai` test 23/23 ✓, lint ✓, build ✓,
  > `pnpm -r typecheck` ✓. ⚠️ Not exercised against live provider APIs — needs real keys + the
  > key pool (P3-12).
- [P3-01] AI Gateway core — [AI] — 2026-06-23
  > Implemented the provider-agnostic gateway in `packages/ai` (replacing the `NotImplementedAIService`
  > stub): `AIService.generate/generateStructured/embed(ctx, input)` where `ctx = {taskType,
  > organizationId, userId}`; a **free-first `ModelRouter`** (ordered attempts primary→fallback→
  > fallback_2, skips unregistered providers, falls back on error) with a **circuit breaker**
  > (threshold + cooldown, half-open); default free-first task routes (`routes.ts`, Gemini→Groq;
  > the DB-backed `ai_task_routes` overrides them — P3-13); structured-output validation with one
  > **repair pass** (`AiSchemaError`); embeddings; a `hooks.onCall` **usage seam** (the plug for
  > `ai_requests`/`ai_usage_events` — P3-14); and a `FakeProvider` for offline/dev + tests. No live
  > provider SDK dependency yet (adapters = P3-02; key pool = P3-12). Files: `packages/ai/src/{types,
  > routes,router,providers/fake,service,index}.ts`. Verified: `@radar/ai` test 10/10 ✓, lint ✓,
  > build ✓, `pnpm -r typecheck` ✓.

### Phase 2 · Discovery Engine — ✅ COMPLETE

- [P2-12] QA: ingestion, CSV, extension parser/visible-only — [QA] — 2026-06-23
  > Added the worker QA suite `apps/worker/src/processors/discovery-ingestion.spec.ts` (17 tests):
  > `parseCsv` (quoted cells, escaped quotes, CRLF/LF, blank-line skip, ragged rows), `buildCsvRecords`
  > (header aliasing + no-header positional defaults), `normalizeCsvRecord`/`normalizeManualEntry`/
  > `normalizeExtensionItem` (field mapping, email/phone/website/budget/country normalization,
  > no-identifier skip), **dedup-hash idempotency** (equal identifiers → equal hash; empty → null),
  > and the result accumulators. Added the extension QA suite `extension/src/parsers/parsers.spec.ts`
  > (6 tests, jsdom): `compactItems`, `textOf`/`hrefOf`, the **visible-only guarantee**
  > (`isVisible`/`visibleElements` exclude display:none + visibility:hidden), and `parseGeneric`
  > snapshots. Stood up jest in `apps/worker` and `extension` (jest/ts-jest/jsdom; specs excluded from
  > the extension build) — [[D-017]]. Verified: worker test 17/17 ✓, extension test 6/6 ✓, worker+
  > extension typecheck ✓, worker build ✓. Closes Phase 2.

- [P2-08] Manual entry + CSV import UI — [FE] — 2026-06-23
  > Added `apps/web/src/app/(app)/capture/page.tsx` (nav-wired in `app-shell.tsx`) with a tabbed
  > capture screen. Manual tab: full discovery form (source/title/company/contact/email/phone/
  > website/country/budget/description/notes) gated on `discoveries.write`, with client-side
  > "at least one identifier" validation mirroring the shared `manualDiscoverySchema`. CSV tab:
  > file picker + header toggle + default-source select, a client-side preview that parses the
  > file and shows detected field mapping (mirrors the worker's header aliases) plus sample rows,
  > then uploads to the signed Supabase Storage target the API returns. Both flows POST through the
  > new thin-API helpers in `apps/web/src/lib/api.ts` (`ingestManual`/`ingestCsv` with a fresh
  > `Idempotency-Key`, plus `job`) and stream live job progress by polling `/jobs/:id` until a
  > terminal status. New data layer: `apps/web/src/lib/ingestion.ts`. ⚠️ Not exercised against a
  > live Supabase/bucket/worker — needs a local authenticated run to confirm upload + job
  > completion end to end.
- [P2-04] Ingestion service (manual + CSV) — [BE] — 2026-06-23
  > Added `apps/api/src/modules/ingestion/` with `/ingest/manual` and `/ingest/csv`, both gated by
  > `discoveries.write` and `Idempotency-Key`. Manual intake creates a tracked batch/job and lands
  > one normalized discovery asynchronously; CSV intake creates a signed Supabase Storage upload
  > target plus an `import-csv` job. The worker now processes `ingest-manual` + `import-csv`,
  > normalizes records, parses CSV rows, and inserts discoveries through
  > `supabase/migrations/0008_ingestion_helpers.sql` for exact-hash + pg_trgm fuzzy dedup.
  > README/.env now document the required `DISCOVERY_IMPORTS_BUCKET` setup. ⚠️ Not verified live
  > against a real Supabase project/bucket.
- [P2-02] Company Brain UI — [FE] — 2026-06-23
  > Added `apps/web/src/app/(app)/settings/company-brain/page.tsx` and exposed it in
  > `apps/web/src/components/app-shell.tsx`. The page reads the active Company Brain version and
  > full history via `apps/web/src/lib/company-brain.ts`, provides editable targeting/ICP/outreach
  > fields, a bad-lead rule builder with client-side validation against the shared DTO schema, and
  > a version-history rail that can preview or reload older snapshots into the editor. Saves create
  > new versions through the existing Supabase RPC.
- [P2-01] Company Brain — [BE] — 2026-06-23
  > Added `supabase/migrations/0007_company_brain.sql`: versioned `company_profiles`, one-active-per-org invariant, `create_company_profile_version` RPC, and `company_brain.manage` read RLS. Added contracts DTOs for Company Brain inputs/rules and `apps/web/src/lib/company-brain.ts` as the Supabase-first data layer for active profile, history, and version creation. Typecheck green; web lint/build green. ⚠️ Not run against a live Supabase DB.
- [P2-03] Discovery storage model (`supabase/migrations/0005_discovery.sql` + DB types) — [BE] — 2026-06-22
  > discovery_batches + discoveries (raw_payload, hints, dedup_hash, embedding vector(1536)),
  > full discovery_source/status enums, indexes (status/source/GIN raw_payload/trgm title/unique
  > dedup), RLS gated by `discoveries.read`. ivfflat(embedding) deferred to P3-07. Typecheck 7/7,
  > lint clean. ⚠️ Not applied to a live DB (no creds/Docker) — `pnpm db:push` locally.
- [P2-06] Discovery Inbox API (supabase-js + RLS, per [[D-006]]) — [BE] — 2026-06-22
  > `0006_discovery_inbox.sql` UPDATE policy (`discoveries.write`) for status transitions/soft-delete;
  > contracts DTOs (discoveryFilterSchema, updateDiscoveryStatusSchema, DiscoverySummary/Detail/
  > ListResult, DISCOVERY_INBOX_STATUSES); `apps/web/src/lib/discoveries.ts` typed data layer
  > (list+filters/pagination, detail, bulk setStatus). Typecheck 7/7, web lint + build green.
  > ⚠️ Not run against a live DB. Inserts (manual entry) deferred to P2-04; UI to P2-07.
- [P2-07] Discovery Inbox UI — [FE] — 2026-06-23
  > Added `apps/web/src/app/(app)/inbox/page.tsx` plus nav wiring in `apps/web/src/components/app-shell.tsx`: filter rail, paginated list/detail triage, bulk/single status actions, raw payload preview, and permission gating on top of the existing Supabase/RLS data layer. Browser-smoked after [T-008]: `/login` renders and `/inbox` redirects unauthenticated users to `/login` in both `next start` and `next dev`.

---

## 🗄️ Superseded (legacy LeadRadar — code now deleted)

- [T-001..T-005] Legacy Vite/Supabase Stage-1 tasks — obsolete; code removed in [RESET].
  Replacements live in the Radar OIP roadmap (e.g. tasks page → P5-04, lead detail → P5-03).
