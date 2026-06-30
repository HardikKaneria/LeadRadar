# 07 — Backend Architecture

**Stack:** NestJS · TypeScript · Supabase (PostgreSQL, Auth, RLS) · `pgvector` ·
class-validator/zod DTOs · Pino logging.

> Data choice: **Supabase** handles auth, Postgres, and Row Level Security. We use the
> auto-generated TypeScript definitions (`packages/supabase`) instead of an ORM like Prisma.

## Modular monolith — single process, shared modules

```
apps/
├── api/         # HTTP entrypoint (controllers) + in-process WorkerModule — imports domain modules
packages/
├── contracts/   # shared DTOs, enums, OpenAPI types (web + extension + api)
├── core/        # cross-cutting: config, logging, errors, tenant-context, RBAC, base repo
└── ai/          # AI Gateway (provider adapters, prompt registry) — extractable
```

API and Worker are thin entrypoints; **all logic lives in domain modules** so both
processes reuse it.

## Domain module layout (every module identical shape)

```
src/modules/<module>/
├── <module>.module.ts          # Nest module wiring
├── <module>.controller.ts      # HTTP (api only)
├── <module>.service.ts         # business logic — the public interface
├── <module>.repository.ts      # data access (org-scoped, the ONLY table access)
├── <module>.processor.ts       # BullMQ consumer (worker only, if async) → writes job_runs
├── dto/                        # request/response DTOs (from packages/contracts)
├── events/                     # domain events emitted
└── <module>.spec.ts            # unit tests
```

**Boundary rule:** a module's repository touches only its own tables. Need another
module's data? Call that module's **service**. This keeps extraction to a service later a
one-line transport swap.

## Module inventory (maps to [03-module-breakdown](./03-module-breakdown.md))

```
src/modules/
├── auth/            # JWT, refresh, guards
├── org/             # organizations, memberships, settings, invites
├── rbac/            # roles, permissions, role_permissions; PermissionGuard + @RequirePermission
├── company-brain/   # M1 company_profiles (versioned, outreach tone)
├── ingestion/       # M2 capture/manual/csv → discoveries (idempotency, dedup)
├── discovery/       # M2/M3 inbox read, status transitions, approve
├── ai-gateway/      # M4 provider abstraction (in packages/ai), ai_requests
├── ai-prompts/      # M4 ai_prompt_versions CRUD + activation (system + org custom)
├── ai-intelligence/ # M5 agents (analyzer, research, planner) → ai_analysis
├── opportunity/     # M6 promotion, status, heat, expiry
├── company-graph/   # M7 companies, contacts, relationship_edges, merge
├── action-center/   # M8 today read-model
├── lead/            # M9 pipeline + stage guards
├── task/            # M10 follow-up intelligence, queues, invariant checks
├── sales-assistant/ # M11 generation endpoints
├── outreach/        # M11 outreach_messages, conversations, message_templates
├── proposal/        # M11 proposals + attachment linkage
├── knowledge/       # M12 events + insights + forecast + demand radar
├── learning/        # M12 scoring strategies, recompute jobs
├── activity/        # M13 activities, notes
├── attachment/      # polymorphic file storage (object store)
├── audit/           # M13 append-only audit log
├── notification/    # notifications + notification_preferences + digest
├── job-runs/        # job status tracking (mirrors every async run)
├── integration/     # integration_accounts, extension_tokens, webhooks, csv jobs
└── billing/         # plans, subscriptions, usage_limits, billing_events, metering
```

## Cross-cutting (`packages/core`)

- **TenantContext** — request-scoped `organization_id` + `user_id`; injected into every
  repository so tenant isolation is automatic.
- **BaseRepository** — applies `organization_id`, soft-delete (`deleted_at`), `updated_at`,
  stamps `created_by`.
- **RBAC** — `PermissionGuard` + `@RequirePermission('discoveries.approve')`; resolves the
  member's role → role_permissions → permission keys (cached in Redis).
- **Config** — typed env loader; per-env; secrets from a vault/secret manager.
- **Errors** — domain error hierarchy → RFC-7807 responses.
- **EventBus** — in-process domain events (`LeadWon`, `DiscoveryApproved`, `ProposalSent`)
  fanning out to activity logging, knowledge capture, notifications, usage metering.
- **Idempotency** — Redis-backed store for ingestion/mutation keys.
- **UsageMeter** — increments `usage_limits` and enforces plan caps (used by AI Gateway,
  ingestion, proposals, seats).

## Async work — Queues + Job Runs

Every async operation creates a **`job_runs`** row and updates its `status`/`progress`
as the processor runs, so the Job Status API (`/jobs`, `/jobs/:id`, `/jobs/:id/logs`,
`/jobs/:id/cancel`) and UI Job Monitor have full visibility.

| Queue | Trigger | Consumer module | job_name |
|-------|---------|-----------------|----------|
| `analyze-discovery` | discovery created | ai-intelligence | AI analysis |
| `generate-embedding` | discovery/knowledge created | ai-intelligence | embedding |
| `research-company` | opportunity created / manual | company-graph | company research |
| `plan-actions` | discovery analyzed | ai-intelligence | action planning |
| `recompute-heat` | opportunity events / cron | opportunity | heat recompute |
| `recompute-scoring` | cron / outcome threshold | learning | scoring recompute |
| `import-csv` | csv upload | ingestion | CSV import |
| `process-extension-batch` | extension capture | ingestion | extension batch |
| `generate-proposal` | assistant request | proposal | proposal generation |
| `build-digest` | daily cron | notification | digest generation |

Jobs are **idempotent**, retried with backoff (`status=retrying`), dead-lettered on
repeated failure (`status=failed`), and cancellable (`status=cancelled`).

## AI prompt versioning (real & auditable)

- `ai-prompts` module owns `ai_prompt_versions`. System defaults have `organization_id = null`;
  orgs can fork org-specific versions.
- The AI Gateway resolves the **active** prompt version per agent at call time, records
  `ai_prompt_version_id` on every `ai_request`, and `ai_analysis` stores the version used.
  This makes every AI output reproducible and auditable.

## Security & tenancy

- Guards: `JwtAuthGuard` → `OrgGuard` (membership) → `PermissionGuard` (RBAC keys).
- Repository enforces `organization_id`; optional Postgres RLS as defense-in-depth.
- Per-org credentials (AI keys, integrations) encrypted at rest (KMS/`pgcrypto`) in
  `integration_accounts.encrypted_credentials`; extension uses hashed scoped tokens.
- Rate limiting + AI spend caps (Redis token buckets) per org + per provider; degrade by
  queueing, not failing.
- All sensitive mutations → `audit_log`.

## Testing & QA (categories enforced in CI)

| Category | Scope |
|----------|-------|
| **Unit** | Services, scoring strategy, pure helpers. |
| **Integration** | Each module against a Postgres testcontainer (+ Redis). |
| **API contract** | Generated OpenAPI client vs. live controllers. |
| **Tenant isolation** | Cross-org access attempts must fail for every resource. |
| **RBAC permission** | Each route enforces its permission key; role→permission resolution. |
| **Role access** | master_admin / company_admin / sales_executive each reach only their allowed surfaces; Sales Executive is blocked from keys/routing/platform cost/other companies. |
| **AI provider routing** | Router picks the correct provider/model per task type; fallback chain; deterministic-first paths use no model. |
| **AI key pool** | Key eligibility by task type / status / cooldown / quota; cooldown + revoke behavior; secrets never returned. |
| **AI usage ledger** | Every billable call writes `ai_usage_events`; `ai_requests` vs ledger kept distinct; counters update. |
| **AI quota / limit** | `company_usage_limits` enforced (soft-degrade + warning); credits applied. |
| **AI PII redaction** | `redact_pii_before_ai` strips PII before free-API calls; only redacted refs stored. |
| **AI golden response** | Agents vs. recorded fixtures (no live model calls in CI). |
| **AI schema validation** | Structured outputs validate against `output_schema`; repair path. |
| **Extension parser** | Per-site parsers vs. saved DOM snapshots. |
| **Extension visible-only** | Capture never reads beyond rendered/visible nodes. |
| **CSV import** | Mapping, dedup, malformed rows, large files. |
| **Queue retry** | Idempotency + backoff + dead-letter behavior. |
| **Job status** | `job_runs` lifecycle (queued→running→completed/failed/cancelled/retrying). |
| **Billing usage limit** | Metering increments + cap enforcement + graceful degradation. |
| **Data lifecycle** | Soft/hard delete, retention, export, org/user deletion (see doc 12). |

AI adapters are tested against a **fake provider** + golden prompt/response fixtures so the
suite never calls a live model. See per-phase QA tasks in
[11-task-breakdown](./11-task-breakdown.md).
