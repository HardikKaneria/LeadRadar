import { Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ValidationError } from '@radar/core';
import { CurrentUser, type RequestPrincipal } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { DiscoveryPipelineService } from './discovery-pipeline.service';

@ApiTags('discoveries')
@Controller()
export class DiscoveryPipelineController {
  constructor(private readonly pipeline: DiscoveryPipelineService) {}

  private orgOf(user: RequestPrincipal): string {
    if (!user.organizationId) {
      throw new ValidationError('Missing x-organization-id header');
    }
    return user.organizationId;
  }

  /** Trigger (or re-run) AI analysis for a discovery. Powers the Inbox "re-analyze" action (P3-09). */
  @Post('discoveries/:id/analyze')
  @HttpCode(202)
  @RequirePermission('ai.use')
  analyze(@CurrentUser() user: RequestPrincipal, @Param('id') id: string) {
    return this.pipeline.enqueueAnalysis(this.orgOf(user), id, user.userId);
  }

  /** Trigger (or re-run) the Company Research agent for a company → `companies.enrichment` (P4-04). */
  @Post('companies/:id/research')
  @HttpCode(202)
  @RequirePermission('ai.use')
  research(@CurrentUser() user: RequestPrincipal, @Param('id') id: string) {
    return this.pipeline.enqueueCompanyResearch(this.orgOf(user), id, user.userId);
  }
}
