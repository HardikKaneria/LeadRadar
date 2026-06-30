-- Phase 6 · AI Sales Assistant — Proposal Generator (P6-03).
-- First-class proposal lifecycle (M11), separate from generic notes. The `generate-proposal` job
-- runs the `@radar/ai` proposal agent and writes the drafted content here (status `ready`);
-- operators then move it through send/accept/reject. `content` holds the structured draft; a rendered
-- file artifact (`file_attachment_id` → attachments) and the `proposal_ready` notification are
-- follow-ups. Reads are gated by `leads.read`, writes by `leads.write`.
-- See docs/architecture/04-database-schema.md §4.6.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'proposal_status') then
    create type public.proposal_status as enum (
      'draft', 'ready', 'sent', 'accepted', 'rejected', 'expired'
    );
  end if;
end
$$;

create table if not exists public.proposals (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  lead_id             uuid references public.leads (id) on delete set null,
  opportunity_id      uuid references public.opportunities (id) on delete set null,
  title               text not null,
  status              public.proposal_status not null default 'draft',
  value               numeric(14, 2),
  currency            text,
  content             jsonb,
  file_attachment_id  uuid references public.attachments (id) on delete set null,
  ai_request_id       uuid references public.ai_requests (id) on delete set null,
  created_by          uuid references auth.users (id) on delete set null,
  sent_at             timestamptz,
  accepted_at         timestamptz,
  rejected_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

create index if not exists proposals_lead_idx
  on public.proposals (organization_id, lead_id);
create index if not exists proposals_opportunity_idx
  on public.proposals (organization_id, opportunity_id);
create index if not exists proposals_status_idx
  on public.proposals (organization_id, status, created_at desc);

drop trigger if exists proposals_set_updated_at on public.proposals;
create trigger proposals_set_updated_at
  before update on public.proposals
  for each row execute function public.set_updated_at();

alter table public.proposals enable row level security;

create policy proposals_select on public.proposals
  for select using (public.has_permission(organization_id, 'leads.read'));
create policy proposals_insert on public.proposals
  for insert with check (public.has_permission(organization_id, 'leads.write'));
create policy proposals_update on public.proposals
  for update using (public.has_permission(organization_id, 'leads.write'))
  with check (public.has_permission(organization_id, 'leads.write'));
