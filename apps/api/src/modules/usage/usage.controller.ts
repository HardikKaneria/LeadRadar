import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type UsageEventsFilter,
  type UsagePeriodInput,
  usageEventsFilterSchema,
  usagePeriodSchema,
} from '@radar/contracts';
import { ValidationError } from '@radar/core';
import { CurrentUser, type RequestPrincipal } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AiUsageService } from '../ai/ai-usage.service';

@ApiTags('usage')
@Controller('usage')
export class UsageController {
  constructor(private readonly usage: AiUsageService) {}

  @Get('me')
  @RequirePermission('usage.read_own')
  me(
    @CurrentUser() user: RequestPrincipal,
    @Query(new ZodValidationPipe(usagePeriodSchema)) query: UsagePeriodInput,
  ) {
    return this.usage.getMeReport(this.orgOf(user), user.userId, query.period);
  }

  @Get('company')
  @RequirePermission('usage.read_company')
  company(
    @CurrentUser() user: RequestPrincipal,
    @Query(new ZodValidationPipe(usagePeriodSchema)) query: UsagePeriodInput,
  ) {
    return this.usage.getCompanyReport(this.orgOf(user), query.period);
  }

  @Get('company/summary')
  @RequirePermission('usage.read_company_summary')
  companySummary(
    @CurrentUser() user: RequestPrincipal,
    @Query(new ZodValidationPipe(usagePeriodSchema)) query: UsagePeriodInput,
  ) {
    return this.usage.getCompanySummary(this.orgOf(user), query.period);
  }

  @Get('team')
  @RequirePermission('usage.read_company')
  team(
    @CurrentUser() user: RequestPrincipal,
    @Query(new ZodValidationPipe(usagePeriodSchema)) query: UsagePeriodInput,
  ) {
    return this.usage.getTeamReport(this.orgOf(user), query.period);
  }

  @Get('limits')
  @RequirePermission('company.usage.read')
  limits(
    @CurrentUser() user: RequestPrincipal,
    @Query(new ZodValidationPipe(usagePeriodSchema)) query: UsagePeriodInput,
  ) {
    return this.usage.getLimitsReport(this.orgOf(user), query.period);
  }

  @Get('events')
  @RequirePermission('usage.read_company')
  events(
    @CurrentUser() user: RequestPrincipal,
    @Query(new ZodValidationPipe(usageEventsFilterSchema)) query: UsageEventsFilter,
  ) {
    return this.usage.listEvents(this.orgOf(user), query);
  }

  private orgOf(user: RequestPrincipal): string {
    if (!user.organizationId) {
      throw new ValidationError('Missing x-organization-id header');
    }
    return user.organizationId;
  }
}
