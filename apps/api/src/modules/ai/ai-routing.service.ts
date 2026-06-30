import { Inject, Injectable } from '@nestjs/common';
import { AI_TASK_TYPES, type AiTaskType, type ProviderName, type TaskRoute } from '@radar/ai';
import type { Database, ServiceClient } from '@radar/supabase';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';

type AiTaskRouteRow = Database['public']['Tables']['ai_task_routes']['Row'];

const AI_TASK_TYPE_SET = new Set<string>(AI_TASK_TYPES);

function isAiTaskType(value: string): value is AiTaskType {
  return AI_TASK_TYPE_SET.has(value);
}

export function mapAiTaskRouteRow(row: AiTaskRouteRow): TaskRoute {
  if (!isAiTaskType(row.task_type)) {
    throw new Error(`Unknown AI task type in ai_task_routes: ${row.task_type}`);
  }

  const attempts: TaskRoute['attempts'] = [
    { provider: row.primary_provider as ProviderName, model: row.primary_model },
  ];

  if (row.fallback_provider && row.fallback_model) {
    attempts.push({ provider: row.fallback_provider as ProviderName, model: row.fallback_model });
  }
  if (row.fallback_2_provider && row.fallback_2_model) {
    attempts.push({ provider: row.fallback_2_provider as ProviderName, model: row.fallback_2_model });
  }

  return {
    taskType: row.task_type,
    attempts,
    requiresJson: row.requires_json_schema || undefined,
    requiresEmbedding: row.requires_embedding || undefined,
    maxInputTokens: row.max_input_tokens ?? undefined,
    maxOutputTokens: row.max_output_tokens ?? undefined,
    temperature: row.temperature ?? undefined,
  };
}

export function buildAiTaskRouteMap(
  rows: AiTaskRouteRow[],
): Partial<Record<AiTaskType, TaskRoute>> {
  const routes: Partial<Record<AiTaskType, TaskRoute>> = {};
  for (const row of rows) {
    routes[row.task_type] = mapAiTaskRouteRow(row);
  }
  return routes;
}

@Injectable()
export class AiRoutingService {
  constructor(@Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient) {}

  async loadActiveRoutes(): Promise<Partial<Record<AiTaskType, TaskRoute>>> {
    const { data, error } = await this.supabase
      .from('ai_task_routes')
      .select('*')
      .eq('is_active', true);

    if (error) {
      throw new Error(`Failed to load AI task routes: ${error.message}`);
    }

    return buildAiTaskRouteMap((data ?? []) as AiTaskRouteRow[]);
  }
}
