-- Phase 6 · AI Sales Assistant — Outreach & conversation model (P6-01).
-- Persistent outreach history (M11): `conversations` thread `outreach_messages` per channel and
-- hold an AI-maintained rolling summary; `message_templates` are reusable tone-controlled drafts
-- keyed by service + stage. `record_outreach_message` logs a message and create-or-bumps its
-- conversation atomically. Reads are gated by `leads.read`, writes by `leads.write` (outreach is
-- part of working a lead/opportunity). AI generation/provenance writing is P6-02; UI is P6-04/05.
-- See docs/architecture/04-database-schema.md §4.6.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'outreach_channel') then
    create type public.outreach_channel as enum (
      'email', 'linkedin', 'whatsapp', 'upwork', 'freelancer', 'phone', 'meeting', 'other'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'outreach_direction') then
    create type public.outreach_direction as enum ('outbound', 'inbound', 'internal_note');
  end if;
  if not exists (select 1 from pg_type where typname = 'outreach_status') then
    create type public.outreach_status as enum ('draft', 'ready', 'sent', 'failed', 'received');
  end if;
end
$$;

-- ── conversations ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.conversations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  opportunity_id   uuid references public.opportunities (id) on delete set null,
  lead_id          uuid references public.leads (id) on delete set null,
  company_id       uuid references public.companies (id) on delete set null,
  contact_id       uuid references public.contacts (id) on delete set null,
  channel          public.outreach_channel not null,
  summary          text,
  last_message_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create index if not exists conversations_lead_idx
  on public.conversations (organization_id, lead_id);
create index if not exists conversations_opportunity_idx
  on public.conversations (organization_id, opportunity_id);
create index if not exists conversations_recent_idx
  on public.conversations (organization_id, last_message_at desc);

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

-- ── message_templates ──────────────────────────────────────────────────────────────────────────
create table if not exists public.message_templates (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  name             text not null,
  channel          public.outreach_channel not null,
  service          text,
  stage            public.lead_stage,
  subject_template text,
  body_template    text not null,
  tone             text,
  is_active        boolean not null default true,
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create index if not exists message_templates_active_idx
  on public.message_templates (organization_id, is_active);
create index if not exists message_templates_channel_idx
  on public.message_templates (organization_id, channel);

drop trigger if exists message_templates_set_updated_at on public.message_templates;
create trigger message_templates_set_updated_at
  before update on public.message_templates
  for each row execute function public.set_updated_at();

-- ── outreach_messages ──────────────────────────────────────────────────────────────────────────
create table if not exists public.outreach_messages (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id) on delete cascade,
  conversation_id      uuid references public.conversations (id) on delete cascade,
  opportunity_id       uuid references public.opportunities (id) on delete set null,
  lead_id              uuid references public.leads (id) on delete set null,
  contact_id           uuid references public.contacts (id) on delete set null,
  channel              public.outreach_channel not null,
  direction            public.outreach_direction not null,
  status               public.outreach_status not null default 'draft',
  subject              text,
  body                 text not null,
  is_ai_generated      boolean not null default false,
  ai_request_id        uuid references public.ai_requests (id) on delete set null,
  message_template_id  uuid references public.message_templates (id) on delete set null,
  sent_at              timestamptz,
  opened_at            timestamptz,
  replied_at           timestamptz,
  created_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz
);

create index if not exists outreach_messages_lead_idx
  on public.outreach_messages (organization_id, lead_id, created_at desc);
create index if not exists outreach_messages_opportunity_idx
  on public.outreach_messages (organization_id, opportunity_id);
create index if not exists outreach_messages_status_idx
  on public.outreach_messages (organization_id, status);
create index if not exists outreach_messages_conversation_idx
  on public.outreach_messages (organization_id, conversation_id, created_at);

drop trigger if exists outreach_messages_set_updated_at on public.outreach_messages;
create trigger outreach_messages_set_updated_at
  before update on public.outreach_messages
  for each row execute function public.set_updated_at();

-- ── RLS — outreach is read with leads.read, written with leads.write ─────────────────────────────
alter table public.conversations enable row level security;
alter table public.message_templates enable row level security;
alter table public.outreach_messages enable row level security;

create policy conversations_select on public.conversations
  for select using (public.has_permission(organization_id, 'leads.read'));
create policy conversations_insert on public.conversations
  for insert with check (public.has_permission(organization_id, 'leads.write'));
create policy conversations_update on public.conversations
  for update using (public.has_permission(organization_id, 'leads.write'))
  with check (public.has_permission(organization_id, 'leads.write'));

create policy message_templates_select on public.message_templates
  for select using (public.has_permission(organization_id, 'leads.read'));
create policy message_templates_insert on public.message_templates
  for insert with check (public.has_permission(organization_id, 'leads.write'));
create policy message_templates_update on public.message_templates
  for update using (public.has_permission(organization_id, 'leads.write'))
  with check (public.has_permission(organization_id, 'leads.write'));

create policy outreach_messages_select on public.outreach_messages
  for select using (public.has_permission(organization_id, 'leads.read'));
create policy outreach_messages_insert on public.outreach_messages
  for insert with check (public.has_permission(organization_id, 'leads.write'));
create policy outreach_messages_update on public.outreach_messages
  for update using (public.has_permission(organization_id, 'leads.write'))
  with check (public.has_permission(organization_id, 'leads.write'));

-- Atomic message logging + threading: reuse the open conversation for (org, channel, lead/
-- opportunity) or create one, insert the message, and bump the conversation's last_message_at.
-- SECURITY DEFINER + explicit permission check so it is safe to call from the RLS-bound web client.
create or replace function public.record_outreach_message(
  p_channel public.outreach_channel,
  p_direction public.outreach_direction,
  p_body text,
  p_lead uuid default null,
  p_opportunity uuid default null,
  p_contact uuid default null,
  p_conversation uuid default null,
  p_subject text default null,
  p_status public.outreach_status default 'sent',
  p_is_ai_generated boolean default false,
  p_ai_request_id uuid default null,
  p_message_template_id uuid default null
)
returns public.outreach_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_conversation public.conversations;
  v_message public.outreach_messages;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- Resolve the org from the conversation or the linked lead/opportunity.
  if p_conversation is not null then
    select * into v_conversation from public.conversations
    where id = p_conversation and deleted_at is null
    for update;
    if not found then
      raise exception 'conversation not found';
    end if;
    v_org := v_conversation.organization_id;
  elsif p_lead is not null then
    select organization_id into v_org from public.leads where id = p_lead and deleted_at is null;
  elsif p_opportunity is not null then
    select organization_id into v_org from public.opportunities where id = p_opportunity and deleted_at is null;
  end if;

  if v_org is null then
    raise exception 'a conversation, lead, or opportunity is required to log a message';
  end if;

  if not public.has_permission(v_org, 'leads.write') then
    raise exception 'insufficient permissions';
  end if;

  -- Find or create the conversation thread for this channel + entity.
  if v_conversation.id is null then
    select * into v_conversation from public.conversations
    where organization_id = v_org
      and channel = p_channel
      and deleted_at is null
      and ((p_lead is not null and lead_id = p_lead)
        or (p_lead is null and p_opportunity is not null and opportunity_id = p_opportunity))
    order by last_message_at desc nulls last
    limit 1;

    if v_conversation.id is null then
      insert into public.conversations (
        organization_id, opportunity_id, lead_id, contact_id, channel, last_message_at
      )
      values (v_org, p_opportunity, p_lead, p_contact, p_channel, now())
      returning * into v_conversation;
    end if;
  end if;

  insert into public.outreach_messages (
    organization_id, conversation_id, opportunity_id, lead_id, contact_id,
    channel, direction, status, subject, body,
    is_ai_generated, ai_request_id, message_template_id,
    sent_at, created_by
  )
  values (
    v_org, v_conversation.id, p_opportunity, p_lead, p_contact,
    p_channel, p_direction, p_status, p_subject, p_body,
    p_is_ai_generated, p_ai_request_id, p_message_template_id,
    case when p_status = 'sent' then now() else null end, auth.uid()
  )
  returning * into v_message;

  update public.conversations
  set last_message_at = now()
  where id = v_conversation.id;

  return v_message;
end;
$$;
