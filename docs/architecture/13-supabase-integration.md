# 13 — Supabase Integration (auth + database + RLS)

> **This document supersedes the auth and data-access sections of docs 02, 05, 07, and 09.**
> Decision: [[D-006]] (`docs/agent/DECISIONS.md`). Radar OIP uses **full Supabase** — identity,
> Postgres database, and Row-Level Security — with a thin NestJS service for AI/jobs/webhooks.

## Model

```
Web (Next.js + supabase-js)
   │  signUp / signInWithPassword / session         direct CRUD (RLS-enforced)
   ▼                                                       │
Supabase Auth (GoTrue) ── issues JWT ──► Supabase Postgres ◄── RLS policies
   │                                          ▲
   │ Bearer JWT (+ x-organization-id)         │ service-role (bypasses RLS)
   ▼                                          │
Thin NestJS API  ── verify getUser() ─────────┘     Worker (BullMQ) ── service-role ──┘
   • jobs (job_runs), health, future AI/webhooks
```

## Responsibilities

| Concern | Where |
|---------|-------|
| Sign up / sign in / sessions / password reset / OAuth | Supabase Auth via `supabase-js` (web) |
| User identity | `auth.users` (Supabase) mirrored to `public.profiles` via trigger |
| Domain CRUD (orgs, members, later discoveries/leads…) | Web → `supabase-js` directly, enforced by RLS |
| Tenant isolation + permissions | Postgres **RLS** (`is_member`, `has_permission`) |
| Org bootstrap | `create_organization(org_name)` SQL RPC (SECURITY DEFINER) |
| AI orchestration, queues, webhooks, jobs | Thin NestJS (`apps/api`) + worker, **service-role** key |
| Schema & migrations | `supabase/migrations/*.sql` (no Prisma) |

## Auth flow

1. Web `supabase.auth.signUp/signInWithPassword` → Supabase returns a session (JWT).
2. A trigger (`handle_new_user`) creates a `profiles` row on signup.
3. New workspace: web calls `supabase.rpc('create_organization', { org_name })` → creates the
   org + the caller's **owner** membership atomically.
4. For thin-API calls, web sends `Authorization: Bearer <access_token>` + `x-organization-id`.
   `SupabaseAuthGuard` validates the token (`auth.getUser`) and loads the caller's permission
   keys for that org; `@RequirePermission(...)` still gates routes (checked in code because the
   service-role client bypasses RLS).

## RLS design (`supabase/migrations/0003_policies.sql`)

- **Tenant isolation:** rows are visible when `is_member(organization_id)` is true.
- **Permissioned writes:** mutations require `has_permission(organization_id, 'key')`.
- Helpers are `SECURITY DEFINER` (owned by a role that bypasses RLS) so they don't recurse
  through the policies that call them — the standard Supabase pattern.
- `permissions` is a read-only catalog for authenticated users; system roles have
  `organization_id = null`.

## Migrations

```
supabase/migrations/
  0001_schema.sql     extensions, tables, RLS enabled
  0002_functions.sql  set_updated_at, is_member, has_permission, handle_new_user, create_organization
  0003_policies.sql   RLS policies
  0004_seed.sql       permission catalog + system roles + grants (mirror of packages/contracts)
```

Apply with the Supabase CLI (`supabase link` then `pnpm db:push`) or paste into the SQL editor
in order. Regenerate typed DB types with `pnpm db:types` after schema changes.

## Keys & safety

- **anon key** → web (`NEXT_PUBLIC_SUPABASE_ANON_KEY`), RLS-enforced.
- **service-role key** → server only (`SUPABASE_SERVICE_ROLE_KEY` in api + worker). Never ship to
  the browser.
- ⚠️ The previous project's keys are in git history — **rotate** anon + service-role + DB password
  before connecting (T-006).

## What carried over vs. changed

- **Kept:** RBAC model (roles/permissions/role_permissions), multi-tenancy, job_runs + Job API,
  BullMQ worker, the `@radar/contracts` permission catalog, the canonical enums.
- **Changed:** auth is Supabase (no custom JWT/argon2); data access is supabase-js + RLS (no
  Prisma); `packages/db` → `packages/supabase` (client factory + DB types); NestJS is now thin.
