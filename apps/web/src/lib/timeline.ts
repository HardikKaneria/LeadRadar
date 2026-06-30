
// Activities, notes & attachments data layer (P4-07). Direct supabase-js access under RLS: reads use
// the `opportunities.read` SELECT policies; writes go through the SECURITY DEFINER RPCs (`add_note`,
// `record_attachment`, `delete_note`, `delete_attachment`) gated by `opportunities.write`, which
// validate the polymorphic entity and log a matching activity. Activities are append-only (no client
// write path). See supabase/migrations/0023_activities_notes_attachments.sql. Org-scoped by RLS.

import type {
  Activity,
  AddNoteInput,
  Attachment,
  Note,
  RecordAttachmentInput,
  RelationshipNodeType,
  TimelineTarget,
} from '@radar/contracts';
import { supabase } from './supabase';

const ACTIVITY_COLS = 'id, entity_type, entity_id, type, summary, metadata, actor_id, created_at';
const NOTE_COLS =
  'id, entity_type, entity_id, body, is_ai_generated, author_id, created_at, updated_at';
const ATTACHMENT_COLS =
  'id, entity_type, entity_id, bucket, path, file_name, mime_type, size_bytes, uploaded_by, created_at';

interface ActivityRow {
  id: string;
  entity_type: RelationshipNodeType;
  entity_id: string;
  type: Activity['type'];
  summary: string;
  metadata: unknown;
  actor_id: string | null;
  created_at: string;
}

interface NoteRow {
  id: string;
  entity_type: RelationshipNodeType;
  entity_id: string;
  body: string;
  is_ai_generated: boolean;
  author_id: string | null;
  created_at: string;
  updated_at: string;
}

interface AttachmentRow {
  id: string;
  entity_type: RelationshipNodeType;
  entity_id: string;
  bucket: string;
  path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
}

function toActivity(row: ActivityRow): Activity {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    type: row.type,
    summary: row.summary,
    metadata: row.metadata,
    actorId: row.actor_id,
    createdAt: row.created_at,
  };
}

function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    body: row.body,
    isAiGenerated: row.is_ai_generated,
    authorId: row.author_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    bucket: row.bucket,
    path: row.path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  };
}

export async function listActivities(
  organizationId: string,
  target: TimelineTarget,
  limit = 50,
): Promise<Activity[]> {
  const { data, error } = await supabase
    .from('activities')
    .select(ACTIVITY_COLS)
    .eq('organization_id', organizationId)
    .eq('entity_type', target.entityType)
    .eq('entity_id', target.entityId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as unknown as ActivityRow[]).map(toActivity);
}

export async function listNotes(
  organizationId: string,
  target: TimelineTarget,
): Promise<Note[]> {
  const { data, error } = await supabase
    .from('notes')
    .select(NOTE_COLS)
    .eq('organization_id', organizationId)
    .eq('entity_type', target.entityType)
    .eq('entity_id', target.entityId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as NoteRow[]).map(toNote);
}

export async function listAttachments(
  organizationId: string,
  target: TimelineTarget,
): Promise<Attachment[]> {
  const { data, error } = await supabase
    .from('attachments')
    .select(ATTACHMENT_COLS)
    .eq('organization_id', organizationId)
    .eq('entity_type', target.entityType)
    .eq('entity_id', target.entityId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as AttachmentRow[]).map(toAttachment);
}

/** Add a note to an entity (also logs a `note_added` activity) for the active org. */
export async function addNote(organizationId: string, input: AddNoteInput): Promise<Note> {
  const { data, error } = await supabase.rpc('add_note', {
    p_org: organizationId,
    p_entity_type: input.entityType,
    p_entity_id: input.entityId,
    p_body: input.body,
    p_is_ai_generated: input.isAiGenerated ?? false,
  });
  if (error) throw error;
  return toNote(data as unknown as NoteRow);
}

export async function deleteNote(id: string): Promise<Note> {
  const { data, error } = await supabase.rpc('delete_note', { p_id: id });
  if (error) throw error;
  return toNote(data as unknown as NoteRow);
}

/** Register uploaded-file metadata against an entity (also logs an `attachment_added` activity). */
export async function recordAttachment(
  organizationId: string,
  input: RecordAttachmentInput,
): Promise<Attachment> {
  const { data, error } = await supabase.rpc('record_attachment', {
    p_org: organizationId,
    p_entity_type: input.entityType,
    p_entity_id: input.entityId,
    p_bucket: input.bucket,
    p_path: input.path,
    p_file_name: input.fileName,
    p_mime_type: input.mimeType ?? null,
    p_size_bytes: input.sizeBytes ?? null,
  });
  if (error) throw error;
  return toAttachment(data as unknown as AttachmentRow);
}

export async function deleteAttachment(id: string): Promise<Attachment> {
  const { data, error } = await supabase.rpc('delete_attachment', { p_id: id });
  if (error) throw error;
  return toAttachment(data as unknown as AttachmentRow);
}
