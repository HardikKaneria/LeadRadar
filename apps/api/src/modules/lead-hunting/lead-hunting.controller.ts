import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { leadHuntingSettingsUpdateSchema, type LeadHuntingSettingsUpdateInput } from '@radar/contracts';
import { ValidationError } from '@radar/core';
import { CurrentUser, type RequestPrincipal } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { LeadHuntingCrmHandoffService } from './lead-hunting-crm-handoff.service';
import { LeadHuntingOperationsService } from './lead-hunting-operations.service';
import { LeadHuntingResearchService } from './lead-hunting-research.service';

@ApiTags('lead-hunting')
@Controller('lead-hunting')
export class LeadHuntingController {
  constructor(
    private readonly operations: LeadHuntingOperationsService,
    private readonly research: LeadHuntingResearchService,
    private readonly handoff: LeadHuntingCrmHandoffService,
  ) {}

  private orgOf(user: RequestPrincipal): string {
    if (!user.organizationId) {
      throw new ValidationError('Missing x-organization-id header');
    }
    return user.organizationId;
  }

  private intOr(value: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  @Get('overview')
  @RequirePermission('lead_hunting.read')
  overview(@CurrentUser() user: RequestPrincipal) {
    return this.operations.getOverview(this.orgOf(user), user.permissions);
  }

  @Get('sessions')
  @RequirePermission('lead_hunting.read')
  sessions(
    @CurrentUser() user: RequestPrincipal,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
  ) {
    return this.operations.listSessions(this.orgOf(user), {
      page: this.intOr(page, 1),
      pageSize: this.intOr(pageSize, 25),
      search,
    });
  }

  @Get('sessions/:id')
  @RequirePermission('lead_hunting.read')
  session(@CurrentUser() user: RequestPrincipal, @Param('id') id: string) {
    return this.operations.getSession(this.orgOf(user), id);
  }

  @Get('posts')
  @RequirePermission('lead_hunting.read')
  posts(
    @CurrentUser() user: RequestPrincipal,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('queue') queue?: 'all' | 'review' | 'qualified' | 'archive' | 'rejected' | 'failed',
    @Query('sessionId') sessionId?: string,
    @Query('status') status?: string,
  ) {
    return this.operations.listPosts(this.orgOf(user), {
      page: this.intOr(page, 1),
      pageSize: this.intOr(pageSize, 25),
      search,
      queue,
      sessionId,
      status: status as never,
    });
  }

  @Get('posts/:id')
  @RequirePermission('lead_hunting.read')
  post(@CurrentUser() user: RequestPrincipal, @Param('id') id: string) {
    return this.operations.getPostDetail(this.orgOf(user), id);
  }

  @Get('usage')
  @RequirePermission('lead_hunting.read')
  usage(@CurrentUser() user: RequestPrincipal) {
    return this.operations.getUsageSummary(this.orgOf(user), user.permissions);
  }

  @Get('settings')
  @RequirePermission('lead_hunting.read')
  settings(@CurrentUser() user: RequestPrincipal) {
    return this.operations.getSettings(this.orgOf(user));
  }

  @Put('settings')
  @RequirePermission('lead_hunting.manage')
  updateSettings(
    @CurrentUser() user: RequestPrincipal,
    @Body(new ZodValidationPipe(leadHuntingSettingsUpdateSchema)) body: LeadHuntingSettingsUpdateInput,
  ) {
    return this.operations.updateSettings(this.orgOf(user), user.userId, body);
  }

  @Post('posts/:id/research')
  @HttpCode(202)
  @RequirePermission('lead_hunting.review')
  enqueueResearch(@CurrentUser() user: RequestPrincipal, @Param('id') id: string) {
    return this.research.enqueueResearch(this.orgOf(user), id, user.userId, { force: true });
  }

  @Post('posts/:id/classify')
  @HttpCode(200)
  @RequirePermission('lead_hunting.review')
  reclassify(@CurrentUser() user: RequestPrincipal, @Param('id') id: string) {
    return this.research.reclassifyRawPost(this.orgOf(user), id, user.userId);
  }

  @Post('posts/:id/approve')
  @HttpCode(200)
  @RequirePermission('lead_hunting.review')
  approve(@CurrentUser() user: RequestPrincipal, @Param('id') id: string) {
    return this.handoff.approveRawPost(this.orgOf(user), id, user.userId);
  }

  @Post('posts/:id/archive')
  @HttpCode(200)
  @RequirePermission('lead_hunting.review')
  archive(@CurrentUser() user: RequestPrincipal, @Param('id') id: string) {
    return this.handoff.archiveRawPost(this.orgOf(user), id, user.userId);
  }

  @Post('posts/:id/reject')
  @HttpCode(200)
  @RequirePermission('lead_hunting.review')
  reject(@CurrentUser() user: RequestPrincipal, @Param('id') id: string) {
    return this.handoff.rejectRawPost(this.orgOf(user), id, user.userId);
  }
}
