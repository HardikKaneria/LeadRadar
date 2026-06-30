-- Phase 2 · Discovery Inbox (P2-06).
-- Reads already work via the discoveries.read SELECT policy (0005). The Inbox also lets users
-- transition status (review / approve / ignore) and soft-delete, done directly via supabase-js
-- under RLS. Allow those updates for `discoveries.write` holders. Inserts (manual entry) and
-- batch writes stay server-side / P2-04. Additive.

create policy discoveries_update_write on public.discoveries
  for update using (public.has_permission(organization_id, 'discoveries.write'))
  with check (public.has_permission(organization_id, 'discoveries.write'));
