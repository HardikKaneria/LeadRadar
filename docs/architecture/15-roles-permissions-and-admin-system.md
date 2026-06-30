# 15 — Roles, Permissions & Admin System

> The account model, RBAC, the three dashboards, and the Master Admin platform area. Pairs with
> [04 · Database Schema](./04-database-schema.md) (roles/permissions/platform_admins),
> [05 · API Structure](./05-api-structure.md) (`/admin/*`, `/usage/*`, roles APIs), and
> [14 · AI Provider & Usage System](./14-ai-provider-and-usage-system.md) (who can see/manage AI
> keys + usage).

---

## 15.1 Role hierarchy

Three role types today, built on **permission-based RBAC** so more roles drop in without code
changes (roles + permissions are data — see [04](./04-database-schema.md) §4.3).

```
PLATFORM (Radar OIP itself)
└── master_admin            ← platform owner/operator (not tenant-scoped)

ORGANIZATION (a customer company)
├── company_admin           ← company/team owner
└── sales_executive         ← PRIMARY DAILY USER — the opportunity hunter
```

**Default system roles (`roles.is_system = true`, `organization_id = null`):**
`master_admin`, `company_admin`, `sales_executive`.

**Future system roles (add as data, no migration):** `manager`, `viewer`, `billing_admin`,
`ai_admin`, and an optional `senior_sales_executive` (§15.5).

> **Sales Executive is the lead/opportunity hunter, not just a closer.** They live in the
> product daily: searching platforms, capturing visible opportunities, triaging the Discovery
> Inbox, and running outreach. The whole UX is tuned for them.

---

## 15.2 Master Admin (platform)

The platform operator. **Not** a member of any one company; identity tracked in
`platform_admins` (not `memberships`). Manages: platform dashboard · all companies · all users ·
all plans · all AI providers · provider accounts · API keys · global AI routing rules · global
usage · platform AI cost · free-tier usage health · provider rate limits · failed AI requests ·
failed jobs · model performance · platform revenue · company limits · platform audit logs ·
system health · support access (with audit).

**Routes:** `/admin/dashboard` · `/admin/companies` · `/admin/users` · `/admin/ai-providers` ·
`/admin/ai-routing` · `/admin/ai-usage` · `/admin/api-keys` · `/admin/jobs` · `/admin/billing` ·
`/admin/audit` · `/admin/system-health`.

**Platform permissions:** `platform.dashboard.read`, `platform.companies.manage`,
`platform.users.manage`, `platform.ai_providers.manage`, `platform.ai_routes.manage`,
`platform.usage.read`, `platform.billing.manage`, `platform.audit.read`, `platform.jobs.manage`,
`platform.support_access`.

---

## 15.3 Company Admin (organization)

The company/team owner. Manages: company settings · Company Brain · services · target countries ·
bad-lead rules · team members · Sales Executive permissions · company billing & usage · company
opportunities · leads · tasks · company audit logs · company integrations (if enabled).

**Dashboard shows:** total discoveries captured · discoveries by Sales Executive · approved
opportunities · ignored discoveries · conversion rate by user · usage by user · AI credits used ·
best source platforms · best services · follow-up performance.

**Company permissions:** `company.dashboard.read`, `company.settings.manage`,
`company_brain.manage`, `members.manage`, `roles.manage`, `company.billing.read`,
`company.billing.manage`, `company.usage.read`, `company.audit.read`.

---

## 15.4 Sales Executive (organization, primary daily user)

The opportunity hunter. **Core workflow:**

```
Search platform manually → Capture visible opportunities → Send to Discovery Inbox →
AI analyzes → Review score/reason → Shortlist good ones → Submit for approval (or convert
if allowed) → Start outreach → Convert into lead pipeline → Follow up until deal →
Outcome → Knowledge Engine → Learning Engine improves future scoring
```

**Can:** search platforms manually · capture visible opportunities (LinkedIn/Upwork/Freelancer/…)
· capture inquiries (WhatsApp/email/referrals/manual) · use the Chrome extension · create manual
discoveries · import CSV (if allowed) · view Discovery Inbox · review AI analysis · shortlist ·
submit for approval · convert to opportunity (if permission allows) · start outreach · generate
AI messages/follow-ups · manage assigned leads & tasks · view own usage · view company usage
read-only summary.

**Cannot:** manage AI API keys · AI routing rules · company billing settings · team members ·
roles & permissions · global platform settings · other companies · Company Brain (unless
explicitly granted).

**Dashboard shows:** my best opportunities today · my captured discoveries waiting for AI · my
high-score discoveries · my follow-ups due today · my overdue follow-ups · my outreach drafts ·
my usage this month.

**Capture sources** (drive Knowledge Engine, revenue attribution & SE performance):
linkedin, upwork, freelancer, website, referral, manual, csv, whatsapp, email, existing_customer,
conference, client_call, partnership, other.

---

## 15.5 Optional future role — Senior Sales Executive

A `senior_sales_executive` can be added later as a data-only role: a Sales Executive **plus**
team-scoped read/manage (`discoveries.read_team`, `opportunities.read_team`, `leads.read_team`,
`tasks.assign_team`) and self-approval (`discoveries.approve`, `discoveries.convert_to_opportunity`).
No new code — assign the extra permissions to the role.

---

## 15.6 Permission model & catalog

Permissions are a **global catalog** (`permissions` table, grouped by `category`). Roles map to
permissions via `role_permissions`. The guard reads the membership’s role → permission set.

**Ownership-scoped keys** (`_own` / `_team`) let the same feature be scoped without new endpoints:
e.g. `discoveries.read_own` (only mine), `discoveries.read_team` (my team), `discoveries.read`
(all in org).

| Category | Permission keys |
|----------|-----------------|
| **Platform** | `platform.dashboard.read`, `platform.companies.manage`, `platform.users.manage`, `platform.ai_providers.manage`, `platform.ai_routes.manage`, `platform.usage.read`, `platform.billing.manage`, `platform.audit.read`, `platform.jobs.manage`, `platform.support_access` |
| **Company** | `company.dashboard.read`, `company.settings.manage`, `company_brain.manage`, `members.manage`, `roles.manage`, `company.billing.read`, `company.billing.manage`, `company.usage.read`, `company.audit.read` |
| **Discovery** | `discoveries.read`, `discoveries.read_own`, `discoveries.read_team`, `discoveries.create`, `discoveries.capture`, `discoveries.create_manual`, `discoveries.import_csv`, `discoveries.review`, `discoveries.submit_for_approval`, `discoveries.approve`, `discoveries.ignore`, `discoveries.convert_to_opportunity` |
| **Opportunity** | `opportunities.read`, `opportunities.read_own`, `opportunities.read_team`, `opportunities.manage`, `opportunities.manage_own`, `opportunities.manage_team`, `opportunities.assign`, `opportunities.create_from_discovery`, `opportunities.promote_to_lead` |
| **Lead & Task** | `leads.read`, `leads.read_own`, `leads.read_team`, `leads.manage`, `leads.manage_own`, `leads.manage_team`, `leads.close`, `tasks.read`, `tasks.read_own`, `tasks.manage`, `tasks.manage_own`, `tasks.assign_team` |
| **AI** | `ai.use`, `ai.sales_assistant.use`, `ai.company_research.use`, `ai.reanalyze.use`, `ai.proposal.generate`, `ai.usage.read`, `ai.settings.manage` |
| **Sensitive** | `api_keys.manage`, `integrations.manage`, `audit.read`, `billing.manage`, `support.impersonate` |
| **Usage** | `usage.read_own`, `usage.read_company_summary`, `usage.read_company`, `usage.read_platform` |

> `ai.settings.manage` and `api_keys.manage` govern **org-level** AI settings/BYOK only.
> **Platform** provider accounts, the key pool, and routing rules are gated by
> `platform.ai_providers.manage` / `platform.ai_routes.manage` — Master Admin only.

---

## 15.7 Table design (see [04 · Database Schema](./04-database-schema.md))

### platform_admins
`id · user_id FK · role enum(master_admin,…) · status · created_at · updated_at`
- *Why:* platform operators are not tenant members; keep them out of `memberships`.

### roles
`id · organization_id (nullable — null = system role) · name · slug · is_system · created_at · updated_at`
- Unique(organization_id, slug). System roles can’t be deleted.

### permissions
`id · key (unique) · description · category`

### role_permissions
`role_id · permission_id` — PK(role_id, permission_id).

Memberships carry `role_id` (see [04](./04-database-schema.md) §4.2).

---

## 15.8 Usage visibility per role

| Sees | Master Admin | Company Admin | Sales Executive |
|------|:---:|:---:|:---:|
| Total platform usage / cost / revenue | ✅ | — | — |
| Usage by company / provider / API key / model / process | ✅ | — | — |
| Free-tier remaining · failed requests · provider health · rate-limit errors | ✅ | — | — |
| Company usage · team usage · usage by user · usage by feature | ✅ | ✅ | — |
| Monthly limits · remaining credits · upgrade warnings | ✅ | ✅ | read-only summary |
| My AI usage · my messages/analyses/proposals · my remaining monthly usage | ✅ | ✅ | ✅ |
| API keys · provider account details · global platform cost · other companies | ✅ | — | **never** |

Permission keys: platform → `usage.read_platform`; company → `usage.read_company` /
`company.usage.read`; user → `usage.read_own` (+ `usage.read_company_summary` for the read-only
company rollup).

---

## 15.9 Dashboards

- **Master Admin** (`/admin/dashboard`): platform health, AI cost vs revenue, provider/free-tier
  health, failed jobs/requests, top companies by usage, model performance.
- **Company Admin** (`/`): the §15.3 list — capture & conversion by Sales Executive, AI credits,
  best sources/services, follow-up performance.
- **Sales Executive** (`/`): the §15.4 list — today’s best opportunities, captures waiting for
  AI, high-score discoveries, follow-ups due/overdue, outreach drafts, my usage.

The org **homepage is the Daily Action Center** for both tenant roles, rendered to the viewer’s
permission scope (Company Admin sees team rollups; Sales Executive sees their own queue).

---

## 15.10 Support access & impersonation

- Master Admin support access requires `platform.support_access` / `support.impersonate` and is
  **always audited**: an `audit_log` entry on session start/end with reason, target org/user, and
  duration. Impersonation is read-first; write actions are separately gated and logged.
- Impersonation never exposes raw provider keys or another tenant’s secrets.

---

## 15.11 Audit & security restrictions

- Every sensitive change (role/permission edits, key changes, billing changes, impersonation,
  data export/delete) writes `audit_log`.
- Tenant isolation: every tenant query is `organization_id`-scoped (repository layer + optional
  RLS). Cross-org access fails everywhere — covered by tenant-isolation tests.
- Sales Executive is hard-blocked from keys, provider accounts, routing, platform cost, other
  companies, and billing credentials — enforced by permission gates **and** route guards, tested
  by RBAC + access tests (see [07 · Backend Architecture](./07-backend-architecture.md) testing).

---

## 15.12 Example permission matrix (defaults)

| Permission (sample) | master_admin | company_admin | sales_executive |
|---|:---:|:---:|:---:|
| `platform.*` | ✅ | — | — |
| `company.settings.manage` · `company_brain.manage` | — | ✅ | — |
| `members.manage` · `roles.manage` | — | ✅ | — |
| `company.billing.manage` · `api_keys.manage` · `integrations.manage` | — | ✅ | — |
| `discoveries.capture` · `create_manual` · `import_csv` · `review` · `submit_for_approval` | — | ✅ | ✅ |
| `discoveries.approve` · `convert_to_opportunity` | — | ✅ | ⚙️ optional |
| `opportunities.promote_to_lead` · `leads.manage_own` · `tasks.manage_own` | — | ✅ | ✅ |
| `ai.use` · `ai.sales_assistant.use` · `ai.proposal.generate` · `ai.reanalyze.use` | — | ✅ | ✅ |
| `ai.settings.manage` | — | ✅ | — |
| `usage.read_platform` | ✅ | — | — |
| `usage.read_company` / `company.usage.read` | — | ✅ | — |
| `usage.read_own` · `usage.read_company_summary` | — | ✅ | ✅ |
| `audit.read` / `company.audit.read` | ✅ | ✅ | — |

⚙️ = grant per-org based on trust (e.g. via `senior_sales_executive`). Master Admin holds
platform permissions; tenant business permissions belong to org roles.
