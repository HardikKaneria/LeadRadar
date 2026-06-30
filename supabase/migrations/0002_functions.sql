-- Helper functions, triggers, and the org-bootstrap RPC.

-- updated_at maintenance
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at      before update on public.profiles      for each row execute function public.set_updated_at();
create trigger organizations_set_updated_at before update on public.organizations for each row execute function public.set_updated_at();
create trigger roles_set_updated_at         before update on public.roles         for each row execute function public.set_updated_at();
create trigger memberships_set_updated_at   before update on public.memberships   for each row execute function public.set_updated_at();
create trigger job_runs_set_updated_at      before update on public.job_runs      for each row execute function public.set_updated_at();

-- Is the current user an active member of this org?
create or replace function public.is_member(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = org
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

-- Does the current user hold a given permission key in this org?
create or replace function public.has_permission(org uuid, perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.memberships m
    join public.role_permissions rp on rp.role_id = m.role_id
    join public.permissions p on p.id = rp.permission_id
    where m.organization_id = org
      and m.user_id = auth.uid()
      and m.status = 'active'
      and p.key = perm
  );
$$;

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Atomically create an organization and make the caller its owner.
-- security definer avoids the RLS chicken-and-egg of inserting org + first membership.
create or replace function public.create_organization(org_name text)
returns public.organizations
language plpgsql security definer set search_path = public as $$
declare
  new_org public.organizations;
  owner_role_id uuid;
  base_slug text;
  final_slug text;
  n int := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select id into owner_role_id from public.roles where organization_id is null and slug = 'owner';
  if owner_role_id is null then
    raise exception 'system roles not seeded';
  end if;

  base_slug := coalesce(nullif(regexp_replace(lower(org_name), '[^a-z0-9]+', '-', 'g'), ''), 'org');
  base_slug := trim(both '-' from base_slug);
  final_slug := base_slug;
  while exists (select 1 from public.organizations where slug = final_slug) loop
    n := n + 1;
    final_slug := base_slug || '-' || n::text;
  end loop;

  insert into public.organizations (name, slug, created_by)
  values (org_name, final_slug, auth.uid())
  returning * into new_org;

  insert into public.memberships (organization_id, user_id, role_id, status)
  values (new_org.id, auth.uid(), owner_role_id, 'active');

  return new_org;
end;
$$;
