import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import type { ServiceClient } from '@radar/supabase';
import { SUPABASE_RO_SERVICE } from '../../supabase/supabase.module';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { type UsageEventsFilter, type UsageEventsReport } from '@radar/contracts';
import { AiUsageService } from '../ai/ai-usage.service';

@UseGuards(PlatformAdminGuard)
@Controller('admin/usage')
export class AdminUsageController {
  constructor(
    @Inject(SUPABASE_RO_SERVICE) private readonly supabase: ServiceClient,
    private readonly aiUsageService: AiUsageService
  ) {}

  @Get('events')
  async listEvents(@Query() filter: UsageEventsFilter): Promise<UsageEventsReport> {
    // We cannot use AiUsageService.listEvents directly because it requires an organizationId.
    // Instead we do a cross-org query using the service-role client.
    
    let query = this.supabase
      .from('ai_usage_events')
      .select(
        'id, user_id, provider, model, task_type, ai_request_id, api_key_id, provider_account_id, input_tokens, output_tokens, total_tokens, estimated_cost, is_free_tier, status, created_at, organization_id',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false });

    // Ensure valid pagination
    const page = Math.max(1, Number(filter.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(filter.pageSize) || 50));

    if (filter.provider) {
      query = query.eq('provider', filter.provider);
    }
    if (filter.model) {
      query = query.eq('model', filter.model);
    }
    if (filter.status) {
      query = query.eq('status', filter.status);
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, error, count } = await query.range(from, to);

    if (error) {
      throw new Error(`Failed to load cross-org usage events: ${error.message}`);
    }

    return {
      items: (data ?? []).map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        provider: row.provider,
        model: row.model,
        taskType: row.task_type as any,
        aiRequestId: row.ai_request_id,
        apiKeyId: row.api_key_id,
        providerAccountId: row.provider_account_id,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        totalTokens: row.total_tokens,
        estimatedCost: row.estimated_cost,
        isFreeTier: row.is_free_tier,
        status: row.status,
        createdAt: row.created_at,
        // Admin report includes organizationId!
        organizationId: row.organization_id,
      })),
      total: count ?? 0,
      page,
      pageSize,
    };
  }
}
