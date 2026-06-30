import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  aiPrivacyModeUpdateSchema,
  aiProviderSettingsUpdateSchema,
  type AiPrivacyModeUpdateInput,
  type AiProviderSettingsUpdateInput,
} from '@radar/contracts';
import { ValidationError } from '@radar/core';
import { CurrentUser, type RequestPrincipal } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AiSettingsService } from './ai-settings.service';

@ApiTags('ai')
@Controller('ai')
export class AiSettingsController {
  constructor(private readonly settings: AiSettingsService) {}

  @Get('providers')
  @RequirePermission('ai.settings.manage')
  providers(@CurrentUser() user: RequestPrincipal) {
    return this.settings.listProviderSettings(this.orgOf(user));
  }

  @Put('providers/:name')
  @RequirePermission('ai.settings.manage')
  updateProvider(
    @CurrentUser() user: RequestPrincipal,
    @Param('name') name: string,
    @Body(new ZodValidationPipe(aiProviderSettingsUpdateSchema)) body: AiProviderSettingsUpdateInput,
  ) {
    return this.settings.updateProviderSetting(this.orgOf(user), user.userId, name, body);
  }

  @Get('privacy-mode')
  @RequirePermission('ai.settings.manage')
  privacyMode(@CurrentUser() user: RequestPrincipal) {
    return this.settings.getPrivacyMode(this.orgOf(user));
  }

  @Put('privacy-mode')
  @RequirePermission('ai.settings.manage')
  updatePrivacyMode(
    @CurrentUser() user: RequestPrincipal,
    @Body(new ZodValidationPipe(aiPrivacyModeUpdateSchema)) body: AiPrivacyModeUpdateInput,
  ) {
    return this.settings.updatePrivacyMode(this.orgOf(user), body.privacyMode);
  }

  private orgOf(user: RequestPrincipal): string {
    if (!user.organizationId) {
      throw new ValidationError('Missing x-organization-id header');
    }
    return user.organizationId;
  }
}
