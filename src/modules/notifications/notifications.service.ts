import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationEntity, NotificationType } from './entities/notification.entity';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { SendNotificationDto } from './dto/send-notification.dto';
import { IPaginationOptions } from '@/utils/types/pagination-options';
import { UserEntity } from '@/modules/users/entities/user.entity';
import { ClassStudentEntity } from '@/modules/classes/entities/class-student.entity';
import { StudentEntity } from '@/modules/students/entities/student.entity';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(NotificationEntity)
    private notificationRepo: Repository<NotificationEntity>,
    @InjectRepository(UserEntity)
    private userRepo: Repository<UserEntity>,
    @InjectRepository(ClassStudentEntity)
    private classStudentRepo: Repository<ClassStudentEntity>,
    @InjectRepository(StudentEntity)
    private studentRepo: Repository<StudentEntity>,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Create a single notification and emit SSE event
   */
  async create(dto: CreateNotificationDto): Promise<NotificationEntity> {
    const notification = this.notificationRepo.create({
      type: dto.type || NotificationType.GENERAL,
      title: dto.title,
      message: dto.message,
      link: dto.link,
      recipientId: dto.recipientId,
    });

    const saved = await this.notificationRepo.save(notification);

    // Emit SSE event for realtime delivery
    this.eventEmitter.emit(`notification.${dto.recipientId}`, saved);
    this.logger.log(`Notification sent to user ${dto.recipientId}: ${dto.title}`);

    return saved;
  }

  /**
   * Send notification to a specific user
   */
  async sendToUser(
    userId: string,
    data: { type?: NotificationType; title: string; message: string; link?: string },
  ): Promise<NotificationEntity> {
    return this.create({
      ...data,
      recipientId: userId,
    });
  }

  /**
   * Send notification to all users with a specific role
   */
  async sendToRole(
    roleName: string,
    data: { type?: NotificationType; title: string; message: string; link?: string },
  ): Promise<NotificationEntity[]> {
    const users = await this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .where('role.name = :roleName', { roleName })
      .getMany();

    const notifications: NotificationEntity[] = [];
    for (const user of users) {
      const notification = await this.create({
        ...data,
        recipientId: user.id,
      });
      notifications.push(notification);
    }

    return notifications;
  }

  /**
   * Send notification to all students in a class
   */
  async sendToClass(
    classId: string,
    data: { type?: NotificationType; title: string; message: string; link?: string },
  ): Promise<NotificationEntity[]> {
    this.logger.log(`sendToClass called for classId: ${classId}`);

    const classStudents = await this.classStudentRepo.find({
      where: { classId: classId as any, isActive: true },
      relations: ['student'],
    });

    this.logger.log(`Found ${classStudents.length} active students in class ${classId}`);

    const notifications: NotificationEntity[] = [];
    for (const cs of classStudents) {
      const studentId = cs.student?.id || cs.studentId;
      if (studentId) {
        this.logger.log(`Sending notification to student: ${studentId}`);
        try {
          const notification = await this.create({
            ...data,
            recipientId: String(studentId),
          });
          notifications.push(notification);
        } catch (err) {
          this.logger.warn(`Failed to create notification for student ${studentId}: ${err.message}`);
        }
      }
    }

    this.logger.log(`Successfully sent ${notifications.length} notifications for class ${classId}`);
    return notifications;
  }

  /**
   * Send notification to the parent of a student
   */
  async sendToParentOfStudent(
    studentId: string,
    data: { type?: NotificationType; title: string; message: string; link?: string },
  ): Promise<NotificationEntity | null> {
    try {
      const student = await this.studentRepo.findOne({
        where: { id: studentId },
        relations: ['parent'],
      });

      if (student?.parent) {
        this.logger.log(`Sending parent notification to ${student.parent.id} for student ${studentId}`);
        return this.create({
          ...data,
          recipientId: student.parent.id,
        });
      } else {
        this.logger.log(`No parent found for student ${studentId}`);
      }
    } catch (err) {
      this.logger.warn(`Failed to send parent notification for student ${studentId}: ${err.message}`);
    }
    return null;
  }

  /**
   * Admin sends a notification (to role, class, specific user, or all)
   */
  async adminSend(dto: SendNotificationDto): Promise<{ count: number }> {
    const data = {
      type: dto.type || NotificationType.GENERAL,
      title: dto.title,
      message: dto.message,
      link: dto.link,
    };

    let notifications: NotificationEntity[] = [];

    if (dto.recipientId) {
      // Send to specific user
      const n = await this.sendToUser(dto.recipientId, data);
      notifications = [n];
    } else if (dto.classId) {
      // Send to all students in a class
      notifications = await this.sendToClass(dto.classId, data);
    } else if (dto.recipientRole && dto.recipientRole !== 'all') {
      // Send to all users with a specific role
      notifications = await this.sendToRole(dto.recipientRole, data);
    } else {
      // Send to all users
      const users = await this.userRepo.find();
      for (const user of users) {
        const n = await this.create({
          ...data,
          recipientId: user.id,
        });
        notifications.push(n);
      }
    }

    return { count: notifications.length };
  }

  /**
   * Get paginated notifications for a user
   */
  async findAllByUser(
    userId: string,
    paginationOptions: IPaginationOptions,
    isReadFilter?: boolean,
  ) {
    const { page, limit } = paginationOptions;

    const queryBuilder = this.notificationRepo
      .createQueryBuilder('notification')
      .where('notification.recipientId = :userId', { userId })
      .orderBy('notification.createdAt', 'DESC');

    if (isReadFilter !== undefined) {
      queryBuilder.andWhere('notification.isRead = :isRead', { isRead: isReadFilter });
    }

    const totalItems = await queryBuilder.getCount();
    const result = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return {
      meta: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
      result,
    };
  }

  /**
   * Get unread count for a user
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationRepo.count({
      where: { recipientId: userId, isRead: false },
    });
  }

  /**
   * Mark a single notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<NotificationEntity> {
    const notification = await this.notificationRepo.findOne({
      where: { id: notificationId, recipientId: userId },
    });

    if (!notification) {
      return null;
    }

    notification.isRead = true;
    return this.notificationRepo.save(notification);
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<void> {
    await this.notificationRepo.update(
      { recipientId: userId, isRead: false },
      { isRead: true },
    );
  }

  /**
   * Delete a notification
   */
  async remove(notificationId: string, userId: string): Promise<boolean> {
    const result = await this.notificationRepo.delete({
      id: notificationId,
      recipientId: userId,
    });
    return result.affected > 0;
  }
}
