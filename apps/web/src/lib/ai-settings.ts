
import type { UsageTaskType } from '@radar/contracts';
import { supabase } from './supabase';

type JsonObject = Record<string, unknown>;

interface PromptVersionRow {
  id: string;
  organization_id: string | null;
  agent: UsageTaskType;
  version: number;
  name: string;
  description: string | null;
  system_prompt: string;
  user_prompt_template: string | null;
  output_schema: JsonObject;
  model_preferences: JsonObject;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type AiPromptAgent = PromptVersionRow['agent'];

export const AI_PROMPT_AGENTS: readonly AiPromptAgent[] = [
  'opportunity_analyzer',
  'action_planner',
  'company_research',
  'sales_message',
  'follow_up_message',
  'conversation_summary',
  'proposal_generator',
  'meeting_prep',
  'next_action',
  'embedding',
  'learning_summary',
];

export interface AiPromptVersion {
  id: string;
  organizationId: string | null;
  agent: AiPromptAgent;
  version: number;
  name: string;
  description: string | null;
  systemPrompt: string;
  userPromptTemplate: string | null;
  outputSchema: JsonObject;
  modelPreferences: JsonObject;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAiPromptVersionInput {
  organizationId: string;
  agent: AiPromptAgent;
  name: string;
  description?: string | null;
  systemPrompt: string;
  userPromptTemplate?: string | null;
  outputSchema?: JsonObject;
  modelPreferences?: JsonObject;
  activate?: boolean;
}

function toPromptVersion(row: PromptVersionRow): AiPromptVersion {
  return {
    id: row.id,
    organizationId: row.organization_id,
    agent: row.agent,
    version: row.version,
    name: row.name,
    description: row.description,
    systemPrompt: row.system_prompt,
    userPromptTemplate: row.user_prompt_template,
    outputSchema: row.output_schema,
    modelPreferences: row.model_preferences,
    isActive: row.is_active,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function promptAgentOrder(agent: AiPromptAgent): number {
  const index = AI_PROMPT_AGENTS.indexOf(agent);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function comparePromptVersions(a: AiPromptVersion, b: AiPromptVersion): number {
  const agentDiff = promptAgentOrder(a.agent) - promptAgentOrder(b.agent);
  if (agentDiff !== 0) return agentDiff;
  if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
  if ((a.organizationId != null) !== (b.organizationId != null)) return a.organizationId ? -1 : 1;
  return b.version - a.version;
}

export async function listAiPromptVersions(
  organizationId: string,
): Promise<AiPromptVersion[]> {
  const { data, error } = await supabase
    .from('ai_prompt_versions')
    .select('*')
    .or(`organization_id.eq.${organizationId},organization_id.is.null`);

  if (error) throw error;

  return ((data ?? []) as PromptVersionRow[]).map(toPromptVersion).sort(comparePromptVersions);
}

export async function createAiPromptVersion(
  input: CreateAiPromptVersionInput,
): Promise<AiPromptVersion> {
  const { data, error } = await supabase.rpc('create_ai_prompt_version', {
    org: input.organizationId,
    p_agent: input.agent,
    p_name: input.name,
    p_description: input.description ?? null,
    p_system_prompt: input.systemPrompt,
    p_user_prompt_template: input.userPromptTemplate ?? null,
    p_output_schema: input.outputSchema ?? {},
    p_model_preferences: input.modelPreferences ?? {},
    p_activate: input.activate ?? true,
  });

  if (error || !data) {
    throw error ?? new Error('Failed to create AI prompt version.');
  }

  return toPromptVersion(data as PromptVersionRow);
}

export async function activateAiPromptVersion(id: string): Promise<AiPromptVersion> {
  const { data, error } = await supabase.rpc('activate_ai_prompt_version', { p_id: id });

  if (error || !data) {
    throw error ?? new Error('Failed to activate AI prompt version.');
  }

  return toPromptVersion(data as PromptVersionRow);
}

export async function useSystemAiPromptDefault(
  organizationId: string,
  agent: AiPromptAgent,
): Promise<void> {
  const { error } = await supabase
    .from('ai_prompt_versions')
    .update({ is_active: false })
    .eq('organization_id', organizationId)
    .eq('agent', agent)
    .eq('is_active', true);

  if (error) throw error;
}
