import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { QUEUES } from '@radar/contracts';
import { ValidationError } from '@radar/core';
import { CurrentUser, type RequestPrincipal } from '../../common/decorators/current-user.decorator';
import { JobsService } from './jobs.service';

/** All routes require an `x-organization-id` header (membership verified by the auth guard). */
@ApiTags('jobs')
@Controller()
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  private orgOf(user: RequestPrincipal): string {
    if (!user.organizationId) {
      throw new ValidationError('Missing x-organization-id header');
    }
    return user.organizationId;
  }

  @Get('jobs')
  list(
    @CurrentUser() user: RequestPrincipal,
    @Query('queue') queue?: string,
    @Query('status') status?: string,
    @Query('entityType') entityType?: string,
  ) {
    return this.jobs.list(this.orgOf(user), { queue, status, entityType });
  }

  @Get('jobs/:id')
  get(@CurrentUser() user: RequestPrincipal, @Param('id') id: string) {
    return this.jobs.get(this.orgOf(user), id);
  }

  @Get('jobs/:id/logs')
  logs(@CurrentUser() user: RequestPrincipal, @Param('id') id: string) {
    return this.jobs.logs(this.orgOf(user), id);
  }

  @Post('jobs/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: RequestPrincipal, @Param('id') id: string) {
    return this.jobs.cancel(this.orgOf(user), id);
  }

  @Post('jobs/:id/retry')
  @HttpCode(200)
  retry(@CurrentUser() user: RequestPrincipal, @Param('id') id: string) {
    return this.jobs.retry(this.orgOf(user), id);
  }

  /** Demo endpoint to prove the async pipeline end-to-end (P1-08). */
  @Post('jobs/demo')
  @HttpCode(202)
  demo(@CurrentUser() user: RequestPrincipal) {
    return this.jobs.enqueue(this.orgOf(user), QUEUES.demo, 'demo', { ping: 'pong' });
  }
}
