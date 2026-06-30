import { Controller, Get, Post, Put, Query, Param } from '@nestjs/common';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser, type RequestPrincipal } from '../../common/decorators/current-user.decorator';
import { KnowledgeService } from './knowledge.service';
import { knowledgeInsightsQuerySchema } from '@radar/contracts';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@Controller('v1/knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Post('insights/recompute')
  @RequirePermission('company_brain.manage')
  async triggerRecomputeScoring(@CurrentUser() user: RequestPrincipal) {
    return this.knowledgeService.triggerRecomputeScoring(user.organizationId!);
  }

  @Get('insights/conversion')
  @RequirePermission('knowledge.read')
  async getConversionInsights(
    @CurrentUser() user: RequestPrincipal,
    @Query(new ZodValidationPipe(knowledgeInsightsQuerySchema)) query: z.infer<typeof knowledgeInsightsQuerySchema>
  ) {
    return this.knowledgeService.getConversionInsights(user.organizationId!, query);
  }

  @Get('insights/reasons')
  @RequirePermission('knowledge.read')
  async getReasonInsights(
    @CurrentUser() user: RequestPrincipal,
    @Query(new ZodValidationPipe(knowledgeInsightsQuerySchema)) query: z.infer<typeof knowledgeInsightsQuerySchema>
  ) {
    return this.knowledgeService.getReasonInsights(user.organizationId!, query);
  }

  @Get('events')
  @RequirePermission('knowledge.read')
  async listKnowledgeEvents(
    @CurrentUser() user: RequestPrincipal,
    @Query('limit') limit = 50,
    @Query('offset') offset = 0
  ) {
    return this.knowledgeService.listEvents(user.organizationId!, Number(limit), Number(offset));
  }

  @Get('scoring-strategies')
  @RequirePermission('company_brain.manage')
  async listScoringStrategies(@CurrentUser() user: RequestPrincipal) {
    return this.knowledgeService.listScoringStrategies(user.organizationId!);
  }

  @Put('scoring-strategies/:id/activate')
  @RequirePermission('company_brain.manage')
  async activateScoringStrategy(
    @CurrentUser() user: RequestPrincipal,
    @Param('id') id: string
  ) {
    await this.knowledgeService.activateScoringStrategy(user.organizationId!, id);
    return { success: true };
  }

  @Get('forecast/revenue')
  @RequirePermission('knowledge.read')
  async getRevenueForecast(@CurrentUser() user: RequestPrincipal) {
    return this.knowledgeService.getRevenueForecast(user.organizationId!);
  }

  @Post('recompute-heat')
  @RequirePermission('company_brain.manage')
  async triggerRecomputeHeat(@CurrentUser() user: RequestPrincipal) {
    return this.knowledgeService.triggerRecomputeHeat(user.organizationId!);
  }
}
