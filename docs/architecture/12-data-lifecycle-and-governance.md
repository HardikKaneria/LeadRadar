# 12 — Data Lifecycle & Governance

Radar OIP's promise is **data ownership** — everything lives in *our* PostgreSQL and the
org controls it. This document defines how data is retained, protected, deleted, exported,
and isolated. It is the contract behind the security/governance settings
(`/settings/security`, `/settings/audit`).

---

## Principles

1. **The org owns its data.** No vendor lock-in; everything is exportable.
2. **Store raw first, interpret later** — raw captures are kept so analyses can be re-run.
3. **Minimize PII in AI prompts** and redact it in stored AI request refs.
4. **Recoverable by default, permanently deletable on request** (soft → hard delete).
5. **Tenant isolation is non-negotiable** — every row is org-scoped.
6. **Everything sensitive is audited.**

---

## Retention policies (defaults — overridable per plan/org)

| Data | Default retention | Notes |
|------|-------------------|-------|
| **Raw capture** (`discoveries.raw_payload`, raw blobs) | 180 days hot, then archived | Kept to enable re-analysis; archivable to cold storage. |
| **AI requests** (`ai_requests`) | 90 days detailed, aggregates kept | Cost/audit; input refs redacted. |
| **AI analyses** (`ai_analysis`) | Lifetime of the discovery | Stores prompt version for reproducibility. |
| **Attachments** (`attachments`) | Lifetime of parent entity | Object store; soft delete then purge. |
| **Outreach / conversations** | Lifetime of lead + 1 year | Engagement history; export on request. |
| **Knowledge events** | Retained (the moat) | Anonymizable but kept for learning. |
| **Audit log** (`audit_log`) | ≥ 1 year (compliance) | Append-only; never edited. |
| **Job runs** (`job_runs`) | 30–90 days | Operational; partitioned by month. |
| **Billing events** | ≥ 7 years | Financial record. |
| **Notifications** | 90 days | Then purged. |

Retention windows are enforced by scheduled cleanup jobs (tracked in `job_runs`).

---

## PII handling & encryption

- **At rest:** database encryption; sensitive secrets (`integration_accounts.encrypted_
  credentials`, AI provider keys) encrypted with KMS/`pgcrypto`. Extension tokens stored as
  `token_hash` only.
- **In transit:** TLS everywhere; extension uses scoped tokens, never the session JWT.
- **PII fields:** contact email/phone, message bodies. Access is org-scoped + RBAC-gated
  (`leads.read`, `audit.read`). Field-level encryption is a future enhancement.

## Privacy mode & free-API redaction policy

Because free/low-cost APIs may have different data-use terms, every org has a
`privacy_mode` (`organizations.settings.privacy_mode`) enforced by the AI gateway
([14 §14.8](./14-ai-provider-and-usage-system.md)):

| Mode | Behavior |
|------|----------|
| `free_api_allowed` | free/low-cost APIs may receive (redacted) input |
| `redact_pii_before_ai` | **v1 default** — redact PII before any external call |
| `paid_only` | only paid provider accounts |
| `byok_only` | only the org's own key |
| `disabled` | no external AI; deterministic-only features |

**Before sending to a free API, redact:** email, phone, personal names (when not required),
exact/sensitive URLs, private notes, internal pricing, sensitive attachments. Redaction happens
in the gateway; only a redacted reference is logged. Covered by the **AI PII redaction** test
suite (see [07 · Backend Architecture](./07-backend-architecture.md)).

## AI prompt redaction

- Discovery text is treated as **untrusted data**, never as instructions (delimited;
  prompt-injection guarded).
- Before sending to a provider, prompts **minimize PII** (only fields needed for the task).
- `ai_requests.request_ref` stores a **redacted** reference (entity id + hashes), not raw PII.
- Org custom prompts (`ai_prompt_versions`) are reviewed for accidental data leakage.

## AI request & analysis governance

- Every model call is logged (`ai_requests`) with provider, model, `ai_prompt_version_id`,
  tokens, cost, latency, status — fully auditable via `/ai/requests` and `/settings/audit`.
- Spend caps and rate limits per org/provider; usage metered into `usage_limits`.
- Re-analysis is safe and cheap (raw stored); model upgrades can reprocess history on demand.

---

## Deletion model

### Soft delete (recoverable)
Tables with `deleted_at` (discoveries, companies, contacts, opportunities, leads, notes,
attachments, message_templates, …) are soft-deleted first. Soft-deleted rows are excluded by
the BaseRepository and purged by a cleanup job after a grace window (default 30 days).

### Hard delete (permanent)
- **On request** (`POST /security/delete`) or after the grace window.
- Removes the row and dependent blobs (object store) irreversibly.
- Append-only records (`audit_log`, `billing_events`) are retained per compliance even when
  related entities are hard-deleted, but PII within them is redacted/anonymized.

### Organization deletion
1. Owner requests deletion (`[owner]` only) → confirmation + cooling-off period.
2. Org marked for deletion; access frozen; export offered.
3. After cooling-off, a deletion job hard-deletes all tenant rows (every `organization_id`
   match) and object-store prefixes, anonymizes append-only logs, cancels the subscription,
   and emits a final `billing_event`.

### User deletion
- Removing a user removes their `memberships`; org data they created remains (attributed to a
  system/anonymized actor) unless the org is also deleted.
- A user with no remaining memberships can request account deletion (auth identity removed).

---

## Data export & import

- **Export** (`GET /security/export`, `[owner|billing.manage]`): async job produces a
  portable archive (JSON/CSV per entity + attachment manifest) to a signed URL. Tracked in
  `job_runs`; completion notified.
- **Import:** CSV import (P2) covers discoveries; full-archive import is a future enhancement.
- Export proves data ownership and supports portability/compliance requests.

## Re-analysis rules

- Because raw payloads are retained, any discovery can be re-analyzed (`/discoveries/:id/
  reanalyze`) with the current prompt version + scoring strategy.
- Re-analysis writes a **new** `ai_analysis` row (history kept) and a new `ai_request`.
- Bulk re-analysis (e.g. after a model/prompt upgrade) runs as governed jobs respecting spend caps.

---

## Backup & recovery

- **Postgres:** automated daily backups + point-in-time recovery (WAL). Tested restores.
- **Object store:** versioned buckets + lifecycle rules (hot → cold → expiry).
- **RPO/RTO targets** defined per plan; documented runbook for restore.
- Backups are encrypted and access-controlled; restores are audited.

## Tenant isolation (defense-in-depth)

1. **Application:** `TenantContext` injects `organization_id` into every repository query.
2. **Database (optional):** Postgres RLS policies `organization_id = current_setting('app.org_id')`.
3. **Object store:** keys namespaced by `organization_id`.
4. **Tests:** mandatory cross-org access tests for every resource (QA category).

---

## Security review checklist

- [ ] Every tenant table has `organization_id` + the required timestamp/audit columns.
- [ ] Every API route enforces a permission key (RBAC) and tenant scope.
- [ ] No secrets in the repo; all provider keys encrypted at rest.
- [ ] Extension tokens are hashed, scoped, revocable, and never grant write access.
- [ ] AI prompts minimize PII; request refs are redacted.
- [ ] Spend caps + rate limits active per org/provider.
- [ ] Audit log captures all sensitive mutations; append-only enforced.
- [ ] Soft-delete excludes rows everywhere; hard-delete purges blobs.
- [ ] Org/user deletion flows tested end-to-end.
- [ ] Backups encrypted; restore tested; RLS (if enabled) verified.
- [ ] Cross-org isolation tests green in CI.
- [ ] Data export produces a complete, portable archive.
