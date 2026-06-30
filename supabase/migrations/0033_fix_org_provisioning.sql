-- Enforce that only platform admins can create organizations, and DO NOT auto-add them to the organization
create or replace function public.create_organization(org_name text)
returns public.organizations
language plpgsql security definer set search_path = public as $$
declare
  new_org public.organizations;
  base_slug text;
  final_slug text;
  n int := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not exists (select 1 from public.platform_admins where user_id = auth.uid()) then
    raise exception 'only platform administrators can create organizations';
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

  -- Master Admin is NOT added to the organization automatically.
  -- The provision endpoint will invite the actual owner separately.

  return new_org;
end;
$$;
