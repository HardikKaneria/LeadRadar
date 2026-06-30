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

  -- Use master_admin as the owner equivalent in v3
  select id into owner_role_id from public.roles where organization_id is null and slug = 'master_admin';
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
