# 05 — API Structure

REST over HTTPS, JSON. NestJS controllers per domain module. OpenAPI auto-generated.
All routes are org-scoped via the auth token; `:orgId` is implicit (from token), not in
the path, except platform-admin routes.

## Conventions

- Base: `/api/v1`.
- Auth: `Authorization: Bearer <access_token>`. Extension uses a scoped **capture token**.
- **AuthZ:** every route is gated by a permission key (RBAC). The key is noted per group below.
- Pagination: cursor-based `?cursor=&limit=`. Filtering: explicit query params.
- Errors: RFC-7807-style `{ type, title, status, detail, errors[] }`.
- Idempotency: `Idempotency-Key` header on ingestion + entity-creating mutations.
- Every mutation emits an `activity` and (if sensitive) an `audit_log` entry.
- **Async operations return `202 Accepted` + a `job_run` reference** (`{ job_id }`); clients
  track progress via the Job Status API.

## Canonical enums (mirror [04-database-schema](./04-database-schema.md))

- **discovery_source:** linkedin, upwork, freelancer, website, referral, manual, csv,
  whatsapp, email, existing_customer, conference, client_call, partnership, other
- **opportunity_status:** open, qualified, promoted_to_lead, ignored, expired, archived
- **priority:** critical, high, medium, low
- **lead_stage:** new, contacted, reply_received, meeting_scheduled, proposal_sent,
  negotiation, won, lost, on_hold

---

## Resource map

### Auth & Org
```
POST   /auth/register
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout
GET    /me
GET    /orgs                       list my orgs
POST   /orgs                       create org
GET    /orgs/current/settings
PATCH  /orgs/current/settings      score threshold, business hours, follow-up defaults  [members.manage]
GET    /orgs/current/members       [members.manage]
POST   /orgs/current/invites       [members.manage]
PATCH  /orgs/current/members/:id   assign role / status                                 [members.manage]
```

### Roles & Permissions (RBAC)
```
GET    /roles                      system + custom roles                                [members.manage]
POST   /roles                      create custom role                                   [members.manage]
PATCH  /roles/:id                  rename / edit (system roles immutable)               [members.manage]
DELETE /roles/:id                  delete custom role                                   [members.manage]
GET    /permissions                full permission catalog (grouped by category)        [members.manage]
PUT    /roles/:id/permissions      set role_permissions for a role                      [members.manage]
```

### Company Brain (M1)
```
GET    /company-profile            active profile                                       [company_brain.manage]
PUT    /company-profile            new version (services, ICP, countries, budget,
                                   bad-lead rules, outreach tone)                        [company_brain.manage]
GET    /company-profile/versions
```

### Ingestion & Discovery (M2/M3)
```
POST   /ingest/extension           capture batch (visible items)            [extension.use]   [202 → job]
POST   /ingest/manual              single manual opportunity                [discoveries.write][202 → job]
POST   /ingest/csv                 presigned upload + parse job             [discoveries.write][202 → job]
GET    /discoveries                inbox list — filters: status,source,country,service,score,date  [discoveries.read]
GET    /discoveries/:id            [discoveries.read]
PATCH  /discoveries/:id            status transitions (reviewed/ignored)    [discoveries.write]
POST   /discoveries/:id/reanalyze  enqueue fresh analysis                   [discoveries.write][202 → job]
POST   /discoveries/:id/approve    promote → opportunity (threshold + human approval)    [discoveries.approve]
POST   /discoveries/bulk           bulk approve/ignore                      [discoveries.approve]
GET    /discoveries/:id/analysis   latest ai_analysis                       [discoveries.read]
```

### Opportunities (M6)
```
GET    /opportunities              filters: status,priority,score,heat,owner   [opportunities.read]
GET    /opportunities/:id          score, value, source, explanation, action  [opportunities.read]
PATCH  /opportunities/:id          owner, value, priority, status overrides    [opportunities.write]
POST   /opportunities/:id/promote  create lead (start outreach)                [leads.write]
GET    /opportunities/:id/similar  pgvector neighbors (M12)                    [opportunities.read]
```

### Daily Action Center (M8)
```
GET    /action-center/today        high-value opps + due/overdue follow-ups + urgent actions
GET    /action-center/digest       data for the daily digest
```

### Leads & Pipeline (M9)
```
GET    /leads                      filters: stage,owner,next_action_at          [leads.read]
GET    /leads/:id                  [leads.read]
PATCH  /leads/:id/stage            stage transition (guard: no active lead w/o open task)  [leads.write]
PATCH  /leads/:id                  owner, value                                  [leads.write]
POST   /leads/:id/close            won/lost(+reason) → emits knowledge_event      [leads.write]
```

### Tasks / Follow-up Intelligence (M10)
```
GET    /tasks                      filters: owner,status,due (overdue|today|upcoming)  [tasks.manage]
POST   /tasks                      create (lead/opportunity bound)                      [tasks.manage]
PATCH  /tasks/:id                  complete/cancel/reschedule/reassign                  [tasks.manage]
GET    /tasks/queues               {overdue, today, upcoming} counts + items            [tasks.manage]
```

### Companies, Contacts & Relationship Graph (M7)
```
GET    /companies                  search/dedup                                   [opportunities.read]
GET    /companies/:id              + relationship edges                           [opportunities.read]
POST   /companies/:id/merge        [opportunities.write]
GET    /contacts                   [opportunities.read]
POST   /companies/:id/research     enqueue Company Research Agent                 [ai.use][202 → job]
GET    /graph/edges                relationship_edges by entity                   [opportunities.read]
POST   /graph/edges                create edge (type, strength, source)           [opportunities.write]
DELETE /graph/edges/:id            [opportunities.write]
```

### AI Sales Assistant, Outreach & Proposals (M11)
```
POST   /ai/assist/message          generate outreach (ctx: opportunity/lead)      [ai.use]
POST   /ai/assist/follow-up        [ai.use]
POST   /ai/assist/summarize        summarize conversation/notes                   [ai.use]
POST   /ai/assist/proposal         generate proposal (→ proposal + attachment)    [ai.use][202 → job]
POST   /ai/assist/meeting-prep     [ai.use]
POST   /ai/assist/next-action      [ai.use]

GET    /outreach                   filter: lead/opportunity/contact/channel/status [leads.read]
POST   /outreach                   log/create message (draft|ready|sent)           [leads.write]
PATCH  /outreach/:id               status, engagement (opened/replied)             [leads.write]
GET    /conversations              threads + summaries                             [leads.read]
GET    /conversations/:id          [leads.read]

GET    /message-templates          [leads.read]
POST   /message-templates          [leads.write]
PATCH  /message-templates/:id      [leads.write]

GET    /proposals                  filter: lead/opportunity/status                 [leads.read]
GET    /proposals/:id              [leads.read]
POST   /proposals                  create (draft)                                  [leads.write]
PATCH  /proposals/:id              status transitions (ready/sent/accepted/...)    [leads.write]
```

### Attachments (polymorphic)
```
POST   /attachments                presigned upload (entity_type, entity_id)
GET    /attachments?entity=...     list for an entity
DELETE /attachments/:id            soft delete
```

### AI Gateway admin & Prompt Versions (M4)
> Org-level surface only (BYOK + prompts). The **platform** provider key pool + routing live under
> `/admin/ai/*` (Master Admin). All domain AI calls go through
> `AIService.generate(taskType, input, organizationId, userId)` — never a provider SDK directly
> (see [14](./14-ai-provider-and-usage-system.md)).
```
GET    /ai/providers               org BYOK providers + health                    [ai.settings.manage]
PUT    /ai/providers/:name         set per-org key / enable / priority (encrypted) [ai.settings.manage]
GET    /ai/usage                   cost & token usage by agent/provider/date       [ai.settings.manage]
GET    /ai/requests                audit list (ai_requests)                        [audit.read]

GET    /ai/prompts                 prompt versions (system defaults + org custom)  [ai.settings.manage]
GET    /ai/prompts/:id             [ai.settings.manage]
POST   /ai/prompts                 create org custom version                       [ai.settings.manage]
PATCH  /ai/prompts/:id             edit (system defaults read-only)                [ai.settings.manage]
POST   /ai/prompts/:id/activate    set active for an agent                         [ai.settings.manage]
```

### Job Status API (M-Jobs)
```
GET    /jobs                       filters: queue,status,entity_type,date
GET    /jobs/:id                   status, progress, result/error
GET    /jobs/:id/logs              streamed/append-only job log lines
POST   /jobs/:id/cancel            request cancellation (queued/running)
```
Backs: AI analysis, CSV import, company research, proposal generation, scoring recompute,
heat recompute, digest generation, extension batch processing.

### Knowledge & Learning (M12)
```
GET    /knowledge/events           filters: type,date,source
GET    /knowledge/insights         conversion by service/country/source, win/loss reasons
GET    /knowledge/forecast         revenue forecast
GET    /knowledge/demand-radar     trending demand clusters
GET    /knowledge/resurrection     dormant leads worth reviving
GET    /scoring/strategy           active strategy + metrics
POST   /scoring/recompute          trigger learning recompute (admin)             [ai.settings.manage][202 → job]
```

### Notifications (M13)
```
GET    /notifications              filters: read,type
PATCH  /notifications/:id/read
PATCH  /notifications/read-all
GET    /notification-preferences
PUT    /notification-preferences   per-channel/event toggles
```

### Notes & Activities (M13)
```
GET    /entities/:type/:id/activities
GET    /entities/:type/:id/notes
POST   /entities/:type/:id/notes
```

### Integrations & Extension Tokens
```
GET    /integrations               integration_accounts                           [integrations.manage]
POST   /integrations               connect (provider, type, credentials)          [integrations.manage]
PATCH  /integrations/:id           settings / reconnect                           [integrations.manage]
DELETE /integrations/:id           disconnect                                     [integrations.manage]

GET    /extension/tokens           list scoped tokens + status/last batches        [extension.use]
POST   /extension/tokens           generate scoped capture token (returned once)   [extension.use]
DELETE /extension/tokens/:id       revoke                                          [extension.use]
GET    /extension/health           parser version health + last capture batches    [extension.use]
```

### Billing & Usage
```
GET    /billing/plan               current subscription + plan                    [billing.manage]
GET    /billing/usage              usage_limits by metric (period)                [billing.manage]
GET    /billing/invoices           billing_events history                         [billing.manage]
POST   /billing/checkout           start plan change (provider session)           [billing.manage]
POST   /billing/portal             provider customer portal link                  [billing.manage]
POST   /webhooks/billing           provider webhook (no auth; signature-verified) → billing_events
```

### Security & Audit (settings surface)
```
GET    /security/sessions          active sessions
DELETE /security/sessions/:id      revoke session
GET    /security/export            request org data export                        [billing.manage|owner]
POST   /security/delete            request org/user deletion (governed)           [owner]
GET    /audit                      audit_log + sensitive changes                  [audit.read]
```

### Usage (per role — see [15 · Roles & Permissions](./15-roles-permissions-and-admin-system.md))
```
GET    /usage/me                   my AI usage + remaining monthly                [usage.read_own]
GET    /usage/company              full company usage (by user/feature/model)     [usage.read_company]
GET    /usage/company/summary      read-only company rollup (Sales Executive)     [usage.read_company_summary]
GET    /usage/team                 team usage breakdown                           [usage.read_company]
GET    /usage/limits               company_usage_limits + credits + reset date    [company.usage.read]
GET    /usage/events               ai_usage_events ledger (filter: user/task/model/date) [usage.read_company]
```

### Master Admin — platform area (`/admin/*`, gated by `platform.*`)
> Platform-scoped, **not** org-scoped. Provider accounts, keys, and routing are Master Admin only
> and never exposed to tenant roles. Full system in
> [14 · AI Provider & Usage System](./14-ai-provider-and-usage-system.md).
```
GET    /admin/dashboard            platform KPIs, AI cost vs revenue, health      [platform.dashboard.read]
GET    /admin/companies            all companies + limits                         [platform.companies.manage]
GET    /admin/users                all users across companies                     [platform.users.manage]
GET    /admin/usage                global usage (by company/provider/key/model/process) [platform.usage.read]

GET    /admin/ai/providers         ai_provider_accounts + status                  [platform.ai_providers.manage]
POST   /admin/ai/providers         add approved provider account                  [platform.ai_providers.manage]
PATCH  /admin/ai/providers/:id     budget / rate limits / status                  [platform.ai_providers.manage]
GET    /admin/ai/api-keys          ai_api_keys (metadata only — never the secret) [platform.ai_providers.manage]
POST   /admin/ai/api-keys          add key to a provider account (encrypted)      [platform.ai_providers.manage]
PATCH  /admin/ai/api-keys/:id      status / limits / cooldown                     [platform.ai_providers.manage]
DELETE /admin/ai/api-keys/:id      revoke                                         [platform.ai_providers.manage]
GET    /admin/ai/routes            ai_task_routes                                 [platform.ai_routes.manage]
POST   /admin/ai/routes            set route for a task type                      [platform.ai_routes.manage]
PATCH  /admin/ai/routes/:id        primary/fallback model edits                   [platform.ai_routes.manage]
GET    /admin/ai/health            provider health + rate-limit events            [platform.ai_providers.manage]

GET    /admin/jobs                 all job_runs (failed jobs view)                [platform.jobs.manage]
GET    /admin/billing              plans, subscriptions, revenue                  [platform.billing.manage]
GET    /admin/audit                platform audit log                             [platform.audit.read]
GET    /admin/system-health        queues, workers, DB, provider uptime           [platform.dashboard.read]
```

---

## Internal job API (Worker, not public)

BullMQ queues, not HTTP. Producers in API modules, consumers in Worker — each run is mirrored
into `job_runs` (status/progress/result):
`analyze-discovery`, `generate-embedding`, `research-company`, `plan-actions`,
`recompute-scoring`, `recompute-heat`, `build-digest`, `import-csv`,
`process-extension-batch`, `generate-proposal`.

## Versioning & contracts

- OpenAPI spec generated from controllers; published to web + extension as a typed client.
- Shared DTOs/enums live in `packages/contracts` consumed by web, extension, API.
- Breaking changes → `/api/v2`.
