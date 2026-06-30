# Radar OIP

**Radar OIP** is an AI-powered **Opportunity Intelligence Platform** — not a CRM. It helps
agencies, freelancers, and service businesses discover, analyze, prioritize, and convert
business opportunities. Its core question: _"What should I do next that has the highest
chance of generating revenue?"_

> Full design lives in [`docs/architecture/`](docs/architecture/README.md). Product features:
> [`docs/architecture/FEATURE.md`](docs/architecture/FEATURE.md). Target frontend direction:
> [`docs/architecture/13-design-system.md`](docs/architecture/13-design-system.md). Agent operating manual:
> [`AGENTS.md`](AGENTS.md).

## Monorepo layout

```
apps/
  api/        Thin NestJS — Supabase-JWT auth, jobs, health, (AI/webhooks later)
  worker/     BullMQ job processors (service-role Supabase client)
  web/        Next.js (App Router) dashboard — Supabase auth + RLS data access
extension/    Chrome MV3 capture (Phase 2 — placeholder)
packages/
  contracts/  Shared enums, DTOs (zod), RBAC permission catalog
  core/        Config, errors, tenant context, crypto (framework-agnostic)
  supabase/    Supabase client factory (service/user) + DB types
  ai/          AI Gateway abstraction (interfaces; impl in Phase 3)
supabase/migrations/   SQL schema + functions + RLS policies + seed
```

## Tech stack

Supabase (Auth + Postgres + RLS) · Next.js 15 · thin NestJS · Redis + BullMQ · TypeScript ·
Tailwind. Multi-tenant via RLS; RBAC; AI provider-agnostic. See
[`docs/architecture/13-supabase-integration.md`](docs/architecture/13-supabase-integration.md).

## Frontend direction

The repo currently ships a web UI built on Ant Design 6. The **next frontend pass** is documented
before code changes in [`docs/architecture/06-frontend-structure.md`](docs/architecture/06-frontend-structure.md)
and [`docs/architecture/13-design-system.md`](docs/architecture/13-design-system.md): dark-first,
Supabase-inspired but original Radar styling, Tailwind + semantic tokens, shadcn/ui-style headless
primitives, TanStack Query for server state, and Zustand for UI state only.

## Prerequisites

- Node 20+ (`.nvmrc`), pnpm 9+
- A **Supabase project** (rotate its keys first — see Security), Supabase CLI (for migrations)
- Docker (for Redis) — or any Redis instance

## Quick start

```bash
# 1. Install
pnpm install

# 2. Environment — fill in your (rotated) Supabase URL + keys
cp .env.example .env

# 3. Apply the database schema + RLS + seed to your Supabase project
supabase login && supabase link --project-ref <your-ref>
pnpm db:push                 # applies supabase/migrations/* (or paste them in the SQL editor)
pnpm db:types                # optional: regenerate packages/supabase DB types

# 4. Create the private Storage bucket used by CSV imports
# Supabase dashboard → Storage → New bucket → name it "discovery-imports"

# 5. Redis for the queue
pnpm infra:up

# 6. Run (separate terminals)
pnpm dev:api      # http://localhost:4000  (Swagger at /api/docs)
pnpm dev:worker
pnpm dev:web      # http://localhost:3000
```

In Supabase Auth settings, disabling "Confirm email" makes local signup instant. Then open
http://localhost:3000 → **Create workspace** (you become org owner) → Daily Action Center →
**Jobs** → **Run demo job** to see the async pipeline (web → API → BullMQ → worker → `job_runs`).

## What works today (Phase 1 · Foundation, full-Supabase)

- **Supabase Auth** (email/password; OAuth/magic-link available) — signup auto-creates a profile;
  `create_organization` RPC bootstraps the owner workspace.
- Data-driven **RBAC** enforced by **Postgres RLS** (`is_member` / `has_permission`); system roles
  owner/admin/manager/member/viewer; tenant isolation by membership.
- Thin NestJS: Supabase-JWT auth guard, `/jobs` Job Status API, health.
- Async pipeline: `job_runs` + worker (service-role) processing demo jobs.
- Next.js shell with Supabase session guard + RBAC-filtered navigation.
- CI (build, lint, typecheck, test) — static checks (DB is Supabase cloud).

See the roadmap for Phases 2–9: [`docs/architecture/10-roadmap.md`](docs/architecture/10-roadmap.md).

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm build` / `lint` / `typecheck` / `test` | Run across all workspaces |
| `pnpm dev:api` / `dev:worker` / `dev:web` | Run a single app in watch mode |
| `pnpm db:push` / `db:reset` / `db:types` | Apply/reset Supabase migrations; regenerate DB types |
| `pnpm infra:up` / `infra:down` | Start/stop Redis via Docker |

## Security

Secrets live only in `.env` (gitignored). Never commit credentials. See data handling and
deletion rules in [`docs/architecture/12-data-lifecycle-and-governance.md`](docs/architecture/12-data-lifecycle-and-governance.md).
