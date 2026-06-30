# 06 — Frontend Structure

> Status: this document defines the **target frontend direction for the next major UI pass**.
> The currently shipped web app is still the Ant Design 6 implementation documented in
> [`DESIGN.md`](../DESIGN.md) and [`UIUX.md`](../UIUX.md).
> Do not read this file as evidence that the code has already migrated.

**Target stack:** Next.js (App Router) · React · TypeScript · Tailwind CSS · semantic tokens ·
shadcn/ui-style headless primitives · Radix-style accessibility patterns · TanStack Query
(server state) · Zustand (UI state only).

## Principles

- **Action-first, not dashboard-first.** The home screen exists to answer "what should I do next?"
  before it shows any vanity metrics.
- **Developer-grade precision.** Dense, calm, compact, and explicit. More operator console than CRM.
- **Semantic styling only.** Components consume tokens like `bg-background`, `bg-surface-100`,
  `text-foreground`, `text-muted`, `border-border`, and `bg-brand`; no raw colors in feature code.
- **AI is visible, never theatrical.** Reasons, confidence, prompt/version metadata, and next actions
  are inspectable. AI is not a black box.
- **Composable primitives over framework lock-in.** The design system should be implementable with
  headless primitives and variant-driven components, not a monolithic UI dependency.
- **One shell, many workflows.** Daily Action Center, Inbox, Opportunities, Pipeline, Knowledge,
  Jobs, and Settings all inherit the same shell, page containers, and right-side contextual drawer.

## App shell model

- **Left sidebar:** workspace switcher at the top, primary navigation groups in the middle, settings
  and user controls at the bottom. Collapsible later, but not required for the first pass.
- **Top breadcrumb row:** breadcrumbs first, then context actions, then search/command and user tools.
- **Main content area:** uses page containers (`small`, `default`, `full`) plus `PageSection`
  groupings for cards, tables, and detail stacks.
- **Optional right AI/context drawer:** shared surface for AI explanation, outreach drafting,
  prompt/version metadata, and entity context without leaving the current screen.

## Primary navigation

1. Daily Action Center
2. Discovery Inbox
3. Opportunities
4. Pipeline
5. Tasks
6. Companies
7. Knowledge
8. AI Assistant
9. Jobs
10. Settings

Rules:

- The shell is quiet by default: one active item, one clear primary action, minimal chrome.
- Hidden nav is permission-based. A user should never see actions they cannot take.
- Coming-soon routes can exist in the tree, but they should be clearly labeled instead of feeling broken.

## Route tree (App Router)

```text
app/
├── (auth)/
│   ├── login/page.tsx
│   ├── register/page.tsx
│   └── accept-invite/page.tsx
├── (app)/
│   ├── layout.tsx                     # sidebar + breadcrumb topbar + optional AI drawer
│   ├── page.tsx                       # Daily Action Center
│   ├── inbox/
│   │   ├── page.tsx                   # left filters / list / preview triage UI
│   │   └── [discoveryId]/page.tsx     # full discovery detail + AI explanation
│   ├── opportunities/
│   │   ├── page.tsx                   # ranked opportunity list
│   │   └── [id]/page.tsx              # opportunity detail + assistant drawer
│   ├── pipeline/
│   │   ├── page.tsx                   # lead pipeline overview
│   │   └── [leadId]/page.tsx          # lead workspace: timeline, tasks, notes, outreach
│   ├── tasks/page.tsx
│   ├── companies/
│   │   ├── page.tsx
│   │   └── [id]/page.tsx
│   ├── knowledge/
│   │   ├── page.tsx
│   │   └── forecast/page.tsx
│   ├── assistant/page.tsx             # global AI Assistant workspace
│   ├── capture/page.tsx               # manual + CSV capture
│   ├── jobs/page.tsx
│   └── settings/
│       ├── company-brain/page.tsx     # services, target countries, ICP, bad-lead rules, tone
│       ├── ai/page.tsx                # org BYOK + prompt versions + privacy mode (NOT platform keys)
│       ├── members/page.tsx           # team members + Sales Executive permissions
│       ├── roles-permissions/page.tsx # custom roles, assign permissions, view system roles
│       ├── integrations/page.tsx      # AI providers (BYOK); email/calendar/webhooks later
│       ├── extension/page.tsx         # generate/revoke scoped capture token, status, last batches, parser health
│       ├── security/page.tsx          # sessions, API keys, password/security, data export/delete
│       ├── audit/page.tsx             # audit logs, AI request logs, sensitive changes
│       ├── billing/page.tsx           # plan, usage, AI cost, discovery/seat limits
│       ├── usage/page.tsx             # company + user + feature + AI usage, remaining credits, reset date
│       └── preferences/page.tsx
├── (admin)/                           # MASTER ADMIN ONLY — platform area, gated by platform.* + platform_admins
│   ├── layout.tsx                     # admin shell (separate nav)
│   ├── dashboard/page.tsx             # platform KPIs, AI cost vs revenue, health
│   ├── companies/page.tsx
│   ├── users/page.tsx
│   ├── ai-providers/page.tsx          # ai_provider_accounts
│   ├── ai-routing/page.tsx            # ai_task_routes (model per process)
│   ├── ai-usage/page.tsx              # global usage by company/provider/key/model/process
│   ├── api-keys/page.tsx              # key pool (metadata only — never the secret)
│   ├── jobs/page.tsx                  # all job_runs / failed jobs
│   ├── billing/page.tsx               # plans, subscriptions, revenue
│   ├── audit/page.tsx
│   └── system-health/page.tsx
└── api/
```

## Page primitives

### Breadcrumb row

- Breadcrumbs always render first.
- Optional sub-navigation sits directly below breadcrumbs, not inside the page body.
- Page titles are used only when they add clarity; avoid repetitive heading blocks on every screen.

### Containers

| Container | Use |
|-----------|-----|
| `small` | settings forms, AI provider config, narrow editors |
| `default` | inbox/detail pages, lead workspace, opportunity detail |
| `full` | dense tables, audit logs, jobs, analytics |

### `PageSection`

- Use `PageSection` to group a meaningful chunk of UI: triage filters, activity timeline, value cards,
  AI explanation, or settings fields.
- Sections should have one visual contract: optional eyebrow, compact header, content area, optional footer.

## Screen direction

### Daily Action Center

- The homepage is not a KPI wall.
- Lead with high-value opportunities today, follow-ups due or overdue, urgent actions, expiring opportunities,
  and AI-recommended moves.
- Every action card must answer:
  - What should I do?
  - Why should I do it?
  - What is the potential value?
  - What is the next action?

### Discovery Inbox

- Email-like triage layout: left filter column, middle list, right preview panel.
- Preview panel includes AI analysis, confidence, reasoning, and approve/ignore/re-analyze actions.
- Bulk actions should feel fast and quiet, not modal-heavy.

### Opportunity Detail

- Surface score, heat, priority, potential value, AI explanation, recommended action, similar opportunities,
  outreach history, and the contextual AI Assistant drawer.
- The page should make the next move obvious before it shows deep metadata.

### Lead Workspace

- Show stage, next action, tasks, timeline, notes, outreach, proposal state, and AI help in one workspace.
- No active lead without a next action. The UI should make this constraint impossible to miss.

### Knowledge

- Prioritize conversion by source, conversion by service, win/loss reasons, demand radar, pattern matching,
  and revenue forecast.
- Charts support decisions; they do not dominate the page.

### Settings

- Compact developer-SaaS layout with grouped cards, concise field descriptions, and a fixed save/cancel footer
  when edits are pending.
- Key settings areas: Company Brain, AI (BYOK + prompts + privacy mode), Members, Roles & Permissions,
  Integrations, Extension, Security, Audit, Billing, Usage, Preferences.

### Role-based homepage (Daily Action Center)

The org homepage renders to the viewer's permission scope (see
[15 · Roles & Permissions](./15-roles-permissions-and-admin-system.md)):

- **Company Admin** — capture & conversion by Sales Executive, approved/ignored counts, conversion
  rate by user, usage by user, AI credits, best sources/services, follow-up performance.
- **Sales Executive** (the primary daily user) — my best opportunities today, my captures waiting
  for AI, my high-score discoveries, my follow-ups due/overdue, my outreach drafts, my usage.
- **Master Admin** uses the separate `/admin` area, not the org homepage.

## Component layers

```text
components/
├── ui/             # base primitives, variants, tokens, slots
├── layout/         # sidebar, topbar, breadcrumb row, page container, page section
├── action-center/  # action cards, follow-up rails, urgency lists
├── discovery/      # filters, list rows, preview panels, source/status badges
├── opportunity/    # score badges, heat indicators, value cards, explanation panels
├── pipeline/       # stage boards, lead summary cards, stage guard surfaces
├── tasks/          # queue tabs, due pills, task rows
├── companies/      # company summaries, contact panels, relationship surfaces
├── knowledge/      # insight cards, charts, win/loss panels, forecast tables
├── ai/             # assistant drawer, explanation cards, confidence badges, prompt metadata
├── jobs/           # compact job tables, progress rows, log drawers
├── settings/       # settings cards, security tables, billing usage, audit filters
└── common/         # empty states, error boundaries, loading states, permission gates
```

## State & data

```text
lib/
├── api/            # typed clients and query helpers
├── auth/           # session, org context, permission checks
├── stores/         # zustand: command palette, drawer state, local screen prefs only
└── format/         # money, dates, score/status/priority helpers
```

- **Server state:** TanStack Query. Key queries by org + filters + pagination. Mutations invalidate precisely.
- **UI state only:** Zustand. Use it for drawer visibility, local display preferences, and command-palette state.
  Never put server data or auth state in Zustand.
- **Forms:** schema-driven validation; inline error states; semantic field wrappers; consistent save/cancel footers.
- **Async work:** long-running operations still resolve around `job_id`, with inline status + dedicated Jobs visibility.

## Delivery order before a broad rewrite

- Define the design system in [`13-design-system.md`](./13-design-system.md).
- Build the shared component primitives and variants.
- Refresh the shell before rewriting key screens.
- Lock wireframes for Action Center, Inbox, Opportunity Detail, Lead Workspace, Knowledge, and Settings.
- Run accessibility and responsive QA as a first-class task, not a cleanup step.
