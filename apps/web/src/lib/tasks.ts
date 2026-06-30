// Tasks / Follow-Up Intelligence data layer (P5-02). Direct supabase-js access under RLS: reads use
// the `tasks` SELECT policy (team `tasks.manage` or own `tasks.manage_own`); create/reschedule/
// reassign are direct writes under the same policy; complete/cancel go through the guarded
// `complete_task` / `cancel_task` RPCs that enforce the "no active lead without an open task"
// invariant. See supabase/migrations/0035_tasks.sql. All queries are org-scoped explicitly *and* by RLS.

import type {
  CancelTaskInput,
  CompleteTaskInput,
  CreateTaskInput,
  Priority,
  ReassignTaskInput,
  RescheduleTaskInput,
  TaskDetail,
  TaskListResult,
  TaskQueueFilter,
  TaskStatus,
  TaskSummary,
} from '@radar/contracts';
import { PRIORITY_WEIGHT } from '@radar/contracts';
import dayjs from 'dayjs';
import { supabase } from './supabase';

const SUMMARY_COLS =
  'id, lead_id, title, status, priority, priority_weight, due_at, assigned_to, created_at';
const DETAIL_COLS = `${SUMMARY_COLS}, description, completed_at, created_by, updated_at`;

interface SummaryRow {
  id: string;
  lead_id: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  priority_weight: number;
  due_at: string | null;
  assigned_to: string | null;
  created_at: string;
}

interface DetailRow extends SummaryRow {
  description: string | null;
  completed_at: string | null;
  created_by: string | null;
  updated_at: string;
}

function toSummary(row: SummaryRow): TaskSummary {
  return {
    id: row.id,
    leadId: row.lead_id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    priorityWeight: row.priority_weight,
    dueAt: row.due_at,
    assignedTo: row.assigned_to,
    createdAt: row.created_at,
  };
}

function toDetail(row: DetailRow): TaskDetail {
  return {
    ...toSummary(row),
    description: row.description,
    completedAt: row.completed_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
  };
}

/** Load a follow-up queue. Tabs window open tasks on `due_at` (overdue/today/upcoming) or filter to
 * the current user's assignments (assigned); `all` is every open task. Ordered soonest-due first. */
export async function listTasks(
  organizationId: string,
  filter: TaskQueueFilter,
): Promise<TaskListResult> {
  const startOfToday = dayjs().startOf('day');
  const startOfTomorrow = startOfToday.add(1, 'day');

  let q = supabase
    .from('tasks')
    .select(SUMMARY_COLS, { count: 'exact' })
    .eq('organization_id', organizationId)
    .eq('status', 'open')
    .is('deleted_at', null);

  switch (filter.queue) {
    case 'overdue':
      q = q.lt('due_at', startOfToday.toISOString());
      break;
    case 'today':
      q = q
        .gte('due_at', startOfToday.toISOString())
        .lt('due_at', startOfTomorrow.toISOString());
      break;
    case 'upcoming':
      q = q.gte('due_at', startOfTomorrow.toISOString());
      break;
    case 'assigned':
      if (filter.assignedTo) q = q.eq('assigned_to', filter.assignedTo);
      break;
    case 'all':
    default:
      break;
  }

  if (filter.queue !== 'assigned' && filter.assignedTo) {
    q = q.eq('assigned_to', filter.assignedTo);
  }

  // Soonest due first; nulls sort last so dated work surfaces ahead of undated.
  q = q.order('due_at', { ascending: true, nullsFirst: false }).order('priority_weight', {
    ascending: false,
  });

  const from = (filter.page - 1) * filter.pageSize;
  q = q.range(from, from + filter.pageSize - 1);

  const { data, count, error } = await q;
  if (error) throw error;

  return {
    items: ((data ?? []) as unknown as SummaryRow[]).map(toSummary),
    total: count ?? 0,
    page: filter.page,
    pageSize: filter.pageSize,
  };
}

/** Tasks for a single lead's workspace pane (open first, then by due date). */
export async function listLeadTasks(organizationId: string, leadId: string): Promise<TaskDetail[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select(DETAIL_COLS)
    .eq('organization_id', organizationId)
    .eq('lead_id', leadId)
    .is('deleted_at', null)
    .order('status', { ascending: true })
    .order('due_at', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return ((data ?? []) as unknown as DetailRow[]).map(toDetail);
}

export async function createTask(
  organizationId: string,
  input: CreateTaskInput,
): Promise<TaskDetail> {
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      organization_id: organizationId,
      lead_id: input.leadId,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority,
      priority_weight: PRIORITY_WEIGHT[input.priority],
      due_at: input.dueAt ?? null,
      assigned_to: input.assignedTo ?? null,
    })
    .select(DETAIL_COLS)
    .single();
  if (error) throw error;
  return toDetail(data as unknown as DetailRow);
}

export async function rescheduleTask(
  organizationId: string,
  input: RescheduleTaskInput,
): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .update({ due_at: input.dueAt })
    .eq('organization_id', organizationId)
    .eq('id', input.taskId);
  if (error) throw error;
}

export async function reassignTask(
  organizationId: string,
  input: ReassignTaskInput,
): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .update({ assigned_to: input.assignedTo })
    .eq('organization_id', organizationId)
    .eq('id', input.taskId);
  if (error) throw error;
}

/** Complete a task. If it is the last open task on an active lead, pass a follow-up to satisfy the
 * invariant — otherwise the RPC rejects the call. */
export async function completeTask(input: CompleteTaskInput): Promise<TaskDetail> {
  const { data, error } = await supabase.rpc('complete_task', {
    p_task: input.taskId,
    p_followup_title: input.followUpTitle ?? null,
    p_followup_due_at: input.followUpDueAt ?? null,
    p_followup_priority: input.followUpPriority ?? null,
    p_followup_assignee: input.followUpAssignee ?? null,
  });
  if (error) throw error;
  return toDetail(data as unknown as DetailRow);
}

export async function cancelTask(input: CancelTaskInput): Promise<TaskDetail> {
  const { data, error } = await supabase.rpc('cancel_task', {
    p_task: input.taskId,
    p_followup_title: input.followUpTitle ?? null,
    p_followup_due_at: input.followUpDueAt ?? null,
  });
  if (error) throw error;
  return toDetail(data as unknown as DetailRow);
}
