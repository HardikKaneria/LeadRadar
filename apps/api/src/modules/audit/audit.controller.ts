import { Controller, Get, UseGuards, BadRequestException } from '@nestjs/common';
import { AuditService } from './audit.service';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser, type RequestPrincipal } from '../../common/decorators/current-user.decorator';

@Controller('v1/audit')
@UseGuards(SupabaseAuthGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('logs')
  @RequirePermission('audit.read')
  async getLogs(@CurrentUser() user: RequestPrincipal) {
    if (!user.organizationId) throw new BadRequestException('Organization context required');
    
    // Fetch both and interleave them (simplified)
    const [billing, ai] = await Promise.all([
      this.auditService.getBillingEvents(user.organizationId),
      this.auditService.getAiRequests(user.organizationId)
    ]);

    // Format them uniformly for the frontend
    const formattedBilling = billing.map(b => ({
      id: b.id,
      type: `Billing: ${b.type}`,
      details: b.payload,
      createdAt: b.created_at,
      status: b.processed ? 'processed' : 'pending'
    }));

    const formattedAi = ai.map(a => ({
      id: a.id,
      type: `AI: ${a.provider} / ${a.model}`,
      details: {
        tokens: a.total_tokens,
        cost: a.cost,
        duration: a.duration_ms
      },
      createdAt: a.created_at,
      status: a.status
    }));

    const logs = [...formattedBilling, ...formattedAi].sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return logs;
  }
}
