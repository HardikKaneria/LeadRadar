# 10 — Development Roadmap

Ten phases. Each is shippable and de-risks the next. Don't start a phase until its
predecessor's "Definition of done" holds. Detailed tasks: [11-task-breakdown](./11-task-breakdown.md).

```
P1 Foundation ─▶ P2 Discovery ─▶ P3 AI Intelligence ─▶ P4 Opportunity Mgmt ─▶ P5 Lead Pipeline & Follow-up
   └▶ P6 AI Sales Assistant ─▶ P7 Knowledge Engine ─▶ P8 Learning Engine ─▶ P9 Advanced Intelligence ─▶ P10 Lead Hunting Research Pipeline
```

Every phase carries **QA tasks** (see doc 11) — testing is not a separate phase, it ships
with each one. Cross-cutting platform capabilities (Job Status, Notifications, Billing/Usage)
are introduced where they first add value and hardened in later phases.

---

## Frontend design track (before a major UI rewrite)

**Goal:** lock the Radar OIP dark SaaS design language before broad frontend implementation changes.
**Includes:** design-system foundation, component-library primitives, app-shell refresh, key-screen
wireframes, and accessibility/UI QA.
**Definition of done:** the team has an approved design-system spec, shell/layout contract, key-screen
wireframes, and an explicit QA checklist before rewriting Action Center, Opportunity, Pipeline,
Knowledge, or Settings surfaces.
**Outputs:** [`13-design-system.md`](./13-design-system.md), updated frontend architecture docs, and
the `FD-01` to `FD-05` implementation tasks in [`11-task-breakdown.md`](./11-task-breakdown.md).
**Why this exists:** the product direction changed faster than the shipped web UI. This track keeps the
next frontend pass intentional instead of allowing a page-by-page visual drift.

---

## Phase 1 · Foundation
**Goal:** production-grade, multi-tenant, secure skeleton — nothing smart yet, but deployable.
**Includes:** monorepo + workspaces; NestJS API; Supabase (Postgres + Auth + RLS); base migrations;
Postgres-backed queue (SupabaseQueueService); **RBAC (roles/permissions/role_permissions)** with system roles; auth + org +
tenant context; **job_runs + Job Status API skeleton**; Next.js app shell + auth; CI/CD;
observability; `packages/contracts` + `core`.
**Definition of done:** a user can register, create an org, invite a teammate with a role, log
in, and see an empty authenticated shell; API is tenant-isolated, RBAC-gated, and audited; one
job runs end-to-end and is visible in `/jobs`.
**Key modules:** auth, org, rbac, core, job-runs, audit, activity.
**Milestone proof (M0):** auth + empty shell deployed; permission-gated route demonstrably blocks.

## Phase 2 · Discovery Engine
**Goal:** every channel gets raw data in. **Store raw first.**
**Includes:** Company Brain (M1, incl. outreach tone); ingestion (extension/manual/CSV) with
idempotency + dedup + **full source enum**; discoveries + batches; Discovery Inbox (filters,
statuses, bulk triage); **Chrome MV3 extension** (human-assisted capture) + `extension_tokens`;
CSV import + extension batch jobs tracked in `job_runs`.
**Definition of done:** user captures from LinkedIn/Upwork via the extension, enters manual leads
from any source, imports a CSV — all land in the Inbox, filterable, raw payloads preserved; import
progress visible in the Job Monitor.
**Key modules:** company-brain, ingestion, discovery, integration (extension tokens), job-runs.
**Milestone proof (M1):** Inbox full of captured/manual/CSV discoveries across multiple sources.

## Phase 3 · AI Intelligence
**Goal:** make discoveries smart. **Keep AI replaceable and free-first.**
**Includes:** AI Gateway (M4) — single entry `AIService.generate(taskType,…)`, **free-first**
router (Gemini→Groq→OpenRouter; no Claude default); the **M15 provider key pool** (`ai_provider_accounts`,
`ai_api_keys`, `ai_task_routes`, `ai_model_catalog`, health/rate-limit events); the **usage ledger**
(`ai_usage_events`) + quotas/credits (`company_usage_limits`, `usage_credit_grants`); **privacy mode**
(default `redact_pii_before_ai`); **`ai_prompt_versions`** (auditable); Opportunity Analyzer + Company
Research + Action Planner agents (M5) → `ai_analysis`; embeddings; v1 heuristic scoring; analysis/
research/embedding jobs in `job_runs`; `ai_analysis_done` notifications.
**Definition of done:** a captured discovery is auto-analyzed (async) with score, intent, service
match, budget, urgency, confidence, recommended action, and a human-readable reason; every call
references a prompt version, is metered into the usage ledger, and is cost/quota-tracked; swapping
providers/models is a config change; PII is redacted before free-API calls.
**Key modules:** ai-gateway, M15 ai-provider-usage, ai-prompts, ai-intelligence, learning (v1), notification, job-runs.
**Milestone proof (M2):** auto-scored discoveries with reasons; provider swap demonstrated; usage ledger + quota enforcement working.

## Phase 4 · Opportunity Management
**Goal:** turn intelligence into approved, prioritized opportunities.
**Includes:** approval → Opportunity Engine (M6, threshold + human approval) with
`opportunity_status` + `priority` enums; company/contact graph (M7) + **relationship_edges**;
**Daily Action Center** (M8); basic heat score; activities/notes (M13); attachments.
**Definition of done:** approve a discovery → it becomes an opportunity with explanation, status,
priority, and next action; the home screen tells the user what to do today; companies/contacts are
deduped and graphed.
**Key modules:** opportunity, company-graph, action-center, activity, attachment.
**Milestone proof (M3):** approve → opportunity with explanation on the Action Center.

## Phase 5 · Lead Pipeline & Follow-Up Intelligence
**Goal:** drive opportunities into a disciplined, never-stale pipeline.
**Includes:** Lead Pipeline (M9, full stages); promote opportunity → lead; Follow-up Intelligence
(M10) enforcing **no active lead without an open task**; task queues (overdue/today/upcoming/
assigned); stale-lead detection; `follow_up_due/overdue`, `lead_stale` notifications.
**Definition of done:** start outreach → a lead exists with an enforced follow-up task; queues show
overdue/today; advancing a lead without an open task is blocked.
**Key modules:** lead, task, notification, action-center.
**Milestone proof (M4):** lead with enforced follow-up; stage-guard blocks advance without a task.

## Phase 6 · AI Sales Assistant
**Goal:** generate and remember outreach.
**Includes:** AI Sales Assistant (M11) — message/follow-up/summarize/meeting-prep/next-action;
**outreach_messages + conversations + message_templates**; **Proposal Generator** (`proposals` +
`attachments`, lifecycle) via `generate-proposal` job; `proposal_ready` notifications.
**Definition of done:** inside an opportunity/lead the assistant drafts messages and proposals; every
message is stored and threaded; proposals move through draft→sent→accepted/rejected; generation runs
are visible in the Job Monitor.
**Key modules:** sales-assistant, outreach, proposal, ai-gateway, notification.
**Milestone proof:** AI-drafted message persisted to a conversation; proposal generated + stored.

## Phase 7 · Knowledge Engine
**Goal:** capture what happened and why, by source and service.
**Includes:** `knowledge_events` on every outcome (won/lost/on_hold/no_response/outreach/reply);
Knowledge insights — conversion by service/country/source, win/loss reasons, source performance;
`weekly_insight` notifications. (Capture wired early in P5/P6 so data accrues.)
**Definition of done:** closing a deal writes a knowledge event with a feature snapshot; the Knowledge
screen shows what converts by source and service.
**Key modules:** knowledge, notification.
**Milestone proof:** Knowledge screen live with conversion-by-source/service.

## Phase 8 · Learning Engine
**Goal:** the compounding moat — scoring that improves from outcomes.
**Includes:** Learning Engine recompute (`recompute-scoring` job) aggregating knowledge_events →
scoring strategy **v2 (statistical)**; published active strategy per org; recompute visible in jobs.
**Definition of done:** closing deals visibly shifts future scores for similar opportunities; a new
active `scoring_strategy` is produced and explains its weights.
**Key modules:** learning, knowledge, ai-intelligence.
**Milestone proof (M5):** outcomes change future scores; e.g. "WooCommerce/USA" 70 → 90.

## Phase 9 · Advanced Intelligence Features
**Goal:** the differentiating intelligence layer + SaaS hardening.
**Includes:** heat & expiry recompute (scheduled); similar-opportunity finder; opportunity
clustering; demand radar; lead resurrection; revenue forecasting; scoring **v3 (ML/embeddings)**
groundwork; **Billing & Usage** (plans/subscriptions/usage_limits/billing_events) + limit
enforcement; the **Master Admin area** (M14 `/admin/*`: companies, users, AI providers/keys/routing,
global usage, jobs, billing/revenue, audit, system health, audited support access); **role-based
dashboards** (Company Admin & Sales Executive homepages); full Notifications/digest; queue scaling,
partitioning, performance pass.
**Definition of done:** the system proactively surfaces urgent/expiring opportunities and revivable
leads on schedule; forecast and demand radar are live; billing enforces plan limits with graceful
degradation; the Master Admin can operate the platform end to end.
**Key modules:** M14 platform-admin, M15 ai-provider-usage, learning, knowledge, opportunity, notification, billing, integration, platform-infra.
**Milestone proof (M6):** demand radar + forecast live; plan-limit enforcement demonstrated.

## Phase 10 · Lead Hunting Research Pipeline
**Goal:** turn manual LinkedIn searching into a disciplined, evidence-backed lead-hunting workflow
that researches every unique captured post before deciding whether it belongs in CRM or in the
intelligence archive.
**Includes:** M16 storage (`lead_search_sessions`, `raw_posts`, research jobs/reports,
classifications, archived posts, evidence logs); LinkedIn visible-post capture v2 in the
extension; dedup + research enqueue; an external research-provider pool and routes; full-funnel
research resolvers (person, company, website, email, management, country); AI classification and
archive routing; lead-hunting operator UI + provider admin UI; RBAC/limits/audit; qualified-post
handoff into Discovery Inbox / Opportunity / Lead workflow.
**Definition of done:** a Sales Executive can search LinkedIn normally, capture only visible posts,
review the batch, send it to Radar, and trust that every unique post is stored raw, fully
researched with confidence + evidence, and then classified into qualified / needs-review / archive /
reject. Provider keys stay platform-managed and auditable, qualified items enter the existing
approval flow, and informational items remain queryable as market intelligence.
**Key modules:** M16 lead-hunting, M15 provider-usage, M2 discovery, M4/M5 AI, M6 opportunity, M9
lead pipeline, extension, billing, audit.
**Milestone proof (M7):** capture one visible LinkedIn results page, auto-research every unique
post, surface one qualified item in the Inbox, and retain one non-qualified item in the archive
with its evidence trail.

---

## Sequencing & parallelization

- P1 is mostly serial (foundation). After it, **frontend and backend tracks run in parallel**
  within each phase (the `[FE]` web-frontend and `[BE]` api-backend owners).
- The **frontend design track** (`FD-01` to `FD-05`) should complete before any broad visual rewrite
  of the shell, Action Center, Opportunities, Pipeline, Knowledge, or Settings surfaces.
- The **extension** (P2) and **AI Gateway** (P3) are independent once `packages/contracts` is
  fixed in P1.
- **knowledge_events capture** is wired in P5/P6 so the Learning Engine (P8) has real data.
- **Billing/Usage metering hooks** are added cheaply in P3 (AI cost) and P5 (seats/leads), then
  the full billing surface lands in P9.
- **Phase 10** intentionally lands after P9 because it reuses the shipped extension, discovery,
  AI/provider-governance, billing, admin, and lead-pipeline foundations instead of creating a
  parallel lead-hunting subsystem.

## Milestones

| Milestone | Phase | Proof |
|-----------|-------|-------|
| M0 Skeleton live | P1 | Auth + empty shell deployed; RBAC blocks a route |
| M1 Data flowing | P2 | Inbox full of multi-source discoveries |
| M2 It's smart | P3 | Auto-scored discoveries with reasons + prompt versioning |
| M3 It prioritizes | P4 | Action Center shows what to do today |
| M4 It won't go stale | P5 | Enforced follow-ups + stage guard |
| M5 It learns | P8 | Outcomes change future scores |
| M6 It runs itself | P9 | Digests, expiry, resurrection, forecast, billing limits |
| M7 It hunts with evidence | P10 | Visible-post capture flows into research, archive, and Inbox |
