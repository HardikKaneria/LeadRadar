import { Inject, Injectable } from '@nestjs/common';
import type { ServiceClient } from '@radar/supabase';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import type {
  ExternalProviderRouteRow,
  ExternalProviderTaskRoute,
  ExternalProviderTaskType,
} from './external-provider.types';

export function mapExternalProviderRouteRow(
  row: ExternalProviderRouteRow,
): ExternalProviderTaskRoute {
  const attempts = [row.primary_provider];
  if (row.fallback_provider) attempts.push(row.fallback_provider);
  if (row.fallback_2_provider) attempts.push(row.fallback_2_provider);
  if (row.fallback_3_provider) attempts.push(row.fallback_3_provider);

  return {
    id: row.id,
    taskType: row.task_type,
    attempts,
    allowManualFallback: row.allow_manual_fallback,
    requiresBrowser: row.requires_browser,
    requiresJson: row.requires_json,
    timeoutMs: row.timeout_ms ?? undefined,
    maxAttempts: row.max_attempts,
    notes: row.notes ?? undefined,
  };
}

export function buildExternalProviderRouteMap(
  rows: ExternalProviderRouteRow[],
): Partial<Record<ExternalProviderTaskType, ExternalProviderTaskRoute>> {
  const routes: Partial<Record<ExternalProviderTaskType, ExternalProviderTaskRoute>> = {};
  for (const row of rows) {
    routes[row.task_type] = mapExternalProviderRouteRow(row);
  }
  return routes;
}

@Injectable()
export class ExternalProviderRoutingService {
  constructor(@Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient) {}

  async loadActiveRoutes(): Promise<Partial<Record<ExternalProviderTaskType, ExternalProviderTaskRoute>>> {
    const { data, error } = await this.supabase
      .from('external_provider_routes')
      .select('*')
      .eq('is_active', true);

    if (error) {
      throw new Error(`Failed to load external provider routes: ${error.message}`);
    }

    return buildExternalProviderRouteMap((data ?? []) as ExternalProviderRouteRow[]);
  }

  async loadRoute(taskType: ExternalProviderTaskType): Promise<ExternalProviderTaskRoute | null> {
    const { data, error } = await this.supabase
      .from('external_provider_routes')
      .select('*')
      .eq('task_type', taskType)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load external provider route for ${taskType}: ${error.message}`);
    }

    return data ? mapExternalProviderRouteRow(data as ExternalProviderRouteRow) : null;
  }
}
