-- Radar OIP — Phase 1 schema (full-Supabase model).
-- Identity = Supabase auth.users. All domain data is org-scoped and protected by RLS
-- (policies in 0003_policies.sql). The thin NestJS service uses the service-role key and
-- bypasses RLS for AI/jobs work.

create extension if not exists citext;
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists vector;

-- Mirror of auth.users for app profile data (auto-created by trigger on signup).
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       citext not null,
  name        text not null default '',
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        citext not null unique,
  settings    jsonb not null default '{}',
  created_by  uuid references auth.users (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- RBAC. organization_id null = shared system role.
create table public.roles (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  name            text not null,
  slug            text not null,
  is_system       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, slug)
);
-- Unique system-role slugs (organization_id is null).
create unique index roles_system_slug_uidx on public.roles (slug) where organization_id is null;

create table public.permissions (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  description text not null default '',
  category    text not null default 'general',
  created_at  timestamptz not null default now()
);

create table public.role_permissions (
  role_id       uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create type membership_status as enum ('active', 'invited', 'disabled');

create table public.memberships (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  role_id         uuid not null references public.roles (id),
  status          membership_status not null default 'active',
  invited_by      uuid references auth.users (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

create type job_status as enum ('queued', 'running', 'completed', 'failed', 'cancelled', 'retrying');

create table public.job_runs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  queue_name      text not null,
  job_name        text not null,
  entity_type     text,
  entity_id       uuid,
  status          job_status not null default 'queued',
  progress        smallint not null default 0,
  error           text,
  result          jsonb,
  started_at      timestamptz,
  finished_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index job_runs_org_status_idx on public.job_runs (organization_id, status, created_at);

create table public.audit_log (
  id              bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_id        uuid references auth.users (id),
  action          text not null,
  entity_type     text not null,
  entity_id       uuid,
  before          jsonb,
  after           jsonb,
  ip              inet,
  created_at      timestamptz not null default now()
);
create index audit_log_org_idx on public.audit_log (organization_id, created_at);

create table public.activities (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  entity_type     text not null,
  entity_id       uuid not null,
  actor_id        uuid references auth.users (id),
  verb            text not null,
  meta            jsonb not null default '{}',
  created_at      timestamptz not null default now()
);
create index activities_entity_idx on public.activities (organization_id, entity_type, entity_id, created_at);

-- Enable RLS on every app table (policies defined in 0003_policies.sql).
alter table public.profiles        enable row level security;
alter table public.organizations   enable row level security;
alter table public.roles           enable row level security;
alter table public.permissions     enable row level security;
alter table public.role_permissions enable row level security;
alter table public.memberships     enable row level security;
alter table public.job_runs        enable row level security;
alter table public.audit_log       enable row level security;
alter table public.activities      enable row level security;
