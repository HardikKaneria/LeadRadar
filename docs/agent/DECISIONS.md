# DECISIONS.md — Decision Log

> Lightweight ADRs. One entry per non-obvious decision so agents don't re-litigate
> settled choices. Newest first. Don't delete entries — supersede them.
>
> Format:
> ```
> ## [D-00X] Title — YYYY-MM-DD — status: accepted | superseded
> Context: what forced a choice
> Decision: what we chose
> Consequences: what follows / what to avoid
> ```

---

## [D-051] Workspace settings live behind one `/settings` shell with route-aware subtabs — 2026-06-29 — status: accepted
Context: The web app had grown multiple first-class sidebar entries for AI settings, company brain,
extension, templates, integrations, billing, roles, audit, security, and notifications. That
flattened navigation made the sidebar noisy and increased the chance of route drift whenever a new
settings page was added or renamed.
Decision: Consolidate workspace settings behind a single `/settings` destination in the sidebar and
render the individual settings surfaces as permission-aware icon tabs inside a shared settings shell.
Keep the existing deep links (`/settings/*`) intact, add `/settings` as the role-aware entry point,
and route the legacy `/notifications` path into `/settings/notifications` rather than maintaining a
separate sidebar branch.
Consequences: Future workspace-level settings work should register itself in the shared settings
section map instead of adding new top-level sidebar items. Settings route visibility now comes from
that central map, and route/breadcrumb/nav updates should stay in sync through the same definition.

## [D-050] SQL migrations are append-only; fixups ship as new migration files — 2026-06-29 — status: accepted
Context: Agents have been iterating quickly on the schema and follow-up governance work, which makes
it tempting to patch older migration files when a later task needs different seed data, policies, or
role grants.
Decision: Existing SQL migration files under `supabase/migrations/` are immutable once added to the
repo. Any schema, policy, seed, or backfill change must ship in a brand-new migration file rather
than editing an earlier migration in place.
Consequences: Migration history stays auditable and reproducible across environments. Future agents
must treat migration corrections as forward-only fixups, even when updating an older migration would
look smaller in the diff.

## [D-048] Lead-hunting research is provider-first but degrades to visible-payload evidence instead of failing closed — 2026-06-29 — status: accepted
Context: P10-06 needed the new post-research worker to run through the external-provider
orchestrator (`P10-05`), but the repo still has no concrete Bright Data/Apify/Firecrawl adapters or
guaranteed tenant credentials. Treating missing providers as hard failures would leave every raw
post stuck before classification, even though the visible LinkedIn payload already contains usable
owner/company/post evidence.
Decision: The research worker attempts the orchestrated provider stages where they exist, but each
stage falls back to deterministic visible-payload heuristics and records that fallback explicitly in
`report_json`, `field_evidence_logs`, and session notes. Missing providers, manual-fallback routes,
or single-stage failures do not abort the whole post unless the worker cannot reach persisted
evidence + classification at all.
Consequences: M16 can ship a working end-to-end pipeline before the concrete vendor adapters land,
and later provider work should improve evidence richness rather than rewrite the stage machine.
Operators can see where a field came from (`provider:*`, `visible_payload`, `text_inference`,
`company_hint`, etc.), and manual reruns remain useful once richer providers are configured.

## [D-047] Lead-hunting handoff writes directly into `discoveries` + `ai_analysis` instead of reusing the Phase 3 analyzer queue — 2026-06-29 — status: accepted
Context: P10-08 needed qualified/reviewed raw posts to enter the existing discovery inbox without
creating a second approval silo. Re-enqueuing the older `analyze-discovery` pipeline after
lead-hunting classification would duplicate scoring work, lose the post-specific provenance that
just produced the decision, and blur whether inbox AI came from the general analyzer or the new
lead-hunting classifier.
Decision: The lead-hunting handoff service creates or updates a canonical `discoveries` row
directly from the raw post + research report and immediately writes a matching `ai_analysis` row
from the persisted `post_classifications` decision. Discovery status then reflects the lead-hunting
route (`reviewed` for qualified, `analyzed` for needs-review, `approved` on explicit operator
approve), while archived/rejected posts stay out of the discovery workflow.
Consequences: The inbox reads lead-hunting output through the same `discoveries` / `ai_analysis`
surface it already uses, with `raw_payload.leadHunting` carrying the provenance links
(`raw_post_id`, report id, classification id, canonical company/contact ids). Future UI/API work
should treat lead-hunting discoveries as first-class discoveries rather than trying to mirror or
re-run the Phase 3 analyzer pipeline for the same post.

## [D-046] External research providers mirror the AI governance model but live in a separate lead-hunting module — 2026-06-29 — status: accepted
Context: P10-04/P10-05 needed encrypted non-AI vendor keys, allowlists, cooldowns, routes, call
logs, usage events, and rate-limit persistence. The existing M15 AI provider pool already solved
most of those governance problems, but folding Bright Data/Apify/Firecrawl-style vendors into the
AI module would blur boundaries with AI-only concepts like models, token counts, prompt routing,
and `AIService`.
Decision: Reuse the **shape** of the M15 provider system, not the implementation surface. The new
`apps/api/src/modules/lead-hunting/` module owns `external_provider_*` tables plus dedicated pool,
route, rate-limit, usage, adapter-registry, and orchestrator services. It mirrors encrypted key
storage, LRU selection, account/key quotas, cooldowns, fallback routes, and auditable call rows,
but keeps request execution provider-agnostic and free of AI task/model semantics.
Consequences: Future P10 work should plug concrete vendor adapters into the lead-hunting registry,
not call vendor SDKs directly from workers. AI routing and external research routing can evolve in
parallel without leaking model/prompt assumptions into the research stack, while P10-10 can build
provider admin UI on the same operational concepts users already have for AI.

## [D-045] Lead-hunting capture canonicalizes raw posts across sessions via fingerprint links, not duplicate raw rows — 2026-06-29 — status: accepted
Context: P10-03 needed extension captures to remain idempotent across retries and repeated LinkedIn
search sessions, while still preserving which session saw which visible post. The base `raw_posts`
table from P10-01 only had a single `search_session_id` and a single `dedup_hash`, which was not
enough to both dedup canonically and remember repeated captures.
Decision: Add `lead_search_session_posts` and `raw_post_fingerprints` as the capture-ingestion seam.
`raw_posts` stays canonical and stores one row per unique post; repeated captures attach through the
session link table, and dedup first checks stable fingerprint types (`post_url`, `post_text_hash`,
`owner_profile_text`, `owner_name_date_excerpt`, `company_text`) before falling back to the stored
`dedup_hash`. Research jobs are unique per canonical raw post and are re-queued only when the
existing `post_research_jobs` row is missing or recoverably stopped.
Consequences: Later workers and UI should treat `raw_posts` as the canonical post identity and
`lead_search_session_posts` as the capture-history join. Future dedup tweaks belong in the
fingerprint builder and lookup order, not in ad hoc duplicate raw-post insertion logic.

## [D-044] P10-02 carries both M16 raw-post fields and legacy discovery fields until the lead-hunting intake path is replaced — 2026-06-29 — status: accepted
Context: P10-02 needed the extension to emit the richer LinkedIn raw-post/session payload from the
lead-hunting architecture (`captureMode`, `searchQuery`, `postUrl`, `postText`, owner/company/date/
engagement fields), but the live `/ingest/extension` path and `process-extension-batch` worker still
normalize extension batches through the older Phase 2 discovery-shaped fields. Replacing the payload
wholesale in the extension task would either break the current intake or pull P10-03's backend
ingestion rewrite into the same diff.
Decision: Extend the shared extension capture contract to carry **both** shapes for now. The
LinkedIn v2 parser populates the M16 raw-post fields plus the legacy discovery fields (`title`,
`description`, `companyName`, `contactName`, `url`) as compatibility shims, and the review overlay
reads from the richer fields. `captureMode` defaults to `visible_posts`, and `searchQuery` travels
with the batch so P10-03 can create `lead_search_sessions` without inventing more frontend changes.
Consequences: P10-03 should consume the richer lead-hunting fields first and treat the generic
discovery fields as temporary compatibility data, not the source of truth. Future LinkedIn capture
changes should preserve the visible-post payload contract rather than collapsing back to generic-only
capture, and any cleanup that removes the legacy fields belongs in a later backend/client pass once
the M16 intake path fully replaces the P2 discovery normalization seam.

## [D-043] P10-01 stores lead-hunting research against canonical M7 entities and reuses discovery permissions for interim RLS — 2026-06-29 — status: accepted
Context: The lead-hunting architecture doc sketched `resolved_people` / `resolved_companies`
staging tables and a future dedicated `lead_hunting.*` permission family, but `P10-01` is only the
first storage/RLS slice. Pulling the staging layer and a new permission seed into the same task
would widen the change substantially and duplicate the shipped company/contact graph patterns.
Decision: `0065_lead_hunting_storage.sql` ships the raw capture / job / report / classification /
archive / evidence tables, but **does not** add separate resolved-entity staging tables. Instead,
`post_research_reports` points at canonical `contacts` / `companies` when a resolver can promote
confidently, while ambiguous or partial outputs remain in `report_json` + `field_evidence_logs`.
RLS reads reuse `discoveries.read` plus the existing own-scope fallback (`discoveries.read_own`)
until `P10-11` introduces the dedicated `lead_hunting.*` catalog and route-specific policies.
Consequences: P10-06 should write resolved people/companies into M7 directly or keep them as
unresolved evidence, rather than inventing a parallel entity graph. P10-11 can tighten the
permission model by swapping the helper-backed read policies without another schema migration.
Operator writes remain governed API/service-role owned until the later lead-hunting mutation tasks
land, matching `job_runs` / `ai_analysis`.

## [D-042] Lead Hunting Research Pipeline ships as a dedicated Phase 10 that reuses the existing discovery, provider, and CRM foundations — 2026-06-29 — status: accepted
Context: `docs/architecture/linkedin-lead-hunting-research-pipeline.md` described a large new
lead-hunting subsystem, but it was not anchored in the roadmap or task board. Without a formal
phase, the work would likely be picked up as scattered extension, provider, AI, or UI tasks,
which would blur ownership and risk duplicating the existing M15 provider/usage and CRM flows.
Decision: Treat M16 Lead Hunting Research as a new **Phase 10** in the roadmap and task breakdown,
with ordered `P10-*` tasks spanning storage, extension capture, ingestion, external-provider
orchestration, research workers, classification, CRM handoff, UI, RBAC/limits, and QA. The phase
must extend the current discovery/inbox/opportunity/lead pipeline and the existing provider
governance model instead of introducing parallel systems.
Consequences: Future implementation and handoff work should reference `P10-*` IDs. Provider-key
work for lead hunting must build on M15 patterns (encrypted keys, usage, cooldowns, routing) rather
than a separate ad hoc store. Qualified lead-hunting output now has a clear path into the existing
approval and lead workflow, while archived output stays queryable as intelligence.

## [D-036] Activities/notes/attachments reuse the canonical entity ref + opportunity permissions; activities are append-only via `log_activity` — 2026-06-24 — status: accepted
Context: P4-07 needed a polymorphic timeline (activities), notes, and attachment metadata that can
hang off opportunities/companies/contacts (and leads later). The questions were: what polymorphic
entity-ref type to use, what permissions gate it, and how to keep the timeline trustworthy.
Decision: Reuse the existing `relationship_node_type` enum (opportunity/company/contact) from P4-03
([[D-034]]) as the one canonical entity reference for activities/notes/attachments too — no second
identical enum — and reuse its `relationship_node_exists` validator in the write RPCs. Gate reads on
`opportunities.read` and note/attachment edits on `opportunities.write`, reusing [[D-033]] rather
than adding `activities.*`/`notes.*` permission keys. `activities` is **append-only**: it has a
SELECT policy but no INSERT/UPDATE policy, and the only write path is the SECURITY DEFINER
`log_activity`, called by the `add_note`/`record_attachment` RPCs and by AFTER INSERT/UPDATE triggers
on `opportunities` (create + every status change). Attachments store **metadata only** (bucket/path/
filename/mime/size) via `record_attachment`; the binary upload + signed-URL/storage-policy wiring is
deferred to the FE follow-up, mirroring how P2-03 shipped the discovery schema before P2-04's
ingestion. Web access runs through `apps/web/src/lib/timeline.ts` ([[D-006]]).
Consequences: One entity-ref type stays DRY and gains `lead` later via a single `alter type ... add
value` (covering relationships + timeline). The timeline can't be forged from the client — every row
is server-authored. Notes/attachments soft-delete; activities don't (immutable log). When leads land,
add `lead` to the enum and a status/stage trigger on `leads`. The attachments table is inert until
the upload path ships.

## [D-035] Company Research overwrites `companies.enrichment` (no history table); the job lives in the API pipeline — 2026-06-24 — status: accepted
Context: P4-04 needed a Company Research agent writing website/tech/industry/problems/suggested
services. The analyzer (`ai_analysis`) and planner (`ai_action_plans`) each got a dedicated
re-runnable history table, so the question was whether research needed one too.
Decision: Research writes straight into the existing `companies.enrichment` jsonb (added by P4-02),
overwriting it each run rather than appending to a history table — the architecture spec frames the
output as "→ `companies.enrichment`", and a company's enrichment is a current-state snapshot, not an
audited decision trail like a score/action. Provenance (model, prompt-version id, timestamp) is
stored inside the jsonb. The writer back-fills `industry`/`tech_stack` columns only when they're
still empty so it never clobbers operator-entered data. The `research-company` job is hosted in the
**API** `DiscoveryPipelineService` + `AiPipelineWorker` (not the standalone worker), reusing the
governed gateway/services exactly like the analyze/embedding jobs ([[D-025]]); `POST
/companies/:id/research` (`ai.use`) triggers it. No migration was needed.
Consequences: No enrichment audit history — if we later need to diff research over time, add an
`ai_company_research` history table and have the writer insert there + project the latest into
`companies.enrichment`. Re-running research is cheap and idempotent on the column. The pure agent
(`@radar/ai`) stays DB-free and golden-fixture tested; the API writer owns persistence + back-fill.

## [D-034] Relationship edges are polymorphic (node_type + id), validated in the write RPC, not by FK — 2026-06-24 — status: accepted
Context: P4-03 needed a typed/weighted relationship graph (works_at, decision_maker_for, referred_by,
…) spanning companies, contacts, and opportunities. A single edge table needs endpoints that can
point at any of those entities, but Postgres FKs can't reference a column whose target table varies
per row.
Decision: `relationship_edges` stores polymorphic endpoints as `(source_type, source_id)` /
`(target_type, target_id)` where `*_type` is the `relationship_node_type` enum
(company/contact/opportunity) and `*_id` is a plain `uuid` with no FK. Referential integrity is
enforced at write time instead: the SECURITY DEFINER `upsert_relationship_edge` RPC calls
`relationship_node_exists(org, type, id)` for both endpoints (CASE over the three entity tables,
org-scoped, not-soft-deleted) before inserting, rejects self-loops, and dedups on
`(org, edge_type, source, target)` — reviving and re-weighting a soft-deleted match rather than
duplicating. `delete_relationship_edge` soft-deletes. Reads/edits are RLS-gated on
`opportunities.read`/`opportunities.write`, reusing [[D-033]] rather than adding a `relationships.*`
permission. Web access runs through `apps/web/src/lib/relationships.ts` ([[D-006]]).
Consequences: One edge table covers every entity kind and is cheap to extend with new node/edge
types, at the cost of no DB-level FK cascade — a hard-deleted entity can leave dangling edge rows
(the entity tables soft-delete today, so this is latent). When a real entity hard-delete path lands,
add edge cleanup there. Endpoint validation lives only in the RPC, so direct table inserts (service
role) bypass it; all app writes go through the RPC. Fuzzy `pg_trgm` node/edge dedup is deferred.

## [D-033] Companies/contacts reuse the opportunity permissions and dedup/merge through RPCs — 2026-06-24 — status: accepted
Context: P4-02 needed the `companies`/`contacts` entity layer (M7) with upsert-dedup + merge, but the
shipped RBAC catalog has no `companies.*`/`contacts.*` permission, and adding new permission keys
means seeding role grants across every system role.
Decision: Gate companies/contacts reads on `opportunities.read` and writes on `opportunities.write`
(the closest M6/M7 owner; every role that manages opportunities should manage their companies and
contacts). Writes go through SECURITY DEFINER RPCs in `0021_companies_contacts.sql`: `upsert_company`
(dedup on `(org, domain)`, else case-insensitive name) and `upsert_contact` (dedup on `(org, email)`,
else `(company, name)`) preserve existing non-null fields, and `merge_companies` / `merge_contacts`
repoint references (contacts + opportunities) then soft-delete the duplicate. The same migration
wires the FK-less `opportunities.company_id` / `primary_contact_id` columns (left by P4-01 / [[D-032]])
to real FKs (`on delete set null`). Reads/edits run through `apps/web/src/lib/companies.ts` ([[D-006]]).
Consequences: No catalog/role-grant churn now; a dedicated `companies.*` permission can be introduced
later if the entity graph needs finer access control. Dedup/merge stay atomic and authz-checked.
Name-based dedup is exact (case-insensitive) in v1 — fuzzy/`pg_trgm` matching and the relationship
graph are P4-03. The engine logic lives in the RPCs (single source) and is verified live, matching
the P2-01/P2-06/P4-01 data-layer pattern.

## [D-032] Discovery→opportunity conversion is an atomic, threshold-gated RPC; the engine snapshots the latest analysis + action plan — 2026-06-24 — status: accepted
Context: P4-01 needed to turn an analyzed discovery into an `opportunities` row only when a human
approves it and the score clears the org threshold, while atomically flipping the discovery to
`converted`. The web client talks to Supabase under RLS ([[D-006]]), so a two-write flow from the
browser would be racy and would need elevated authz.
Decision: Ship `convert_discovery_to_opportunity(p_discovery, p_owner, p_force)` as a SECURITY
DEFINER RPC (`0020_opportunities.sql`) that checks `opportunities.write`, reads the org
`scoreThreshold` (from `organizations.settings`, default 60), enforces it unless `p_force`, refuses
already-converted or bad-lead discoveries, snapshots the latest `ai_analysis` (score, value,
explanation, action) and latest `ai_action_plan` (priority/weight), derives a basic
`heat_score = round(least(100, score*0.7 + priority_weight*0.3), 2)`, inserts the opportunity, and
flips the discovery to `converted` — all in one transaction. Reads/edits use a web data layer
(`apps/web/src/lib/opportunities.ts`) under `opportunities.read` / `opportunities.write`, mirroring
the Discovery Inbox ([[D-006]]). Priority falls back to a score band when no action plan exists.
Consequences: Conversion is atomic, RLS-safe, and callable straight from the browser like the
Company Brain RPC. The engine logic lives in SQL (single source) and is not JS-unit-tested, matching
the P2-01/P2-06 data-layer pattern (verify live). `company_id` / `primary_contact_id` are nullable
and FK-less until P4-02 lands companies/contacts; `expires_at`/currency stay null in v1. The
Opportunities UI (P4-06) and Action Center (P4-05) read this table; status edits are limited to a
safe operator subset (`open`/`qualified`/`ignored`/`archived`).

## [D-031] Tenant AI settings now use a dedicated `integration_accounts` BYOK surface, while `redact_pii_before_ai` stays a stored policy until redaction ships — 2026-06-24 — status: accepted
Context: T-009 needed to close the gap between the shipped `/settings/ai` screen and the
architecture docs. Prompt versions and usage reporting were already live, but org-level provider
keys, provider priority, and `organizations.settings.privacy_mode` were still missing. At the same
time, the documented `redact_pii_before_ai` behavior depends on a separate PII-redaction task, so
shipping the setting without caveats could mislead operators.
Decision: Add a dedicated tenant-owned `integration_accounts` table for org AI providers instead
of overloading the platform pooled-key tables. The thin API now exposes `/ai/providers` and
`/ai/privacy-mode`, stores BYOK credentials encrypted, and passes the resolved org runtime policy
into `AiProviderPoolService` so `paid_only`, `byok_only`, and `disabled` affect live routing
immediately. Keep `redact_pii_before_ai` as the default persisted policy and expose it in the UI,
but state explicitly in the UI/docs that dedicated redaction behavior is not implemented yet in
this repo.
Consequences: `/settings/ai` is now truthful and actionable for workspace admins, and the existing
privacy-mode contract can absorb the later redaction work without another schema or API change.
Future work on PII redaction should attach to the existing `privacy_mode` path rather than
inventing a parallel policy surface.

## [D-030] AI QA uses checked-in golden fixtures in `packages/ai`, while job retry/fail lifecycle is tested at the worker boundary — 2026-06-24 — status: accepted
Context: P3-11 needed stable offline AI QA that proves prompt/response behavior and structured-output
repair without calling live models, plus coverage for the `job_runs` retrying/failed transitions.
The pure analyzer/planner logic lives in `@radar/ai`, but the `retrying` vs `failed` status choice
only happens inside `AiPipelineWorker`'s BullMQ `failed` event handler, not in
`DiscoveryPipelineService`.
Decision: Keep the golden AI fixtures beside the package-level analyzer/planner specs in
`packages/ai/src/__fixtures__/`, and drive them through `FakeProvider` so CI stays offline while
prompt text, recorded model JSON, and deterministic outputs are all asserted together. Cover
`job_runs` exhaustion semantics separately in `apps/api/src/modules/ai/ai-pipeline.worker.spec.ts`,
where the BullMQ worker boundary actually decides `retrying` vs `failed`.
Consequences: Prompt/response regressions now fail in the package that owns the agent logic, while
job lifecycle regressions fail in the API module that owns queue error handling. Future AI QA
should extend these fixture-backed specs instead of introducing live-model tests.

## [D-029] The tenant AI settings screen ships against live prompt + usage capabilities, while provider controls stay read-only until the org BYOK backend exists — 2026-06-24 — status: superseded
Context: P3-10 called for `/settings/ai` to cover provider config, prompt versions, and usage. In
the shipped codebase, prompt versioning (`ai_prompt_versions`) and usage reporting (`/usage/*`) are
real, but the org-level BYOK/provider surface described in the architecture docs is not: there is
no `integration_accounts` implementation, no tenant `/ai/providers` API, and no persisted
privacy-mode UI path yet. Building fake toggles would mislead operators.
Decision: Ship the AI settings page around the capabilities that actually exist today. Workspace
members with `ai.settings.manage` can browse system defaults, create org custom prompt versions,
activate a prior org version, and revert back to the system default. Usage reads flow through the
live `/usage/*` API with permission-based scope (self, company summary, company detail, limits).
The provider section is intentionally informative, not editable: it explains that pooled keys and
task routing are platform-managed in the current build and shows observed provider usage instead of
pretending the tenant can edit key pools or per-task routing.
Consequences: This was the correct interim state for P3-10. It is now superseded by [[D-031]],
which shipped the real org BYOK/provider + privacy-mode backend parity under `T-009`.

## [D-028] Inbox AI reads stay in the web data layer, while re-analysis stays on the thin API — 2026-06-24 — status: accepted
Context: P3-09 needed the Inbox to show the latest analyzer/planner/job state per discovery
immediately, but there was no existing aggregated API read endpoint for that projection. Adding a
new server-side discovery-AI read surface would widen a frontend task into new contracts,
controller/service code, and another cache boundary, even though the app already reads discovery
data directly from Supabase under RLS.
Decision: Keep the Inbox read model in `apps/web/src/lib/discoveries.ts`. The web app now joins
`discoveries` with the latest `ai_analysis`, `ai_action_plans`, and `job_runs` (`analyze-discovery`
heads) via direct `supabase-js` reads scoped by `organization_id` and enforced again by RLS.
Governed mutations still use the thin API: re-analysis remains `POST /discoveries/:id/analyze`, and
job polling remains `/jobs/:id`.
Consequences: P3-09 ships without inventing a one-off API aggregator and stays aligned with the
current web architecture (Supabase for member-scoped reads, API for governed/background writes). If
another client or multiple screens later need the same projection, that is the point to lift this
read model into a dedicated API endpoint or shared query seam.

## [D-027] Action Planner output is stored in `ai_action_plans`, with deterministic priority/timing and best-effort pipeline wiring — 2026-06-24 — status: accepted
Context: P3-08 needed to ship the Action Planner before the Phase 4/5 `opportunities` and
`tasks` modules exist in code. Extending `ai_analysis` would blur analyzer vs planner concerns,
while introducing real opportunity/task tables now would break the stage boundary and widen the
diff substantially.
Decision: Add a separate re-runnable `ai_action_plans` table keyed to the discovery and the exact
`ai_analysis` row that informed the plan. The pure `@radar/ai` planner lets the model draft the
*action wording* and the first task skeleton (`title`, `type`, `notes`), but priority,
`priority_weight`, and `due_at` are resolved deterministically from the latest analysis so the plan
stays explainable and cheap to recompute. `DiscoveryPipelineService` now calls the planner after a
successful analysis write, but **best-effort**: a planner failure is logged onto the job result and
does not roll the discovery back out of `analyzed`; re-analyze reruns the planner.
Consequences: P3-09 can read priority/due-at/action data immediately from `ai_action_plans`
without pulling Phase 4/5 tables into scope. Later opportunity/task creation can consume the latest
planner row or promote it into real `opportunities` / `tasks`. Planner retries currently piggyback
on the existing re-analyze flow; a dedicated re-plan trigger can be added later if needed.

## [D-026] Short-window AI throttling lives in Redis, while the durable usage ledger and provider cooldowns stay in Supabase — 2026-06-24 — status: accepted
Context: After P3-14/P3-03/P3-07, the live AI path already had durable quotas, request logs, and
provider-key metadata, but it still lacked the short-window controls from P3-04: per-org burst
throttling and a real response to provider HTTP 429s beyond a failed `ai_request`.
Decision: Add `apps/api/src/modules/ai/ai-rate-limit.service.ts` as the short-window control plane.
It uses Redis token buckets for the org request bucket and provider-account RPM bucket, while the
durable row state stays in Supabase: `company_usage_limits.request_rate_limit_rpm` provides an
optional per-org override over the platform default, `AiUsageService` logs provider 429s into
`ai_provider_rate_limit_events`, and the affected pooled key is marked `cooldown` with
`cooldown_until` so later credential resolution skips it until the backoff expires. `@radar/ai`
now surfaces provider HTTP status / Retry-After metadata on emitted call records, but it still
does not know about Redis or Supabase directly.
Consequences: Burst/rate controls now work across API processes because Redis is the shared state,
while auditability and admin observability stay in Postgres. The gateway can back off specific keys
automatically after provider rate limits without coupling the storage-agnostic core package to the
database or the Redis client. Future P3-10 admin/settings work can expose the per-org override and
the rate-limit telemetry without redesigning the runtime seam.

## [D-025] AI pipeline consumers are hosted in the API process, not the standalone worker — 2026-06-23 — status: accepted
Context: P3-07 needed async `analyze-discovery` / `generate-embedding` jobs that run the governed
gateway (`AiProviderPoolService`, `AiUsageService`, prompt resolution) + `OpportunityAnalyzerService`.
Those are NestJS-injectable services in `apps/api`; the standalone `apps/worker` is a plain BullMQ
script and **cannot cross-import** Nest services from another app. The doc-07 design assumed the
worker imports the same domain modules, but the shipped split doesn't allow it. The two real options
were (a) co-host the AI consumers in the API, or (b) extract all AI orchestration into a shared
package (a large refactor).
Decision: Co-host the two AI-pipeline consumers in the API via `AiPipelineModule` /
`AiPipelineWorker` (own Redis connection, since workers issue blocking commands; guarded off when
`NODE_ENV=test`). `DiscoveryPipelineService` owns the `new→processing→analyzed` transitions + job_runs
lifecycle and reuses the existing AI services with zero duplication. The standalone `apps/worker`
stays the home for non-AI ingestion jobs and now auto-enqueues `analyze-discovery` for freshly
inserted discoveries (best-effort), so ingestion → analysis → embedding chains automatically. A
`POST /discoveries/:id/analyze` endpoint (`ai.use`) re-triggers analysis (P3-09 re-analyze).
Consequences: No governance regression on the async path (quotas, usage ledger, prompt stamping all
apply), no duplicated orchestration. The API now also runs queue consumers — acceptable for a
long-running service, and gated so unit tests don't open Redis. Future consolidation could move both
apps into one Nest worker context once the AI services are package-extractable. The
`ai_analysis_done` notification stays deferred until the notifications substrate exists (same gap as
[[D-021]]).

## [D-024] The Opportunity Analyzer extracts semantic signals; the deterministic strategy owns the numeric score — 2026-06-23 — status: accepted
Context: P3-06 needed a validated `ai_analysis` writer combining the discovery, Company Brain, and
scoring strategy. Letting the model emit the final 0–100 score directly would be non-deterministic,
hard to explain, and would duplicate the P3-05 heuristic ([[D-022]]).
Decision: Split the work. The model returns only *semantic* signals (intent, urgency, service
matches, budget read, confidence, recommended action, reason); the deterministic `ScoringStrategy`
turns the resolved `ScoringFeatures` into the explainable numeric score + factors. Country match and
budget fit are computed deterministically when the structured facts are known (target countries /
min budget), overriding the model. Bad-lead rules from the Company Brain are evaluated first and
short-circuit to a `score 0`, `is_bad_lead` row **without any model call**. The pure analyzer
(`packages/ai/src/analyzer.ts`) is offline-testable; the API writer
(`apps/api/src/modules/ai/opportunity-analyzer.service.ts`) resolves the active strategy, runs the
gateway, captures the successful call's prompt-version + provider/model via `hooks.onCall`, and
persists `ai_analysis` (`0015_ai_analysis.sql`, re-runnable history, read gated by `discoveries.read`).
Consequences: Scores stay deterministic, explainable, and cheap to recompute; the model is only
trusted for judgement it is actually good at. The async job lifecycle, status transitions, and
embeddings remain P3-07; the opportunity engine threshold (P4-01) and Inbox AI UI (P3-09) read this
table. An `is_bad_lead` flag was added beyond the doc-04 column list so downstream filtering doesn't
have to infer rejection from `score = 0`.

## [D-023] Prompt resolution is a `@radar/ai` seam fed by the API layer; system defaults are seeded so every call stamps a version — 2026-06-23 — status: accepted
Context: P3-03 needed the gateway to stamp `ai_prompt_version_id` on every `ai_request` and to
support system defaults (`organization_id is null`) plus org-custom overrides, without coupling
the storage-agnostic `@radar/ai` package to Supabase (same constraint as DB routes [[D-020]] and
scoring [[D-022]]). The 0012 ledger left `ai_requests.ai_prompt_version_id` as a nullable seam
([[D-021]]) for this task to harden.
Decision: Add a `resolvePrompt` seam to `AIService` (a `PromptResolver` returning the active
`ResolvedPrompt`); the core applies the resolved system prompt only when the caller didn't pass one
and stamps `aiPromptVersionId` onto every emitted record (success, fallback, and error). The DB
lives in `apps/api/src/modules/ai/ai-prompt.service.ts`: `resolveActivePrompt` reads
`ai_prompt_versions` (org-custom active row wins over the system default), and `AiProviderPoolService`
injects it at `AIService` construction. `0014_ai_prompt_versions.sql` adds the table (one active
version per scope, stable per-scope version numbers), `create_ai_prompt_version` /
`activate_ai_prompt_version` RPCs (org rows gated by `ai.settings.manage`; system rows
service-role only), the deferred FK on `ai_requests`, and a seeded generic system default for all
11 agents so resolution always yields a version.
Consequences: Every live AI call now references an auditable prompt version. The FK stays
`on delete set null` and the column nullable (embeddings/env-fallback may resolve nothing), so the
full not-null hardening from doc 04 waits until resolution is guaranteed for every path. Richer
per-agent prompts (e.g. the Opportunity Analyzer in P3-06) layer on as new active versions via the
RPCs rather than editing seeds, and the AI settings UI (P3-10) can drive the same RPC wrappers.

## [D-022] The heuristic scorer lives in `@radar/ai`, while the active org strategy is loaded lazily in the API layer — 2026-06-23 — status: accepted
Context: P3-05 needed a deterministic scoring baseline that future analyzer/worker code can reuse,
but the actual active strategy row lives in Supabase and should not couple the storage-agnostic
`@radar/ai` package directly to database access.
Decision: Put the pure weighted heuristic (`ScoringStrategy`, default weights, factor breakdowns)
in `packages/ai/src/scoring.ts`, and add `apps/api/src/modules/ai/scoring-strategy.service.ts`
to load the active `scoring_strategies` row from Supabase. The migration seeds defaults for
existing orgs, and the API service lazily creates the default heuristic row for any org that still
lacks one, so later analyzer code can just request the active org strategy without a separate
bootstrap path.
Consequences: Deterministic scoring stays reusable and offline-testable, while row lifecycle and
fallback creation remain a server concern like DB task routes and usage ledgers. P3-06 can focus
on the analyzer prompt/output shape and call this service directly instead of re-solving scoring
defaults or org-strategy storage.

## [D-021] `ai_requests` lands before prompt versioning, so the prompt-version link stays a nullable seam for now — 2026-06-23 — status: accepted
Context: P3-14 needed to ship the request log + usage ledger now, but P3-03 (`ai_prompt_versions`)
is already separately claimed and the prompt-version table/FK contract does not exist in the
current codebase yet.
Decision: Create `ai_requests` in `0012_ai_usage_ledger.sql` with an additive nullable
`ai_prompt_version_id uuid` column but no FK yet. Wire the live AI path (`AiUsageService`) to
persist request/usage rows, quotas, and counters immediately, while leaving the prompt-version
column to be backfilled and hardened by P3-03 when the gateway starts resolving/stamping prompt
versions on every call.
Consequences: P3-14 can ship without blocking on prompt-version work or colliding with the
separately claimed task. P3-03 must finish the job: add the real `ai_prompt_versions` table,
attach the FK, and tighten the not-null invariant once prompt resolution exists.

## [D-020] DB task routes override the in-code seeds at API service-construction time — 2026-06-23 — status: accepted
Context: P3-13 needed `ai_task_routes` to become the authoritative routing source without moving
Supabase access into `@radar/ai`, deleting the in-code defaults that already power offline tests,
or forcing later callers to remember to manually merge DB routes themselves.
Decision: Keep `packages/ai/src/routes.ts` as the seed/default fallback contract, but add
`apps/api/src/modules/ai/ai-routing.service.ts` in the thin API layer. It loads active
`ai_task_routes` rows from Supabase, maps them into `TaskRoute`, and `AiProviderPoolService`
injects those DB overrides into `new AIService(...)` when building the live service instance.
Explicit `options.routes` still win over DB rows for tests or one-off callers.
Consequences: Local/offline tests can still rely on the code defaults, while production callers get
Master-Admin-configurable routing without editing `@radar/ai`. Route loading remains a server-side
concern, and future health/privacy/quota logic can layer on top of the same API-side builder
without changing the core gateway package.

## [D-019] AI provider credentials resolve per call; the Supabase key pool stays outside `@radar/ai` — 2026-06-23 — status: accepted
Context: P3-12 needed a real provider-key pool (`ai_provider_accounts` + encrypted
`ai_api_keys`) without hard-coding one API key into each live adapter instance, forcing restarts
when keys change, or coupling the provider-agnostic `@radar/ai` package directly to Supabase.
Decision: Keep `@radar/ai` storage-agnostic, but extend the live adapters (Gemini/Groq/
OpenRouter) to accept an optional `resolveCredential(taskType)` callback. The new backend-side
`AiProviderPoolService` owns Supabase lookups, decrypts pooled keys with `ENCRYPTION_KEY`,
filters them by status/cooldown/task allowance/quota/account budget, and builds the live provider
set with pooled-key resolution plus env-key fallbacks for local/dev use. `AIService` and its
`hooks.onCall` seam now carry `apiKeyId`, `providerAccountId`, and `isFreeTier` metadata per call.
Consequences: New keys can be added or rotated in Supabase without changing domain code, and
tenant clients still never touch raw secrets. P3-14 can persist the selected key/account metadata
directly into `ai_requests` / `ai_usage_events` without redesigning the gateway. Health/rate-limit
routing decisions still belong to P3-13/P3-14.

## [D-018] Live AI provider adapters are HTTP-only, with an injectable `fetch` and a `buildLiveProviders` factory — 2026-06-23 — status: accepted
Context: P3-02 needed real Gemini/Groq/OpenRouter/Ollama adapters against the `AiProvider` contract
([[D-017]]) without (a) adding a vendor SDK per provider (CONVENTIONS "no new deps"), (b) pulling a
DOM lib into `packages/ai` just for `fetch` types, or (c) reaching into the DB-backed key pool /
provider accounts (P3-12), which don't exist yet.
Decision: Each adapter is a thin HTTP client over the vendor REST API using a shared
`packages/ai/src/providers/http.ts` helper (timeout via AbortController + normalized
`ProviderHttpError`, which the ModelRouter already treats as a fallback trigger). `fetch` is a
minimal injectable `FetchLike` (defaults to the global `fetch`, Node 18+) so adapters are unit-
tested offline with a fake fetch — no live keys, mirroring `FakeProvider`. Groq and OpenRouter share
one OpenAI-compatible `chat/completions` helper. Gemini + Ollama implement `embed`; Groq +
OpenRouter advertise `embed: false` and omit it. A pure `buildLiveProviders(config)` factory takes
already-resolved keys/URLs and returns the free-first provider list for `new AIService({ providers })`.
Consequences: Adapters have no SDK dependency and are fully testable without provider keys. The
factory consumes resolved credentials — the layer that pulls keys from `ai_api_keys` / env and wires
the `AIService` instance is still P3-12/P3-13/P3-14, and none of these calls are verifiable against
live provider APIs until those keys exist. If a vendor needs request features beyond plain
REST (streaming, tool calls), revisit the SDK-vs-HTTP choice for that provider deliberately.

## [D-017] Jest test harnesses in worker/extension/ai; AI gateway core seams — 2026-06-23 — status: accepted
Context: P2-12 (QA) and P3-01 (AI Gateway core) needed unit tests, but `apps/worker`, `extension`,
and `packages/ai` had no test runner (only `apps/api` did). The AI gateway also needs to be usable
and testable **offline** (no provider keys yet) and must keep the DB-backed key pool/usage ledger
(P3-12/14) out of the core.
Decision: Added jest + ts-jest to `apps/worker` and `packages/ai` (node env) and jest + ts-jest +
jest-environment-jsdom to `extension` (jsdom, for DOM parser/visible-only tests), each mirroring the
existing `apps/api` jest.config.cjs. `*.spec.ts` are excluded from the extension/ai `tsc` builds
(their tsconfigs use `types: []` / ship `dist`); the worker keeps specs in typecheck. The AI gateway
(`packages/ai`) is provider-agnostic with three seams so the DB/live layers plug in later without
touching the core: **routes** are injectable (`AIService({ routes })`, defaulting to in-code
free-first routes; `ai_task_routes` overrides at runtime — P3-13), a **`hooks.onCall`** event is the
attachment point for `ai_requests`/`ai_usage_events` (P3-14), and the **`AiProvider`** contract is
implemented by `FakeProvider` now and real adapters in P3-02.
Consequences: New AI/worker/extension code ships with tests. The gateway has no live-provider
dependency, so Phase-3 AI logic can be built and unit-tested before any key/quota wiring exists; the
real adapters + key pool + ledger persistence remain separate tasks.

## [D-016] The design-track primitive layer is AntD-backed, not a separate headless stack — 2026-06-23 — status: accepted
Context: The target frontend docs describe a headless/shadcn-style future direction, but the
shipped product is still an Ant Design application and the immediate need was to complete the
frontend design track without rewriting the app twice.
Decision: Implement the design-track primitive layer as reusable AntD-backed components inside
`apps/web/src/components/ui/` (`PageSection`, `MetricCard`, status tags, empty-state, settings save
bar) and use those as the current component contract. This closes the design track for the shipped
routes while still giving the broader rewrite a semantic layer to build on later.
Consequences: Future frontend work on the current app should extend the shared `components/ui`
layer rather than rebuilding page-local patterns. If the product later moves to a true headless UI
stack, these semantic contracts should map forward instead of being discarded.

## [D-015] The Chrome extension ships as plain MV3 TypeScript, not a separate bundler stack — 2026-06-23 — status: accepted
Context: Phase 2 required a real installable Chrome MV3 extension, but the repo had only a
placeholder `extension/` directory and no existing browser-extension build stack. Pulling in a new
bundler/framework layer just for the extension would increase setup and maintenance cost
disproportionately for a popup/options/content-script surface that is mostly straightforward DOM and
message-passing work.
Decision: Scaffold the extension as a plain workspace package with TypeScript-compiled ES modules,
static HTML/CSS assets, and a tiny copy step into `extension/dist`. Popup, options, background, and
content scripts are all framework-free. Shared runtime values are kept local to the extension; the
repo-level contracts package is used only for compile-time shape alignment.
Consequences: The extension is easy to load unpacked and easy to debug, but it deliberately avoids a
heavier component/runtime stack. If the extension grows into a much richer UI later, revisit the
packaging choice deliberately instead of accreting ad-hoc tooling.

## [D-014] The new design system ships through the existing AntD app first — 2026-06-23 — status: accepted
Context: `docs/architecture/13-design-system.md` defines a more ambitious target shell and
component direction, but replacing the live UI with a full new primitive library in one pass would
be high-risk and would slow delivery of the visible product refresh the user asked for.
Decision: Roll out the new Radar OIP visual system first through the existing tokenized Next.js +
Ant Design surface: update theme tokens, shared shell/layout, global styling, auth framing, and
the primary shipped screens. Keep the deeper primitive-library/component-contract work tracked
separately under `FD-02`, and treat the architecture-level `FD-03` shell target as only partially
complete until the remaining target surfaces are implemented.
Consequences: The app now matches the new direction visually without a disruptive rewrite, but some
target-state details in `13-design-system.md` are intentionally deferred. Future UI work should
extend the shared tokens/shell first and avoid reintroducing the older blue mission-control look.

## [D-013] `11-task-breakdown.md` now carries live task status and completion notes — 2026-06-23 — status: accepted
Context: The architecture task breakdown was useful for scope and sequencing, but it did not show
which tasks were already shipped, partially done, or still remaining. Agents had to cross-reference
`docs/agent/TASKS.md` and old worklog entries to understand roadmap progress.
Decision: Extend `docs/architecture/11-task-breakdown.md` so every task includes a `Status:` line
(`Remaining`, `Partially completed`, or `Completed`). Tasks that are partially/completely done can
also carry a short `Notes:` line that explains the shipped scope, known caveat, or handoff detail.
Consequences: `11-task-breakdown.md` is now a live roadmap view rather than a static planning doc.
When task status changes materially, update both the shared board and the detailed task breakdown so
high-level planning and execution tracking stay aligned.

## [D-012] Frontend docs now split current shipped UI from the next design direction — 2026-06-23 — status: accepted
Context: The shipped web app currently uses the Ant Design 6 interface documented in `docs/DESIGN.md`
and `docs/UIUX.md`, but the user requested a new dark, Supabase-inspired Radar OIP design direction
documented before any code rewrite. Replacing the implementation docs would falsely imply the
frontend had already migrated.
Decision: Keep the shipped UI docs as the source of truth for the current implementation, and add a
separate architecture-level target spec in `docs/architecture/13-design-system.md` plus updates to
`06-frontend-structure.md`, `FEATURE.md`, `10-roadmap.md`, and `11-task-breakdown.md`. The new docs
explicitly say they describe the **next** frontend pass, not the code that ships today.
Consequences: Future frontend work must state whether it is following the current AntD implementation
or the target design-system direction. The design-track tasks `FD-01` to `FD-05` should complete
before any broad visual rewrite of the shell or core screens.

## [D-011] Ant Design 6 is the web UI system (dark-only, token-driven) — 2026-06-23 — status: accepted
Context: The web app had grown a hand-rolled Tailwind + CSS-variable UI with native `<input>`,
`<select>`, `<button>` controls and ad-hoc colors per page. The user wants one polished, consistent,
outstanding dark UI built on Ant Design, with every interactive element coming from AntD (no browser
controls), a defined brand, and design/UX rules documented.
Decision: Adopt **Ant Design 6** as the single web UI system. Added deps `antd`,
`@ant-design/icons`, `@ant-design/nextjs-registry` (SSR style streaming via `AntdRegistry`), and
`dayjs` (AntD's date engine, imported directly so pnpm strict resolves it). A dark, token-driven
theme lives in `apps/web/src/theme/tokens.ts` (`theme.darkAlgorithm`, `cssVar`, brand + surface +
component tokens) and is applied through `ConfigProvider` + `App` in
`apps/web/src/components/providers.tsx`. Fonts are loaded via `next/font`: Inter (UI), Space Grotesk
(display/headings), JetBrains Mono (code). Brand = "Radar Blue" `#5E8BFF` primary on a deep
navy "mission-control" surface scale. The full system is documented in **`docs/DESIGN.md`** (visual)
and **`docs/UIUX.md`** (behavior); these are now required reading for any web work.
Consequences: All web UI uses AntD components — **never** native form controls or browser dropdowns
(`DESIGN.md §0`, `UIUX.md §11`). Colors/spacing/radius come from tokens, not inline hex. Tailwind is
**retained** only for lightweight layout utilities and the few raw-CSS spots (canvas gradient,
scrollbars, the inbox grid media query); it is not used for component styling. Feedback uses
`App.useApp()` (not the importable `message.*`). Supersedes the stale "Ant Design 6 + Vite +
react-router + src/pages" guidance in CONVENTIONS.md §Frontend (the app is Next.js App Router).

## [D-010] Capture CSV mapping preview is client-side and mirrors the worker aliases — 2026-06-23 — status: accepted
Context: P2-08 (capture UI) wants a "mapping preview" before import, but the `csvIngestionSchema`
contract carries no column-mapping field — the worker parses + aliases headers itself
(`apps/worker/src/processors/discovery-ingestion.ts` `FIELD_ALIASES`). Adding server-driven
mapping would mean changing the contract and worker, which is out of this FE task's scope.
Decision: The `/capture` CSV preview parses the file in the browser and reproduces the worker's
header→field alias matching for display only (`apps/web/src/lib/ingestion.ts`). The worker remains
the single source of truth for the real parse/normalize/dedup; the preview never sends a mapping.
Consequences: The alias list in `lib/ingestion.ts` must be kept in sync with the worker's
`FIELD_ALIASES` (both reference each other in comments). If we later want true operator-controlled
mapping, extend `csvIngestionSchema` + the worker and replace this preview-only mirror.

## [D-009] CSV imports use Supabase Storage signed uploads and a worker-side parser — 2026-06-23 — status: accepted
Context: P2-04 needed an object-store-backed CSV ingestion flow, but the repo's current
implementation is full-Supabase ([[D-006]]) and there was no separate S3 client or upload service
in place.
Decision: `/ingest/csv` now creates a signed upload target in the configured Supabase Storage
bucket (`DISCOVERY_IMPORTS_BUCKET`, default `discovery-imports`) and immediately enqueues the
`import-csv` job. The worker waits briefly for the uploaded object to appear, downloads it through
the service-role client, parses/normalizes rows, and inserts discoveries via the
`ingest_discovery_candidate(...)` SQL helper for exact-hash + pg_trgm fuzzy dedup.
Consequences: Local setup must include that Storage bucket before CSV imports will work. The API
does not proxy CSV bytes through NestJS, which keeps uploads off the app server and gives P2-08 a
stable backend contract to build on.

## [D-008] Company Brain versions are created through a dedicated Supabase RPC — 2026-06-23 — status: accepted
Context: The Company Brain is versioned, but direct web inserts/updates would make it easy to
produce race conditions, duplicate active rows, or hand-assigned version numbers when multiple
edits happen close together.
Decision: `company_profiles` is read directly under RLS, but new versions are created only via
`create_company_profile_version(...)` in `supabase/migrations/0007_company_brain.sql`. The RPC
locks the org row, increments the version atomically, deactivates the previous profile, and inserts
the new active row in one transaction.
Consequences: P2-02 can stay on the Supabase-first path (`supabase-js` + RLS) without introducing
another thin NestJS CRUD endpoint. Direct table writes should not be added from the browser for
Company Brain edits unless this invariant strategy changes deliberately.

## [D-007] `web start` always rebuilds from a clean `.next` — 2026-06-23 — status: accepted
Context: During P2-07 smoke testing, `pnpm --filter @radar/web start` was run after `next dev`.
Next reused a dev-mutated `.next` directory, and the production server then failed while trying
to load dev-only chunk names (for example `vendor-chunks/tr46@0.0.3.js`).
Decision: Added a `prestart` script in `apps/web/package.json` that deletes `.next` and runs
`next build` before `next start -p 3000`.
Consequences: `pnpm --filter @radar/web start` is slower, but it is now reliable for local smoke
tests even after a dev session. `next dev` remains the primary local development entrypoint.

## [D-006] Full Supabase: auth + database + RLS (drop Prisma & custom auth) — 2026-06-22 — status: accepted
Context: User has a Supabase project and chose to use it fully — "Full Supabase (auth + DB +
RLS)" — over the NestJS-owns-data design. Supersedes the auth/data-access parts of [[D-004]]
and the documented architecture (02/05/07/09 auth+data sections).
Decision:
- **Identity** = Supabase Auth (GoTrue). Web uses `@supabase/supabase-js`; the thin NestJS API
  verifies Supabase JWTs via `auth.getUser()`.
- **Database** = the Supabase Postgres, managed by **SQL migrations** in `supabase/migrations/`
  (Prisma removed). pgvector/pg_trgm/citext enabled there.
- **Access control** = Postgres **RLS** (`is_member()`, `has_permission()` SECURITY DEFINER
  helpers) — tenant isolation by membership; permission keys via role_permissions. The thin
  API/worker use the **service-role** key (bypasses RLS) and must check authz in code.
- **NestJS shrinks** to AI/jobs/webhooks (`apps/api` = auth guard + jobs + health; `apps/worker`
  = BullMQ). Org/member CRUD moves to the web via supabase-js + RLS + a `create_organization` RPC.
- Pinned `@supabase/supabase-js@2.45.4` (override) — newer postgrest-js generics reject
  hand-written `Database` types with `never`.
Consequences: Tighter Supabase coupling; data still exportable (it's our Postgres). Migrations
applied via Supabase CLI (`supabase db push`) or the SQL editor, NOT Prisma. The permission
catalog now lives in BOTH `packages/contracts/permissions.ts` and `supabase/migrations/0004_seed.sql`
— keep them in sync. ⚠️ Old project keys are leaked in git history — rotate before use (T-006).
Architecture docs 02/05/07/09 to be realigned (see `docs/architecture/13-supabase-integration.md`).

## [D-005] Delete legacy code; reuse this repo for greenfield Radar OIP — 2026-06-22 — status: accepted
Context: User wanted to keep the repo but "delete old and create new". The legacy LeadRadar
(Vite + Supabase) app conflicted with the Radar OIP stack.
Decision: Deleted `apps/web` (Vite), `apps/worker`, `packages/shared`, `supabase/`, legacy
product docs (`docs/SCOPE/ROADMAP/SETUP.md`), the old README, and `lead-notifier.yml`. Kept
git history, `docs/architecture/`, `docs/agent/`, `AGENTS.md`, `CLAUDE.md`, `.claude/`, LICENSE.
Renamed subagents `crm-frontend`→`web-frontend`, `supabase-backend`→`api-backend`.
Consequences: Old code remains recoverable in git history. ⚠️ The deleted README still exists
in history **with live Supabase secrets** — keys must be rotated (T-006).

## [D-004] CommonJS backend + a `packages/db` for the shared Prisma client — 2026-06-22 — status: superseded

> **Superseded by [D-006]**: We moved to full Supabase (packages/supabase) and dropped Prisma.
> The CommonJS backend decision still applies to `apps/api`.

Context: NestJS handles ESM poorly; trying to force `apps/api` to `type: module` breaks the
ecosystem.
Decision: `apps/api` and `apps/worker` stay `type: commonjs`. `packages/*` build to CJS/ESM. Web
stays ESM (Next.js/Vite). Added **`packages/supabase`** (was `packages/db` with Prisma) for shared
DB types.
Consequences: Shared packages must be **built to `dist`** before apps typecheck/run.

## [D-003] Redesign as Radar OIP on a new stack — 2026-06-22 — status: accepted
Context: User wants a production-grade, AI-powered Opportunity Intelligence Platform that
is explicitly NOT a CRM, built for SaaS scale with replaceable AI and full data ownership.
The brief mandates NestJS + Next.js + self-hosted PostgreSQL + Redis/BullMQ + Chrome MV3.
Decision: Treat as a greenfield design (codename **Radar OIP**) that supersedes the legacy
LeadRadar Vite/Supabase tracker. Full architecture documented in `docs/architecture/`
(01–11). Modular monolith (NestJS) with strict module boundaries, Worker via BullMQ,
pgvector for similarity, an AI Gateway abstraction, and a learning loop as the moat.
Consequences: New work follows `docs/architecture/`, not the legacy app shape. The legacy
`apps/web` (Vite/Supabase) stays until the new `apps/api` + `apps/web` (Next.js) skeleton
exists (Phase 1). Build order = the 6-phase roadmap; tasks tracked from
`docs/architecture/11-task-breakdown.md`.

## [D-002] Coexisting legacy + CRM status models — 2026-06-22 — status: accepted
Context: The app is migrating from a marketplace-job tracker to a lead CMS. Both
`LEAD_STATUSES` and `CRM_LEAD_PIPELINE_STATUSES` exist in `packages/shared/src/leads.ts`.
Decision: Keep both during Stage 1 for backfill safety; **new UI work targets the CRM
pipeline**. Legacy statuses stay until data is fully migrated.
Consequences: Don't delete `LEAD_STATUSES` yet. Map legacy → CRM where needed. Remove
legacy only in a dedicated cleanup task after backfill is confirmed.

## [D-001] Shared agent system via AGENTS.md + docs/agent/ — 2026-06-22 — status: accepted
Context: User wants multiple agents to work on the same path, sharing context through
docs so they stay aligned across sessions.
Decision: Single entry point `AGENTS.md` (mirrored by `CLAUDE.md` for auto-load),
live working docs under `docs/agent/` (CONTEXT, CONVENTIONS, TASKS, DECISIONS, WORKLOG),
and real invokable subagents under `.claude/agents/`. Agents follow a fixed READ → CLAIM
→ BUILD → VERIFY → LOG loop.
Consequences: Every agent must read the docs first and leave a WORKLOG breadcrumb.
The docs must be kept current as part of each task, or the system rots.

## D-037 — apps/web moves from Next.js to Vite + React Router (2026-06-25)
**Context:** The web app is a 100% client-rendered SPA (every file `'use client'`; 0 server
components/actions/route-handlers/middleware; auth via client Supabase; data via the standalone
NestJS API). Next.js App Router added SSR/hydration complexity (hydration mismatches, `/_not-found`
build flakes) with zero benefit for an internal authenticated CRM.
**Decision:** Migrate `apps/web` to Vite + React Router v6. The Next surface was tiny:
App Router file-routing + group layouts → `createBrowserRouter` with layout routes (`<Outlet/>`);
`next/navigation` → `useNavigate`/`useLocation`; `next/link` → react-router `Link`;
`next/font/google` → Google Fonts `<link>` + CSS vars; `process.env.NEXT_PUBLIC_*` →
`import.meta.env.VITE_*`; Tailwind v4 via `@tailwindcss/vite`; dropped `@ant-design/nextjs-registry`.
API/contracts/DB untouched.
**Why:** Faster dev/build, simpler static-bundle deploy, no SSR hydration class of bugs, matches the
stack the repo used pre-Next. Reverses the recent Next migration ([[D-…]] if logged).
**Trade-off:** Lose SSR/SEO/metadata — irrelevant for an internal authenticated tool.

## D-038 — Lead pipeline: RPC promote/close, one-live-lead-per-opportunity, knowledge_event deferred (2026-06-25)
**Context:** P5-01 promotes a qualified opportunity into an active `leads` row tracked through the
M9 stages, closing won/lost with a reason. The spec says close "emits knowledge_event", but the
`knowledge_events` substrate is Phase 7 (P7-01) and does not exist yet.
**Decision:** Mirror the P4-01 opportunity pattern — `leads` table (RLS `leads.read`/`leads.write`),
atomic `promote_opportunity_to_lead` + `close_lead` SECURITY DEFINER RPCs, in-pipeline stage moves
via plain supabase-js UPDATE under RLS. Enforce one live lead per opportunity with a partial unique
index (`opportunity_id where deleted_at is null`) plus an in-RPC guard. `close_lead` accepts only
`won`/`lost`, stamps `stage`/`close_reason`/`closed_at`; `on_hold` is a normal settable stage.
Defer the actual `knowledge_event` emission to P7-01 (records the outcome so it can hook/backfill).
**Why:** Consistency with the shipped opportunity engine; the outcome data is captured now so the
Phase 7 knowledge hook is additive.
**Trade-off:** Leads are not yet on the polymorphic activities/notes timeline (the
`relationship_node_type` enum has no `lead` member) — wiring that is a follow-up, not P5-01 scope.

## D-039 — Follow-up invariant enforced in the DB, not the app (2026-06-25)
**Context:** P5-02's core rule is "no active lead without an open task". It must hold regardless of
which client mutates tasks, and there is no scheduler substrate yet (Redis/BullMQ were removed in
P1-08-FIX; the Supabase queue has no cron).
**Decision:** Enforce the invariant in Postgres. (1) An `after insert or update of stage` trigger on
`leads` (`ensure_lead_follow_up`) auto-creates an initial open task whenever a lead is created or
re-enters an active stage and has none. (2) `complete_task`/`cancel_task` are SECURITY DEFINER RPCs
that reject closing the *last* open task on an active (non won/lost) lead unless an atomic follow-up
is supplied. (3) `active_leads_missing_open_task(org)` is a checker function the periodic guard job
(P5-06) will consume. Reschedule/reassign/create stay as direct supabase-js writes under RLS
(`tasks.manage` team / `tasks.manage_own` own) since they can't break the invariant.
**Why:** A DB-level invariant can't be bypassed by a buggy or alternate client; the app layer only
needs to surface the "supply a follow-up" affordance.
**Trade-off:** The scheduled checker job is not wired yet (no cron) — the function exists and is
covered by P5-06; until a scheduler lands, drift is only caught on the next write, not proactively.

## D-040 — Outreach (M11) reuses leads permissions + an atomic threading RPC (2026-06-25)
**Context:** P6-01 adds `conversations`, `outreach_messages`, `message_templates`. They need RLS and
a way to log messages into per-channel threads. The permission catalog has no `outreach.*` keys, and
`sales_executive` was just broadened to the team-level `leads.read`/`leads.write` (migration 0036).
**Decision:** Gate all three M11 tables on `leads.read` (select) / `leads.write` (insert/update/
delete) rather than adding new `outreach.*` permissions — outreach is part of working a lead/
opportunity, and this mirrors how the M13 timeline reused `opportunities.*` instead of minting
`activities.*`. Message logging goes through a SECURITY DEFINER `record_outreach_message` RPC that
finds-or-creates the conversation thread for `(org, channel, lead|opportunity)`, inserts the message,
and bumps `last_message_at` atomically. Conversation-summary edits and template CRUD are plain
RLS writes. AI provenance (`is_ai_generated`, `ai_request_id`) columns exist but are written by P6-02.
**Why:** Avoids permission-catalog/seed churn, keeps the migration additive, and matches established
precedent; the threading RPC keeps the conversation index consistent without client round-trips.
**Trade-off:** No dedicated `outreach.*` RBAC granularity yet (e.g. read-own vs team) — can be added
later if outreach needs to diverge from lead visibility. Channel-level dedup of conversations is
best-effort (most-recent thread per channel+entity), not enforced by a unique constraint.

## D-041 — Sales Assistant: pure agent + API writer threads conversations in code (not the RPC); ai_request_id deferred (2026-06-25)
**Context:** P6-02 generates message/follow-up/summary/meeting-prep/next-action and must persist
drafts to `outreach_messages` and summaries to `conversations`. The P6-01 `record_outreach_message`
RPC is SECURITY DEFINER and checks `auth.uid()`, but the API writer runs on the **service-role**
client (auth.uid() is null), so it can't call that RPC.
**Decision:** Split exactly like the analyzer/researcher: a pure `@radar/ai` `assistant.ts` (prompt
builders + lenient structured parsers + `generate*` via the governed gateway, golden-spec tested
offline) and an API `SalesAssistantService` writer. The writer does its own conversation threading in
TS (find-or-create the open conversation for `(org, channel, lead|opportunity)`, insert the draft
message with `is_ai_generated=true status='draft'`, bump `last_message_at`) rather than the user-bound
RPC — the controller enforces authz via `@RequirePermission('ai.use')`. Summaries update
`conversations.summary`; meeting-prep / next-action are advisory and returned, not stored. Endpoints
live under `POST /assistant/{draft-message,summarize,meeting-prep,next-action}`.
**Why:** Keeps the intelligence pure/testable and the persistence service-role-correct; reuses the
existing free-first task routes (`sales_message`/`follow_up_message`/`conversation_summary`/
`meeting_prep`/`next_action` were already seeded).
**Trade-off:** `outreach_messages.ai_request_id` is left null — the gateway's usage hook persists
`ai_requests` independently and the inserted id isn't plumbed back to the writer (same gap the
analyzer/planner have). Wiring provenance ids back is a follow-up. The TS threading duplicates the
RPC's find-or-create logic; if a third caller appears, extract a shared helper.

## D-049 — Lead-hunting governance lives in API read models + `organizations.settings.leadHunting` (2026-06-29)
**Context:** P10-09/10/11 needed operator pages, provider admin pages, review audit coverage, and
org-level lead-hunting controls, but the Phase 10 storage tables were intentionally write-owned by
service-role code and the earlier migrations did not add a dedicated settings table.
**Decision:** Keep the org-level governance surface lightweight and API-owned. The normalized
lead-hunting preferences/limits now live under `organizations.settings.leadHunting`, with the
server exposing curated read/update/report endpoints through `LeadHuntingOperationsService` rather
than asking the web client to stitch together raw `raw_posts` / `post_*` / `external_*` joins. The
same service enforces the configured research caps and approval-evidence guardrails before work
runs, while `ExternalProviderAdminService` exposes the platform-managed external-provider control
plane and writes audit-log rows for provider mutations.
**Why:** This keeps the frontend thin, lets the backend aggregate usage/limits/audit in one place,
and avoids adding another schema table purely to hold a handful of org settings before the product
proves which controls belong in the long-term model.
**Trade-off:** The settings live in JSON rather than a dedicated typed table, so SQL-level querying
of those preferences stays weaker for now; if Phase 10 grows more policy fields or needs DB-native
analytics on them, a dedicated table can be added later without changing the operator UI contract.

## D-052 — External provider cost intelligence reuses the existing admin page + notification substrate (2026-06-30)
**Context:** P10-13 needed a much larger control-plane surface (plans, pooled key capacity,
snapshots, forecasts, alerts, tests, reconciliation) plus operator-visible notifications, but the
product already had a live `/admin/external-providers` route and a generic in-app notifications
feed.
**Decision:** Keep the human-facing route stable at `/admin/external-providers`, move the thin API
surface to a consolidated `/admin/external/*` namespace, and fan external-provider alert events
into the existing `notifications` table as `type='general'` entries rather than inventing a second
alert transport. The backend remains the single source of truth: `ExternalProviderAdminService`
handles CRUD/control-plane writes, `ExternalProviderIntelligenceService` owns snapshots/alerts/
reconciliation, and the worker triggers reset + sync loops on schedule.
**Why:** This avoids splintering the control plane into multiple half-overlapping pages or feeds,
keeps the UI upgrade additive on top of the shipped Phase 10 admin surface, and lets provider-alert
signals show up in the same bell/feed operators already use.
**Trade-off:** Provider alerts are stored under the generic notification type until the product
needs first-class alert taxonomies or per-alert preferences; the API namespace and page route no
longer mirror each other 1:1, so future work should treat the route as UX-stable and the API as an
internal thin-service boundary.
