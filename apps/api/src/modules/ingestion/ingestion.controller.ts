import { Body, Controller, Get, Headers, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  csvIngestionSchema,
  extensionBatchIngestionSchema,
  manualDiscoverySchema,
  type ExtensionBatchIngestionInput,
  type CsvIngestionInput,
  type ManualDiscoveryInput,
} from '@radar/contracts';
import { UnauthorizedError, ValidationError } from '@radar/core';
import { CurrentUser, type RequestPrincipal } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { IngestionService } from './ingestion.service';

@ApiTags('ingest')
@Controller()
export class IngestionController {
  constructor(private readonly ingestion: IngestionService) {}

  @Post('ingest/manual')
  @HttpCode(202)
  @RequirePermission('discoveries.write')
  manual(
    @CurrentUser() user: RequestPrincipal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(manualDiscoverySchema)) body: ManualDiscoveryInput,
  ) {
    return this.ingestion.enqueueManual(this.orgOf(user), user.userId, idempotencyKey, body);
  }

  @Post('ingest/csv')
  @HttpCode(202)
  @RequirePermission('discoveries.write')
  csv(
    @CurrentUser() user: RequestPrincipal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(csvIngestionSchema)) body: CsvIngestionInput,
  ) {
    return this.ingestion.enqueueCsvImport(this.orgOf(user), user.userId, idempotencyKey, body);
  }

  @Get('ingest/extension/ping')
  @Public()
  async ping(@Headers('authorization') authorization: string | undefined) {
    const token = this.captureTokenOf(authorization);
    const verified = await this.ingestion.verifyExtensionToken(token);
    return { ok: true, organizationId: verified.organizationId };
  }

  @Post('ingest/extension')
  @Public()
  @HttpCode(202)
  extension(
    @Headers('authorization') authorization: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(extensionBatchIngestionSchema)) body: ExtensionBatchIngestionInput,
  ) {
    return this.ingestion.enqueueExtensionBatch(this.captureTokenOf(authorization), idempotencyKey, body);
  }

  private orgOf(user: RequestPrincipal): string {
    if (!user.organizationId) {
      throw new ValidationError('Missing x-organization-id header');
    }
    return user.organizationId;
  }

  private captureTokenOf(authorization: string | undefined): string {
    if (!authorization) {
      throw new UnauthorizedError('Missing bearer token');
    }

    const [scheme, value] = authorization.split(' ');
    if (scheme !== 'Bearer' || !value?.trim()) {
      throw new UnauthorizedError('Invalid bearer token');
    }
    return value;
  }
}
