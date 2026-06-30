-- Phase 2 · Discovery ownership + capture attribution (P2-13)
-- Adds specific attribution columns to individual discoveries so that performance
-- reporting and ownership can be tracked per-item regardless of batches.

alter table public.discoveries
  add column captured_by_user_id uuid references auth.users (id),
  add column assigned_to_user_id uuid references auth.users (id),
  add column reviewed_by_user_id uuid references auth.users (id),
  add column approved_by_user_id uuid references auth.users (id),
  add column capture_channel discovery_channel;

-- Indices for fast reporting and inbox filtering
create index discoveries_org_assigned_idx on public.discoveries (organization_id, assigned_to_user_id, created_at desc);
create index discoveries_org_captured_idx on public.discoveries (organization_id, captured_by_user_id, created_at desc);
