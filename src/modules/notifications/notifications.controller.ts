import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Sse,
  MessageEvent,
  Req,
} from '@nestjs/common';
import { Observable, fromEvent, map, filter } from 'rxjs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationsService } from './notifications.service';
import { SendNotificationDto } from './dto/send-notification.dto';
import { UserInfo } from '@/decorator/customize.decorator';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * SSE endpoint — realtime notification stream for the authenticated user
   * Client connects via EventSource to receive notifications as they happen
   */
  @Sse('stream')
  stream(@UserInfo() user: any): Observable<MessageEvent> {
    const userId = user.id;

    return new Observable<MessageEvent>((subscriber) => {
      const handler = (notification: any) => {
        subscriber.next({
          data: JSON.stringify(notification),
          type: 'notification',
        } as MessageEvent);
      };

      // Listen for events targeted at this user
      this.eventEmitter.on(`notification.${userId}`, handler);

      // Cleanup when client disconnects
      return () => {
        this.eventEmitter.removeListener(`notification.${userId}`, handler);
      };
    });
  }

  /**
   * Get paginated notifications for the authenticated user
   */
  @Get()
  async findAll(
    @UserInfo() user: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('isRead') isRead?: string,
  ) {
    const isReadFilter = isRead !== undefined ? isRead === 'true' : undefined;
    return this.notificationsService.findAllByUser(
      user.id,
      { page: parseInt(page) || 1, limit: parseInt(limit) || 10 },
      isReadFilter,
    );
  }

  /**
   * Get unread notification count
   */
  @Get('unread-count')
  async getUnreadCount(@UserInfo() user: any) {
    const count = await this.notificationsService.getUnreadCount(user.id);
    return { count };
  }

  /**
   * Mark a specific notification as read
   */
  @Patch(':id/read')
  async markAsRead(
    @Param('id') id: string,
    @UserInfo() user: any,
  ) {
    return this.notificationsService.markAsRead(id, user.id);
  }

  /**
   * Mark all notifications as read
   */
  @Patch('read-all')
  async markAllAsRead(@UserInfo() user: any) {
    await this.notificationsService.markAllAsRead(user.id);
    return { message: 'All notifications marked as read' };
  }

  /**
   * Admin sends a notification
   */
  @Post('send')
  async send(@Body() dto: SendNotificationDto) {
    return this.notificationsService.adminSend(dto);
  }

  /**
   * Delete a notification
   */
  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @UserInfo() user: any,
  ) {
    const success = await this.notificationsService.remove(id, user.id);
    return { success };
  }

  /**
   * Register a device token for FCM push notifications
   */
  @Post('register-device')
  async registerDevice(
    @UserInfo() user: any,
    @Body() body: { token: string; platform: string },
  ) {
    await this.notificationsService.registerDeviceToken(
      user.id,
      body.token,
      body.platform || 'android',
    );
    return { message: 'Device token registered' };
  }
}
