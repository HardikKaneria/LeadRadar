do $$
declare
  r_sales_exec uuid;
begin
  select id into r_sales_exec from public.roles where slug = 'sales_executive' and organization_id is null;

  if r_sales_exec is not null then
    -- Clear existing permissions for sales executive
    delete from public.role_permissions where role_id = r_sales_exec;

    -- Grant the new broader operational permissions
    insert into public.role_permissions (role_id, permission_id)
    select r_sales_exec, id from public.permissions
    where key in (
      'discoveries.read',
      'discoveries.write',
      'discoveries.approve',
      'opportunities.read',
      'opportunities.write',
      'leads.read',
      'leads.write',
      'tasks.manage',
      'ai.use',
      'usage.read_own',
      'extension.use'
    );
  end if;
end;
$$;
