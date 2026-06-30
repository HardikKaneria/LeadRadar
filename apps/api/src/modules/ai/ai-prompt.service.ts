import { Inject, Injectable } from '@nestjs/common';
import type { AiCallContext, ResolvedPrompt } from '@radar/ai';
import type { Database, ServiceClient } from '@radar/supabase';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';

type AiPromptVersionRow = Database['public']['Tables']['ai_prompt_versions']['Row'];

function asModelPreferences(value: AiPromptVersionRow['model_preferences']): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function mapPromptVersionRow(row: AiPromptVersionRow): ResolvedPrompt {
  return {
    promptVersionId: row.id,
    system: row.system_prompt || undefined,
    userPromptTemplate: row.user_prompt_template ?? undefined,
    modelPreferences: asModelPreferences(row.model_preferences),
  };
}

/**
 * Resolves the active prompt version (`ai_prompt_versions`) for a call and exposes thin RPC
 * wrappers for managing versions. The org-custom active version wins over the platform system
 * default (organization_id is null); the gateway stamps the resolved id onto every `ai_request`.
 * Keeps DB access in the API layer so `@radar/ai` stays storage-agnostic (cf. [[D-020]], [[D-022]]).
 */
@Injectable()
export class AiPromptService {
  constructor(@Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient) {}

  async resolveActivePrompt(ctx: AiCallContext): Promise<ResolvedPrompt | null> {
    const { data, error } = await this.supabase
      .from('ai_prompt_versions')
      .select('*')
      .eq('agent', ctx.taskType)
      .eq('is_active', true)
      .or(`organization_id.eq.${ctx.organizationId},organization_id.is.null`);

    if (error) {
      throw new Error(`Failed to load ai_prompt_versions for ${ctx.organizationId}/${ctx.taskType}: ${error.message}`);
    }

    const rows = (data ?? []) as AiPromptVersionRow[];
    if (rows.length === 0) return null;

    const orgRow = rows.find((row) => row.organization_id === ctx.organizationId);
    const resolved = orgRow ?? rows.find((row) => row.organization_id === null);
    return resolved ? mapPromptVersionRow(resolved) : null;
  }

  async createVersion(
    args: Database['public']['Functions']['create_ai_prompt_version']['Args'],
  ): Promise<AiPromptVersionRow> {
    const { data, error } = await this.supabase.rpc('create_ai_prompt_version', args);
    if (error || !data) {
      throw new Error(`Failed to create ai_prompt_versions row: ${error?.message ?? 'unknown error'}`);
    }
    return data as AiPromptVersionRow;
  }

  async activateVersion(id: string): Promise<AiPromptVersionRow> {
    const { data, error } = await this.supabase.rpc('activate_ai_prompt_version', { p_id: id });
    if (error || !data) {
      throw new Error(`Failed to activate ai_prompt_versions row ${id}: ${error?.message ?? 'unknown error'}`);
    }
    return data as AiPromptVersionRow;
  }
}
