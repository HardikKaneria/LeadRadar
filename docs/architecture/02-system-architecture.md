# 02 — System Architecture

## 2.1 Topology (logical)

```
                         ┌──────────────────────────────┐
                         │        Chrome Extension       │
                         │      (MV3, human-assisted)    │
                         └───────────────┬──────────────┘
                                         │ capture (visible DOM only)
                                         ▼
┌──────────────┐   HTTPS   ┌──────────────────────────────────────────┐
│  Next.js Web │◀─────────▶│                API (NestJS)                │
│  (App Router)│   REST    │   Modular monolith, strict boundaries      │
└──────────────┘           │  Auth · Org · Ingestion · Discovery ·      │
                           │  Opportunity · Lead · Task · AI Gateway ·  │
                           │  Knowledge · Learning · Integrations       │
                           └───┬───────────────┬───────────────┬───────┘
                               │               │               │
                   enqueue jobs│        read/write             │ AI calls
                               ▼               ▼               ▼
                       ┌─────────────┐  ┌─────────────┐  ┌──────────────┐
                       │ Redis +     │  │ PostgreSQL  │  │  AI Gateway  │
                       │ BullMQ      │  │ + pgvector  │  │ (abstraction)│
                       │ (queue/cache)│ │ (system of  │  └──────┬───────┘
                       └──────┬──────┘  │  record)    │         │
                              │         └─────────────┘   ┌─────┴──────┬─────────┐
                              ▼                            ▼            ▼         ▼
                       ┌─────────────┐                  Groq        Gemini    Ollama
                       │  Worker     │                 (cloud)     (cloud)   (local/OSS)
                       │ (NestJS +   │
                       │  BullMQ     │   ┌─────────────┐
                       │  processors)│──▶│ Object store│  (proposals, raw HTML snapshots,
                       └─────────────┘   │ (S3-compat) │   CSV uploads, attachments)
                                         └─────────────┘
```

## 2.2 Components

| Component | Tech | Responsibility |
|-----------|------|----------------|
| **Web App** | Next.js (App Router), TypeScript, Tailwind | The Action Center, Inbox, Opportunities, Pipeline, Knowledge, settings. SSR for first paint, client for interactivity. |
| **API** | NestJS (REST, OpenAPI) | All business logic. Modular monolith with hard module boundaries. Stateless; horizontally scalable. |
| **Worker** | NestJS standalone + BullMQ processors | Async work: AI analysis, company research, scoring, enrichment, learning recompute, digest generation. Shares the domain modules with the API. |
| **PostgreSQL** | Postgres 16 + `pgvector` | Single system of record. Owns raw captures, analyses, opportunities, outcomes, embeddings. |
| **Redis** | Redis | BullMQ broker, cache, rate-limit buckets, idempotency keys. |
| **AI Gateway** | In-process module (extractable) | Provider-agnostic LLM/embeddings access, retries, fallback, cost tracking, prompt registry. |
| **Extension** | Chrome MV3 | Human-triggered capture of visible search results; ships raw payloads to ingestion. |
| **Object Store** | S3-compatible (e.g. R2/MinIO) | Large blobs: raw HTML snapshots, CSV imports, generated proposals, attachments. |

## 2.3 Why a modular monolith (not microservices yet)

- One deployable, one DB, one transaction boundary → fast iteration, no distributed-data
  pain while the domain is still moving.
- **Strict module boundaries** (each NestJS module exposes a service interface; no
  cross-module table reads) mean any module — AI Gateway, Discovery, Learning — can be
  lifted into its own service later by swapping an in-process call for an RPC call.
- The Worker is already a separate process sharing the same modules, so the async/sync
  split exists from day one.

## 2.4 End-to-end data flow

**Ingest → Analyze → Approve → Act → Learn**

1. **Capture.** Extension (visible results), Manual entry form, or CSV import POST to the
   **Ingestion API**. Payload is validated and stored verbatim as `discoveries`
   (+ optional raw blob in object store). A `discovery_batch` groups one capture/import.
   Status = `new`.
2. **Analyze (async).** Ingestion enqueues an `analyze-discovery` job. The Worker runs the
   **Opportunity Analyzer** agent via the AI Gateway → writes `ai_analysis` (score, intent,
   service_match, budget, urgency, confidence, recommended_action, reason) and an embedding.
   Discovery status → `analyzed`.
3. **Review.** The discovery surfaces in the **Discovery Inbox**, filtered/sorted by score.
   A human reviews → `reviewed`, then **approves** or **ignores**.
4. **Promote.** Approval (AI score ≥ org threshold **AND** human approval) creates an
   **opportunity**, upserts a `company` + `contact`, and links the source discovery.
   Discovery status → `converted`.
5. **Act.** The opportunity carries a **next best action** (Action Planner agent). The user
   starts outreach → a **lead** enters the pipeline. **No active lead without a next action**
   (enforced: every lead requires an open `task`).
6. **Assist.** The **AI Sales Assistant** drafts messages, follow-ups, proposals, summaries
   on demand inside the opportunity/lead.
7. **Outcome.** Lead reaches `won`/`lost` → a `knowledge_event` records the outcome, reason,
   value, and the opportunity's features.
8. **Learn (async).** The **Learning Engine** periodically aggregates `knowledge_events`,
   recomputes scoring weights / similarity clusters, and updates the active scoring strategy.
   Future analyses score similar opportunities more accurately. Loop closes.

## 2.5 Cross-cutting concerns

- **Multi-tenancy.** Every domain row has `organization_id`. Enforced at the repository
  layer via a request-scoped tenant context (and optionally Postgres RLS as defense-in-depth).
- **AuthN/AuthZ.** JWT access + refresh tokens; permission-based RBAC. System roles
  `master_admin` (platform operator, `platform_admins`), `company_admin`, and `sales_executive`
  (the primary daily user) + future/custom roles — see
  [15 · Roles & Permissions](./15-roles-permissions-and-admin-system.md). Extension and API use
  scoped tokens. Service-to-service uses signed internal tokens.
- **Idempotency.** Ingestion endpoints accept an idempotency key (dedupe re-captures);
  jobs are idempotent and safe to retry.
- **Job tracking.** Every async operation mirrors into a `job_runs` row (status, progress,
  result/error), exposed via the Job Status API (`/jobs`) and the UI Job Monitor.
- **Billing & usage metering.** A usage meter increments `usage_limits` per org (ai_tokens,
  ai_cost_usd, discovery_items, extension_batches, seats, storage, active_leads,
  proposal_generations) and enforces plan caps with graceful degradation.
- **Observability.** Structured logs, request tracing (OpenTelemetry), BullMQ dashboards,
  AI cost/latency metrics per provider and per agent.
- **Auditability.** `activities` (domain timeline) + an append-only `audit_log` (who changed
  what). AI calls fully recorded in `ai_requests`.
- **Config & secrets.** Per-environment config; secrets in a vault/secret manager, never in
  the repo. The **platform AI key pool** (`ai_api_keys`) and org BYOK keys are encrypted at rest
  and never returned by any API — see [14](./14-ai-provider-and-usage-system.md).
- **Rate limiting & cost control.** Token buckets in Redis per org and per provider; hard
  monthly AI spend caps with graceful degradation (queue/delay rather than fail).

## 2.6 Scaling path

- API and Worker scale horizontally (stateless). Queues absorb spikes from bulk captures/imports.
- Postgres: read replicas for reporting/heat-score queries; partition high-volume tables
  (`discoveries`, `ai_requests`, `activities`) by month when needed.
- Hot AI paths (Opportunity Analyzer) can move to a dedicated worker pool / autoscaling.
- pgvector handles similarity at small/medium scale; swap to a dedicated vector DB only if
  volume demands it (interface already abstracted).
- Module extraction order if/when needed: **AI Gateway** → **Discovery/Ingestion** →
  **Learning Engine**.
