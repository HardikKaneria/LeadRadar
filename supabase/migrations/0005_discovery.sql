-- Phase 2 · Discovery storage model (P2-03).
-- Raw-first capture: every channel (extension/manual/csv/api) lands a discovery_batch and
-- its discoveries verbatim before any analysis. AI columns (embedding) stay null until Phase 3.
-- Additive migration — no existing data is touched.

-- Full discovery_source enum (mirror of packages/contracts/src/enums.ts DISCOVERY_SOURCES).
create type discovery_source as enum (
  'linkedin', 'upwork', 'freelancer', 'website', 'referral', 'manual', 'csv',
  'whatsapp', 'email', 'existing_customer', 'conference', 'client_call', 'partnership', 'other'
);

-- discovery_status (mirror of DISCOVERY_STATUSES).
create type discovery_status as enum (
  'new', 'processing', 'analyzed', 'reviewed', 'approved', 'ignored', 'converted'
);

-- How a batch arrived. Distinct from source (the data's origin platform).
create type discovery_channel as enum ('extension', 'manual', 'csv', 'api');

-- Lifecycle of a single capture/import.
create type discovery_batch_status as enum ('pending', 'processing', 'completed', 'failed');

-- One capture or import. Ingestion jobs (P2-04/05) walk a batch's raw items into discoveries.
create table public.discovery_batches (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source          discovery_source not null,
  channel         discovery_channel not null,
  status          discovery_batch_status not null default 'pending',
  parser_version  text,
  raw_blob_url    text,
  item_count      integer not null default 0,
  error           text,
  captured_by     uuid references auth.users (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index discovery_batches_org_idx on public.discovery_batches (organization_id, created_at desc);

-- M2 — raw first. Hint columns are best-effort normalizations of raw_payload; analysis (Phase 3)
-- enriches score/embedding later via ai_analysis.
create table public.discoveries (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  batch_id        uuid references public.discovery_batches (id) on delete set null,
  source          discovery_source not null,
  status          discovery_status not null default 'new',
  raw_payload     jsonb not null,
  title           text,
  description     text,
  company_name    text,
  contact_name    text,
  email           text,
  phone           text,
  website         text,
  country         text,
  budget_hint     numeric(14, 2),
  dedup_hash      text,
  embedding       vector(1536),
  created_by      uuid references auth.users (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

-- Hot path: Inbox lists by status; source/date facets; fuzzy title search; raw_payload lookups.
create index discoveries_org_status_idx on public.discoveries (organization_id, status, created_at desc);
create index discoveries_org_source_idx on public.discoveries (organization_id, source, created_at desc);
create index discoveries_batch_idx on public.discoveries (batch_id);
create index discoveries_raw_payload_gin on public.discoveries using gin (raw_payload);
create index discoveries_title_trgm on public.discoveries using gin (title gin_trgm_ops);
-- Idempotency / fuzzy dedup (P2-04). Null hashes (pre-normalization) are allowed and distinct.
create unique index discoveries_org_dedup_uidx
  on public.discoveries (organization_id, dedup_hash) where dedup_hash is not null;
-- NOTE: ivfflat(embedding) index is deferred to P3-07 — embeddings are null until analysis exists,
-- and ivfflat builds poorly on an empty table.

create trigger discovery_batches_set_updated_at
  before update on public.discovery_batches for each row execute function public.set_updated_at();
create trigger discoveries_set_updated_at
  before update on public.discoveries for each row execute function public.set_updated_at();

-- RLS. Reads gated by discoveries.read; writes happen server-side (service role bypasses RLS).
alter table public.discovery_batches enable row level security;
alter table public.discoveries       enable row level security;

create policy discovery_batches_select_read on public.discovery_batches
  for select using (public.has_permission(organization_id, 'discoveries.read'));

create policy discoveries_select_read on public.discoveries
  for select using (public.has_permission(organization_id, 'discoveries.read'));
