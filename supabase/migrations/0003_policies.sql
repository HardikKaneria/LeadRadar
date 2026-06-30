-- RLS policies. Tenant isolation = membership; fine-grained writes = has_permission().
-- The service-role key (thin NestJS + worker) bypasses RLS entirely.

-- profiles: a user manages only their own profile.
create policy profiles_select_own on public.profiles for select using (id = auth.uid());
create policy profiles_update_own on public.profiles for update using (id = auth.uid());

-- organizations: members can read; create via create_organization() RPC; owners/admins update.
create policy orgs_select_member on public.organizations
  for select using (public.is_member(id));
create policy orgs_update_manage on public.organizations
  for update using (public.has_permission(id, 'members.manage'));

-- memberships: members can see their org's roster; members.manage can write.
create policy memberships_select_member on public.memberships
  for select using (public.is_member(organization_id));
create policy memberships_write_manage on public.memberships
  for all using (public.has_permission(organization_id, 'members.manage'))
  with check (public.has_permission(organization_id, 'members.manage'));

-- roles: system roles + the org's roles are readable by members; members.manage can write org roles.
create policy roles_select on public.roles
  for select using (organization_id is null or public.is_member(organization_id));
create policy roles_write_manage on public.roles
  for all using (organization_id is not null and public.has_permission(organization_id, 'members.manage'))
  with check (organization_id is not null and public.has_permission(organization_id, 'members.manage'));

-- permissions: read-only catalog for any authenticated user.
create policy permissions_select on public.permissions
  for select to authenticated using (true);

-- role_permissions: readable if the role is a system role or in the user's org.
create policy role_permissions_select on public.role_permissions
  for select using (
    exists (
      select 1 from public.roles r
      where r.id = role_id
        and (r.organization_id is null or public.is_member(r.organization_id))
    )
  );
create policy role_permissions_write_manage on public.role_permissions
  for all using (
    exists (
      select 1 from public.roles r
      where r.id = role_id
        and r.organization_id is not null
        and public.has_permission(r.organization_id, 'members.manage')
    )
  )
  with check (
    exists (
      select 1 from public.roles r
      where r.id = role_id
        and r.organization_id is not null
        and public.has_permission(r.organization_id, 'members.manage')
    )
  );

-- job_runs / audit_log / activities: members read; writes happen server-side (service role).
create policy job_runs_select_member on public.job_runs
  for select using (public.is_member(organization_id));

create policy audit_log_select_audit on public.audit_log
  for select using (public.has_permission(organization_id, 'audit.read'));

create policy activities_select_member on public.activities
  for select using (public.is_member(organization_id));
