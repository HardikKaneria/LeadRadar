-- Phase 9 · Billing & usage tables (P9-07)

create table if not exists public.billing_plans (
  id                  uuid primary key default gen_random_uuid(),
  provider_product_id text unique,
  name                text not null,
  slug                text not null unique,
  monthly_price       integer not null default 0,
  features            jsonb not null default '[]'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.billing_plans enable row level security;

create policy "billing_plans read all"
  on public.billing_plans for select
  to authenticated
  using (true);

create table if not exists public.billing_subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations (id) on delete cascade,
  plan_id                  uuid not null references public.billing_plans (id),
  provider_subscription_id text unique,
  status                   text not null default 'active',
  current_period_end       timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique(organization_id)
);

alter table public.billing_subscriptions enable row level security;

create policy "billing_subscriptions read org"
  on public.billing_subscriptions for select
  to authenticated
  using (
    organization_id = (select auth.jwt() ->> 'org_id')::uuid
  );

create table if not exists public.usage_limits (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references public.billing_plans (id) on delete cascade,
  resource_type text not null,
  max_value     integer not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique(plan_id, resource_type)
);

alter table public.usage_limits enable row level security;

create policy "usage_limits read all"
  on public.usage_limits for select
  to authenticated
  using (true);

create table if not exists public.billing_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  type            text not null,
  payload         jsonb not null default '{}'::jsonb,
  processed       boolean not null default false,
  created_at      timestamptz not null default now()
);

alter table public.billing_events enable row level security;

-- No policies for billing_events since it's an internal audit log handled by service role.

-- Triggers for updated_at
create trigger billing_plans_updated_at
  before update on public.billing_plans
  for each row execute function public.set_updated_at();

create trigger billing_subscriptions_updated_at
  before update on public.billing_subscriptions
  for each row execute function public.set_updated_at();

create trigger usage_limits_updated_at
  before update on public.usage_limits
  for each row execute function public.set_updated_at();
