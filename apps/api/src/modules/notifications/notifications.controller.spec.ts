import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import type { RequestPrincipal } from '../../common/decorators/current-user.decorator';
import type { NotificationUpdateDto } from '@radar/contracts';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let service: any;

  const mockUser: RequestPrincipal = {
    userId: 'u-1',
    email: 'test@test.com',
    organizationId: 'org-1',
    permissions: [],
  };

  beforeEach(() => {
    service = {
      listNotifications: jest.fn().mockResolvedValue([{ id: '1' }]),
      markAsRead: jest.fn().mockResolvedValue(undefined),
      markAllAsRead: jest.fn().mockResolvedValue(undefined),
      getPreferences: jest.fn().mockResolvedValue({ notifyLeadStale: true }),
      updatePreferences: jest.fn().mockResolvedValue({ notifyLeadStale: false }),
    };

    controller = new NotificationsController(service as unknown as NotificationsService);
  });

  it('should list notifications', async () => {
    const res = await controller.listNotifications(mockUser);
    expect(service.listNotifications).toHaveBeenCalledWith('u-1');
    expect(res).toHaveLength(1);
  });

  it('should mark a notification as read', async () => {
    const update: NotificationUpdateDto = { status: 'read' };
    const res = await controller.updateNotification(mockUser, 'notif-1', update);
    expect(service.markAsRead).toHaveBeenCalledWith('u-1', 'notif-1', update);
    expect(res.success).toBe(true);
  });

  it('should mark all notifications as read', async () => {
    const res = await controller.markAllAsRead(mockUser);
    expect(service.markAllAsRead).toHaveBeenCalledWith('u-1');
    expect(res.success).toBe(true);
  });

  it('should get preferences', async () => {
    const res = await controller.getPreferences(mockUser);
    expect(service.getPreferences).toHaveBeenCalledWith('u-1', 'org-1');
    expect(res.notifyLeadStale).toBe(true);
  });

  it('should update preferences', async () => {
    const res = await controller.updatePreferences(mockUser, { notifyLeadStale: false });
    expect(service.updatePreferences).toHaveBeenCalledWith('u-1', 'org-1', { notifyLeadStale: false });
    expect(res.notifyLeadStale).toBe(false);
  });
});
