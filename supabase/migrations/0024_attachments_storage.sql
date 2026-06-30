insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

create policy "Members can read attachments"
on storage.objects for select
to authenticated
using (
  bucket_id = 'attachments'
  and public.has_permission((string_to_array(name, '/'))[1]::uuid, 'opportunities.read')
);

create policy "Members can upload attachments"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'attachments'
  and public.has_permission((string_to_array(name, '/'))[1]::uuid, 'opportunities.write')
);

create policy "Members can update attachments"
on storage.objects for update
to authenticated
using (
  bucket_id = 'attachments'
  and public.has_permission((string_to_array(name, '/'))[1]::uuid, 'opportunities.write')
);

create policy "Members can delete attachments"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'attachments'
  and public.has_permission((string_to_array(name, '/'))[1]::uuid, 'opportunities.write')
);
