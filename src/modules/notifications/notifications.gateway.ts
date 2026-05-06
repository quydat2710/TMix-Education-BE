import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AllConfigType } from '@/config/config.type';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationEntity } from './entities/notification.entity';
import { NotificationsService } from './notifications.service';

/**
 * WebSocket Gateway for real-time notification delivery.
 *
 * Architecture Notes:
 * ─────────────────────────────────────────────────────────────
 * The notification system uses a dual-channel approach:
 *
 *   1. SSE (Server-Sent Events) — Primary channel
 *      → NotificationsController @Sse('stream')
 *      → One-way server-to-client push
 *      → No additional dependencies (browser-native EventSource)
 *
 *   2. WebSocket (Socket.IO) — Secondary / Enhanced channel
 *      → This gateway (NotificationsGateway)
 *      → Bi-directional: supports mark-read from client via socket
 *      → Better suited for future features (chat, online status)
 *
 * Both channels listen to the same EventEmitter2 events:
 *   → NotificationsService.create() emits `notification.{userId}`
 *   → SSE controller and WebSocket gateway both receive and push
 *
 * Frontend should connect to ONE channel (SSE or WebSocket), not both,
 * to avoid duplicate notifications.
 * ─────────────────────────────────────────────────────────────
 */

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/notifications',
})
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);
  // Map userId -> Set of socketIds
  private userSockets = new Map<string, Set<string>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AllConfigType>,
    private readonly notificationsService: NotificationsService,
  ) {}

  afterInit() {
    this.logger.log('🔌 WebSocket Gateway initialized (namespace: /notifications)');
  }

  /**
   * On client connect: authenticate via JWT token and join user-specific room.
   */
  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Client ${client.id} rejected: no token`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('jwt.jwt_access_secret', { infer: true }),
      });

      const userId = payload.id;
      client.data.userId = userId;

      // Track socket per user
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId).add(client.id);

      // Join user-specific room for targeted notifications
      client.join(`user:${userId}`);

      this.logger.log(`✓ Client connected: ${client.id} (user: ${userId})`);

      // Send unread count on connect
      const unreadCount = await this.notificationsService.getUnreadCount(userId);
      client.emit('unread-count', { count: unreadCount });
    } catch (error) {
      this.logger.warn(`Client ${client.id} auth failed: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data?.userId;
    if (userId && this.userSockets.has(userId)) {
      this.userSockets.get(userId).delete(client.id);
      if (this.userSockets.get(userId).size === 0) {
        this.userSockets.delete(userId);
      }
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Listen for EventEmitter2 events from NotificationsService.
   * When a new notification is created, push it to the user's connected sockets.
   */
  @OnEvent('notification.*')
  handleNotificationEvent(notification: NotificationEntity) {
    const userId = notification.recipientId;
    this.server.to(`user:${userId}`).emit('new-notification', {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      link: notification.link,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
    });
    this.logger.log(`📨 Pushed notification to user:${userId} via WebSocket`);
  }

  /**
   * Client marks a notification as read via WebSocket.
   */
  @SubscribeMessage('mark-read')
  async handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { notificationId: string },
  ) {
    const userId = client.data?.userId;
    if (!userId) return;

    await this.notificationsService.markAsRead(data.notificationId, userId);
    const unreadCount = await this.notificationsService.getUnreadCount(userId);
    client.emit('unread-count', { count: unreadCount });
  }

  /**
   * Client marks all notifications as read.
   */
  @SubscribeMessage('mark-all-read')
  async handleMarkAllRead(@ConnectedSocket() client: Socket) {
    const userId = client.data?.userId;
    if (!userId) return;

    await this.notificationsService.markAllAsRead(userId);
    client.emit('unread-count', { count: 0 });
  }

  /**
   * Get count of online connections (for admin dashboard).
   */
  getOnlineUsersCount(): number {
    return this.userSockets.size;
  }
}
