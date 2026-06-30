# Radar OIP — Architecture & Design

**Radar OIP** (Opportunity Intelligence Platform) is an AI-powered system that helps an
agency/freelancer **discover, analyze, prioritize, and convert** business opportunities.

It is **not a CRM**. A CRM answers _"what happened with my leads?"_. Radar answers
_"what should I do next that has the highest chance of generating revenue?"_

> This is a greenfield design. It supersedes the legacy LeadRadar marketplace tracker,
> reusing domain concepts but moving to a production SaaS stack (NestJS, Next.js,
> self-hosted PostgreSQL + pgvector, Redis/BullMQ, Chrome MV3, pluggable AI).

---

## Read this set in order

| # | Document | What it answers |
|---|----------|-----------------|
| 1 | [README](./README.md) | Orientation, read order, documentation status |
| 2 | [01 · Vision & Principles](./01-vision-and-principles.md) | Why this exists, the design tenets, non-goals |
| 3 | [FEATURE.md](./FEATURE.md) | Every feature in product terms: what/why/who/how, phase, AI involvement |
| 4 | [02 · System Architecture](./02-system-architecture.md) | Components, how they talk, end-to-end data flow |
| 5 | [03 · Module Breakdown](./03-module-breakdown.md) | The 13 modules + platform modules, responsibilities, boundaries |
| 6 | [04 · Database Schema](./04-database-schema.md) | Tables, relationships, indexes, audit, multi-tenancy, vectors |
| 7 | [05 · API Structure](./05-api-structure.md) | REST surface, RBAC keys, jobs, contracts |
| 8 | [06 · Frontend Structure](./06-frontend-structure.md) | Next.js routes, settings pages, components, state |
| 9 | [07 · Backend Architecture](./07-backend-architecture.md) | NestJS folders, modular-monolith boundaries, testing |
| 10 | [08 · Extension Architecture](./08-extension-architecture.md) | Chrome MV3 human-assisted capture |
| 11 | [09 · AI Workflow](./09-ai-workflow.md) | Provider abstraction, agents, prompt versioning, learning loop |
| 12 | [10 · Roadmap](./10-roadmap.md) | 9 phases, sequencing, milestones, definition of done |
| 13 | [11 · Task Breakdown](./11-task-breakdown.md) | Every task: owner, deps, output, complexity, priority, module |
| 14 | [12 · Data Lifecycle & Governance](./12-data-lifecycle-and-governance.md) | Retention, PII, deletion, export, isolation, security checklist |
| 15 | [13 · Design System](./13-design-system.md) | Target frontend design direction — tokens, shell, component rules, accessibility |
| 16 | [14 · AI Provider & Usage System](./14-ai-provider-and-usage-system.md) | Provider abstraction, key pool, model router, usage ledger, quotas/credits, free-first routing, privacy mode |
| 17 | [15 · Roles, Permissions & Admin System](./15-roles-permissions-and-admin-system.md) | Master/Company/Sales roles, permission catalog, the three dashboards, the Master Admin platform area |

**Also present (supporting docs):**

| Document | What it answers |
|----------|-----------------|
| [13 · Supabase Integration](./13-supabase-integration.md) | **Current auth/data model of the shipped code** — Supabase auth + Postgres + RLS, thin NestJS. Supersedes the auth/data sections of 02/05/07/09 ([[D-006]]) |
| [16 · Key Screen Wireframes](./16-key-screen-wireframes.md) | Implementation-grade structure for Action Center, Inbox, Opportunity, Lead Workspace, Knowledge, and Settings |
| [17 · UI QA Signoff](./17-ui-qa.md) | Shared UI QA checklist, fixes, and acceptance notes for the shipped design track |

> ⚠️ **Auth & data access changed after the original design:** the platform now uses **full
> Supabase** (auth + database + RLS) with a thin NestJS service. Read
> [13 · Supabase Integration](./13-supabase-integration.md) — it overrides the auth/data-access
> parts of docs 02, 05, 07, and 09. See [[D-006]] in the decision log.

> ⚠️ **Frontend docs are intentionally split:** [13 · Design System](./13-design-system.md)
> describes the **next** design direction before a major frontend rewrite, while
> [`../DESIGN.md`](../DESIGN.md) and [`../UIUX.md`](../UIUX.md) describe the **currently shipped**
> Ant Design 6 implementation.

---

## The core flow (one picture)

```
Discovery → AI Intelligence → Opportunity → Lead → Deal → Knowledge → Learning
   (raw)      (analyze/score)   (approved)   (outreach) (won/lost) (capture)  (improve scoring)
                                                                                    ↑__________|
                                                                            feeds back into scoring
```

## Non-negotiables (product rules)

1. **Action intelligence before data storage** — Radar is a decision engine, not a CRM.
2. The **Daily Action Center** is the home screen.
3. **Every active lead must have a next action.**
4. **Every discovery is stored raw** before AI analysis.
5. **AI is replaceable** through a provider abstraction layer.
6. **Human approval** is required before a discovery becomes an opportunity.
7. The browser extension is **human-assisted only** — visible data, on user action.
8. **No aggressive scraping**, auto-scroll, crawling, or background scraping.
9. **Multi-tenancy from day one**; organization data is isolated.
10. **AI calls are logged, cost-tracked, rate-limited, quota-aware, and auditable.**
11. The **Learning Engine** improves scoring from wins/losses over time.
12. The **Sales Executive is the primary daily user** — the opportunity hunter the UX is built for.
13. **Free-first AI routing** through a legitimate provider key pool — never free-tier abuse or
    key-rotation to bypass provider limits ([14](./14-ai-provider-and-usage-system.md)).
14. **Usage & billing tracking works from day one**, even when the AI APIs are free.

---

## Current Documentation Status

| Area | Status |
|------|--------|
| **Architecture** | Ready |
| **Database** | Updated with SaaS-scale tables (RBAC + `platform_admins`, AI provider key-pool + usage ledger, jobs, billing + company usage limits/credits, outreach, prompts, integrations, graph, governance) |
| **API** | Updated with jobs, billing, integrations, outreach, proposals, notifications, RBAC, prompt versions, **Master Admin `/admin/*`** and **`/usage/*`** |
| **Frontend** | Updated with the **Master Admin area** (`/admin/*`), settings (ai/usage/integrations/extension/security/audit/billing/roles), jobs, notifications, outreach, billing, and role-based dashboards |
| **AI** | Updated with **free-first routing, provider key pool, model router, usage ledger, privacy mode**, and prompt versioning ([14 · AI Provider & Usage System](./14-ai-provider-and-usage-system.md)) |
| **Roles** | Documented in [15 · Roles, Permissions & Admin System](./15-roles-permissions-and-admin-system.md) — master_admin / company_admin / sales_executive |
| **Design System** | Documented in [13 · Design System](./13-design-system.md) |
| **Roadmap** | 9 phases (each with goal/includes/DoD/modules/milestone) |
| **Tasks** | New format (owner/deps/output/complexity/priority/module) with QA tasks per phase |
| **Features** | Documented in [FEATURE.md](./FEATURE.md) |
| **Governance** | Documented in [12 · Data Lifecycle & Governance](./12-data-lifecycle-and-governance.md) |

### Platform roles (see [15](./15-roles-permissions-and-admin-system.md))

- **master_admin** — platform owner/operator (not tenant-scoped; `platform_admins`). Manages
  companies, users, plans, AI providers/accounts/keys, routing, global usage, system health.
- **company_admin** — company/team owner. Manages Company Brain, members, roles, billing, usage.
- **sales_executive** — **the primary daily user / opportunity hunter.** Captures, triages,
  shortlists, submits/converts, runs outreach, manages assigned leads & tasks.
- Future system roles (data-only, no migration): `manager`, `viewer`, `billing_admin`,
  `ai_admin`, optional `senior_sales_executive`.

### Canonical enums (single source of truth — see [04 · Database Schema](./04-database-schema.md))

- **discovery_source:** linkedin, upwork, freelancer, website, referral, manual, csv,
  whatsapp, email, existing_customer, conference, client_call, partnership, other
- **opportunity_status:** open, qualified, promoted_to_lead, ignored, expired, archived
- **priority (user-facing):** critical, high, medium, low (internal `priority_weight`)
- **lead_stage:** new, contacted, reply_received, meeting_scheduled, proposal_sent,
  negotiation, won, lost, on_hold

### Owner role labels (used in [11 · Task Breakdown](./11-task-breakdown.md))

`[BE]` api-backend · `[FE]` web-frontend · `[EXT]` chrome-extension · `[AI]` ai-engine ·
`[INFRA]` platform-infra · `[DOCS]` documentation · `[QA]` quality-assurance
