create table if not exists public.extension_tokens (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  name            text not null,
  token_hash      text not null unique,
  scopes          text[] not null default array['discovery.capture', 'discovery.read_own_batches']::text[],
  last_used_at    timestamptz,
  expires_at      timestamptz,
  revoked_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists extension_tokens_org_user_idx
  on public.extension_tokens (organization_id, user_id, created_at desc);

create index if not exists extension_tokens_active_idx
  on public.extension_tokens (organization_id, revoked_at, expires_at);

alter table public.extension_tokens enable row level security;

drop trigger if exists extension_tokens_set_updated_at on public.extension_tokens;
create trigger extension_tokens_set_updated_at
  before update on public.extension_tokens
  for each row execute function public.set_updated_at();

drop policy if exists extension_tokens_select_extension on public.extension_tokens;
create policy extension_tokens_select_extension on public.extension_tokens
  for select using (public.has_permission(organization_id, 'extension.use'));

drop policy if exists extension_tokens_write_extension on public.extension_tokens;
create policy extension_tokens_write_extension on public.extension_tokens
  for all using (public.has_permission(organization_id, 'extension.use'))
  with check (public.has_permission(organization_id, 'extension.use'));
