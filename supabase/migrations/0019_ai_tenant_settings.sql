-- Phase 3 · Tenant AI settings parity (T-009).
-- Adds org-owned BYOK provider settings plus persisted `organizations.settings.privacy_mode`.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'integration_type') then
    create type public.integration_type as enum (
      'ai_provider',
      'email',
      'calendar',
      'storage',
      'webhook',
      'extension'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'integration_status') then
    create type public.integration_status as enum ('connected', 'disconnected', 'error');
  end if;
end
$$;

create table if not exists public.integration_accounts (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete cascade,
  provider              text not null,
  type                  public.integration_type not null default 'ai_provider',
  status                public.integration_status not null default 'disconnected',
  encrypted_credentials jsonb not null default '{}'::jsonb,
  settings              jsonb not null default '{}'::jsonb,
  connected_by          uuid references auth.users (id) on delete set null,
  connected_at          timestamptz,
  last_checked_at       timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (organization_id, provider, type)
);

create index if not exists integration_accounts_org_type_idx
  on public.integration_accounts (organization_id, type, created_at desc);

drop trigger if exists integration_accounts_set_updated_at on public.integration_accounts;
create trigger integration_accounts_set_updated_at
  before update on public.integration_accounts
  for each row execute function public.set_updated_at();

alter table public.integration_accounts enable row level security;

drop policy if exists "integration_accounts select member" on public.integration_accounts;
create policy "integration_accounts select member"
  on public.integration_accounts
  for select using (public.is_member(organization_id));

drop policy if exists "integration_accounts write manage" on public.integration_accounts;
create policy "integration_accounts write manage"
  on public.integration_accounts
  for all using (
    public.has_permission(organization_id, 'integrations.manage')
    or (
      type = 'ai_provider'
      and public.has_permission(organization_id, 'ai.settings.manage')
    )
  )
  with check (
    public.has_permission(organization_id, 'integrations.manage')
    or (
      type = 'ai_provider'
      and public.has_permission(organization_id, 'ai.settings.manage')
    )
  );

update public.organizations
set settings = jsonb_set(
  coalesce(settings, '{}'::jsonb),
  '{privacy_mode}',
  '"redact_pii_before_ai"'::jsonb,
  true
)
where not coalesce(settings, '{}'::jsonb) ? 'privacy_mode';
