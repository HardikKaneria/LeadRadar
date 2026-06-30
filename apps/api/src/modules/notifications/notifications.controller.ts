import { Controller, Get, Patch, Put, Body, Param, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CurrentUser, RequestPrincipal } from '../../common/decorators/current-user.decorator';
import {
  NotificationDto,
  NotificationPreferenceDto,
  NotificationUpdateDto,
  NotificationPreferenceUpdateDto,
} from '@radar/contracts';

@Controller('v1/notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async listNotifications(@CurrentUser() user: RequestPrincipal): Promise<NotificationDto[]> {
    return this.notificationsService.listNotifications(user.userId);
  }

  @Patch(':id')
  async updateNotification(
    @CurrentUser() user: RequestPrincipal,
    @Param('id') id: string,
    @Body() update: NotificationUpdateDto
  ): Promise<{ success: boolean }> {
    await this.notificationsService.markAsRead(user.userId, id, update);
    return { success: true };
  }

  @Put('read-all')
  async markAllAsRead(@CurrentUser() user: RequestPrincipal): Promise<{ success: boolean }> {
    await this.notificationsService.markAllAsRead(user.userId);
    return { success: true };
  }

  @Get('preferences')
  async getPreferences(@CurrentUser() user: RequestPrincipal): Promise<NotificationPreferenceDto> {
    return this.notificationsService.getPreferences(user.userId, user.organizationId!);
  }

  @Put('preferences')
  async updatePreferences(
    @CurrentUser() user: RequestPrincipal,
    @Body() update: NotificationPreferenceUpdateDto
  ): Promise<NotificationPreferenceDto> {
    return this.notificationsService.updatePreferences(user.userId, user.organizationId!, update);
  }
}
