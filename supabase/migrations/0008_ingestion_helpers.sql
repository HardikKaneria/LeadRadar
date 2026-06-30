-- Phase 2 · Ingestion helpers (P2-04).
-- Keep discovery dedup logic close to the data so the worker can use exact-hash idempotency
-- plus pg_trgm-backed fuzzy matching without hand-assembling SQL in the app layer.

create or replace function public.ingest_discovery_candidate(
  p_org uuid,
  p_batch uuid,
  p_source public.discovery_source,
  p_raw_payload jsonb,
  p_title text default null,
  p_description text default null,
  p_company_name text default null,
  p_contact_name text default null,
  p_email text default null,
  p_phone text default null,
  p_website text default null,
  p_country text default null,
  p_budget_hint numeric default null,
  p_dedup_hash text default null,
  p_created_by uuid default null
)
returns table (
  decision text,
  discovery_id uuid,
  matched_discovery_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exact uuid;
  v_fuzzy uuid;
  v_inserted uuid;
begin
  if p_dedup_hash is not null then
    select d.id
      into v_exact
      from public.discoveries d
     where d.organization_id = p_org
       and d.deleted_at is null
       and d.dedup_hash = p_dedup_hash
     limit 1;

    if v_exact is not null then
      return query select 'exact_duplicate'::text, null::uuid, v_exact;
      return;
    end if;
  end if;

  if p_website is not null
     or p_email is not null
     or p_phone is not null
     or p_title is not null
     or p_company_name is not null then
    select d.id
      into v_fuzzy
      from public.discoveries d
     where d.organization_id = p_org
       and d.deleted_at is null
       and (
         (p_website is not null and d.website is not null and lower(d.website) = lower(p_website))
         or (p_email is not null and d.email is not null and lower(d.email) = lower(p_email))
         or (p_phone is not null and d.phone is not null and d.phone = p_phone)
         or (
           p_company_name is not null
           and d.company_name is not null
           and similarity(lower(d.company_name), lower(p_company_name)) >= 0.82
           and p_title is not null
           and d.title is not null
           and similarity(lower(d.title), lower(p_title)) >= 0.72
         )
         or (
           p_title is not null
           and d.title is not null
           and similarity(lower(d.title), lower(p_title)) >= 0.88
         )
       )
     order by greatest(
       case
         when p_title is not null and d.title is not null
           then similarity(lower(d.title), lower(p_title))
         else 0
       end,
       case
         when p_company_name is not null and d.company_name is not null
           then similarity(lower(d.company_name), lower(p_company_name))
         else 0
       end
     ) desc,
     d.created_at desc
     limit 1;

    if v_fuzzy is not null then
      return query select 'fuzzy_duplicate'::text, null::uuid, v_fuzzy;
      return;
    end if;
  end if;

  begin
    insert into public.discoveries (
      organization_id,
      batch_id,
      source,
      raw_payload,
      title,
      description,
      company_name,
      contact_name,
      email,
      phone,
      website,
      country,
      budget_hint,
      dedup_hash,
      created_by
    )
    values (
      p_org,
      p_batch,
      p_source,
      p_raw_payload,
      p_title,
      p_description,
      p_company_name,
      p_contact_name,
      p_email,
      p_phone,
      p_website,
      p_country,
      p_budget_hint,
      p_dedup_hash,
      p_created_by
    )
    returning id into v_inserted;
  exception
    when unique_violation then
      if p_dedup_hash is not null then
        select d.id
          into v_exact
          from public.discoveries d
         where d.organization_id = p_org
           and d.deleted_at is null
           and d.dedup_hash = p_dedup_hash
         limit 1;

        if v_exact is not null then
          return query select 'exact_duplicate'::text, null::uuid, v_exact;
          return;
        end if;
      end if;

      raise;
  end;

  return query select 'inserted'::text, v_inserted, null::uuid;
end;
$$;
