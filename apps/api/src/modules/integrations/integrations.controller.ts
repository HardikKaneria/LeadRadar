import { Controller, Get, Post, Delete, Param, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser, type RequestPrincipal } from '../../common/decorators/current-user.decorator';
import type { IntegrationAccountDto, ConnectIntegrationDto } from '@radar/contracts';

@Controller('v1/integrations')
@UseGuards(SupabaseAuthGuard)
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Get()
  @RequirePermission('integrations.manage')
  async getIntegrations(@CurrentUser() user: RequestPrincipal): Promise<IntegrationAccountDto[]> {
    if (!user.organizationId) throw new BadRequestException('Organization context required');
    return this.integrationsService.getIntegrations(user.organizationId);
  }

  @Post()
  @RequirePermission('integrations.manage')
  async connectIntegration(
    @CurrentUser() user: RequestPrincipal,
    @Body() dto: ConnectIntegrationDto,
  ): Promise<IntegrationAccountDto> {
    if (!user.organizationId) throw new BadRequestException('Organization context required');
    return this.integrationsService.connectIntegration(user.organizationId, user.userId, dto);
  }

  @Delete(':id')
  @RequirePermission('integrations.manage')
  async disconnectIntegration(
    @CurrentUser() user: RequestPrincipal,
    @Param('id') id: string,
  ): Promise<void> {
    if (!user.organizationId) throw new BadRequestException('Organization context required');
    await this.integrationsService.disconnectIntegration(user.organizationId, id);
  }
}
