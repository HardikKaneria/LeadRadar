import { Inject, Injectable } from '@nestjs/common';
import {
  planNextAction,
  type AiCallContext,
  type AiCallRecord,
  type AnalyzerDiscovery,
  type PlannerAnalysis,
  type ServiceMatchSignal,
} from '@radar/ai';
import type { Database, Json, ServiceClient } from '@radar/supabase';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import { AiProviderPoolService } from './ai-provider-pool.service';

type DiscoveryRow = Database['public']['Tables']['discoveries']['Row'];
type AiAnalysisRow = Database['public']['Tables']['ai_analysis']['Row'];
type AiActionPlanRow = Database['public']['Tables']['ai_action_plans']['Row'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function mapDiscovery(row: DiscoveryRow): AnalyzerDiscovery {
  return {
    title: row.title,
    description: row.description,
    companyName: row.company_name,
    contactName: row.contact_name,
    country: row.country,
    website: row.website,
    email: row.email,
    source: row.source,
    budgetHint: row.budget_hint,
  };
}

function mapServiceMatches(value: Json): ServiceMatchSignal[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry): ServiceMatchSignal[] => {
    if (!isRecord(entry)) return [];
    const service = nonEmptyString(entry.service);
    if (!service) return [];
    const confidence =
      typeof entry.confidence === 'number' && Number.isFinite(entry.confidence)
        ? Math.max(0, Math.min(1, entry.confidence))
        : 0;
    return [{ service, confidence, isPriority: entry.isPriority === true }];
  });
}

export function mapAnalysis(row: AiAnalysisRow): PlannerAnalysis {
  return {
    score: row.score,
    intent: row.intent,
    urgency: row.urgency,
    serviceMatches: mapServiceMatches(row.service_match),
    budgetEstimate: row.budget_estimate,
    confidence: row.confidence,
    recommendedAction: row.recommended_action,
    reason: row.reason,
    isBadLead: row.is_bad_lead,
  };
}

/**
 * Action Planner writer (P3-08). Consumes the latest `ai_analysis` row for a discovery, runs the
 * pure planner through the governed AI gateway, and persists a re-runnable `ai_action_plans` row.
 */
@Injectable()
export class ActionPlannerService {
  constructor(
    @Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient,
    private readonly pool: AiProviderPoolService,
  ) {}

  async planDiscovery(organizationId: string, discoveryId: string, userId: string): Promise<AiActionPlanRow> {
    const discovery = await this.loadDiscovery(organizationId, discoveryId);
    const analysis = await this.loadLatestAnalysis(organizationId, discoveryId);

    let lastCall: AiCallRecord | undefined;
    const ai = await this.pool.buildService({
      organizationId,
      hooks: {
        onCall: (record) => {
          if (record.status !== 'error') lastCall = record;
        },
      },
    });

    const ctx: AiCallContext = { taskType: 'action_planner', organizationId, userId };
    const result = await planNextAction(ai, ctx, {
      discovery: mapDiscovery(discovery),
      analysis: mapAnalysis(analysis),
      pipeline: { discoveryStatus: discovery.status },
    });

    return this.insertPlan(organizationId, discoveryId, analysis.id, result, lastCall);
  }

  private async insertPlan(
    organizationId: string,
    discoveryId: string,
    aiAnalysisId: string,
    result: Awaited<ReturnType<typeof planNextAction>>,
    lastCall: AiCallRecord | undefined,
  ): Promise<AiActionPlanRow> {
    const payload: Database['public']['Tables']['ai_action_plans']['Insert'] = {
      organization_id: organizationId,
      discovery_id: discoveryId,
      ai_analysis_id: aiAnalysisId,
      recommended_action: result.recommendedAction,
      reason: result.reason,
      priority: result.priority,
      priority_weight: result.priorityWeight,
      due_at: result.dueAt.toISOString(),
      planned_task_title: result.plannedTask.title,
      planned_task_type: result.plannedTask.type,
      planned_task_notes: result.plannedTask.notes,
      ai_prompt_version_id: lastCall?.aiPromptVersionId ?? null,
      model_meta: lastCall ? { provider: lastCall.provider, model: lastCall.model } : {},
    };

    const { data, error } = await this.supabase.from('ai_action_plans').insert(payload).select('*').single();
    if (error || !data) {
      throw new Error(`Failed to insert ai_action_plans row: ${error?.message ?? 'unknown error'}`);
    }
    return data as AiActionPlanRow;
  }

  private async loadDiscovery(organizationId: string, discoveryId: string): Promise<DiscoveryRow> {
    const { data, error } = await this.supabase
      .from('discoveries')
      .select('*')
      .eq('id', discoveryId)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load discovery ${discoveryId}: ${error.message}`);
    }
    if (!data) {
      throw new Error(`Discovery ${discoveryId} not found for organization ${organizationId}`);
    }
    return data as DiscoveryRow;
  }

  private async loadLatestAnalysis(organizationId: string, discoveryId: string): Promise<AiAnalysisRow> {
    const { data, error } = await this.supabase
      .from('ai_analysis')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('discovery_id', discoveryId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load ai_analysis for ${discoveryId}: ${error.message}`);
    }
    if (!data) {
      throw new Error(`No ai_analysis row found for discovery ${discoveryId}`);
    }
    return data as AiAnalysisRow;
  }
}
