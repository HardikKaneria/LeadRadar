import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { extensionTokenCreateSchema, type ExtensionTokenCreateInput } from '@radar/contracts';
import { ValidationError } from '@radar/core';
import { CurrentUser, type RequestPrincipal } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ExtensionService } from './extension.service';

@ApiTags('extension')
@Controller('extension')
export class ExtensionController {
  constructor(private readonly extension: ExtensionService) {}

  @Get('tokens')
  @RequirePermission('extension.use')
  listTokens(@CurrentUser() user: RequestPrincipal) {
    return this.extension.listTokens(this.orgOf(user));
  }

  @Post('tokens')
  @RequirePermission('extension.use')
  createToken(
    @CurrentUser() user: RequestPrincipal,
    @Body(new ZodValidationPipe(extensionTokenCreateSchema)) body: ExtensionTokenCreateInput,
  ) {
    return this.extension.createToken(this.orgOf(user), user.userId, body);
  }

  @Delete('tokens/:id')
  @HttpCode(204)
  @RequirePermission('extension.use')
  async revokeToken(@CurrentUser() user: RequestPrincipal, @Param('id') id: string) {
    await this.extension.revokeToken(this.orgOf(user), id);
  }

  @Get('health')
  @RequirePermission('extension.use')
  health(@CurrentUser() user: RequestPrincipal) {
    return this.extension.health(this.orgOf(user));
  }

  private orgOf(user: RequestPrincipal): string {
    if (!user.organizationId) {
      throw new ValidationError('Missing x-organization-id header');
    }
    return user.organizationId;
  }
}
