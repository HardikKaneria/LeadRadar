import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser, type RequestPrincipal } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import type { SimilarOpportunityDto, DemandRadarClusterDto } from '@radar/contracts';
import { OpportunityAnalyzerService } from './opportunity-analyzer.service';

@ApiTags('opportunities')
@Controller('opportunities')
@UseGuards(SupabaseAuthGuard, PermissionGuard)
@ApiBearerAuth()
export class OpportunityAnalyzerController {
  constructor(private readonly analyzer: OpportunityAnalyzerService) {}

  @Get(':id/similar')
  @ApiOperation({ summary: 'Find similar opportunities' })
  @ApiResponse({ status: 200, description: 'Similar opportunities' })
  @RequirePermission('opportunities.read')
  async getSimilarOpportunities(
    @CurrentUser() user: RequestPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SimilarOpportunityDto[]> {
    if (!user.organizationId) {
      throw new Error('User does not belong to an organization');
    }
    return this.analyzer.findSimilarOpportunities(user.organizationId, id);
  }

  @Get('demand-radar')
  @ApiOperation({ summary: 'Get demand radar clusters' })
  @ApiResponse({ status: 200, description: 'Demand radar clusters' })
  @RequirePermission('opportunities.read')
  async getDemandRadar(
    @CurrentUser() user: RequestPrincipal,
  ): Promise<DemandRadarClusterDto[]> {
    if (!user.organizationId) {
      throw new Error('User does not belong to an organization');
    }
    return this.analyzer.getDemandRadar(user.organizationId);
  }
}
