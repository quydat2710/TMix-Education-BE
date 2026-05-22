import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ClassesService } from 'modules/classes/classes.service';
import { PaymentsService } from 'modules/payments/payments.service';
import { SessionsService } from 'modules/sessions/sessions.service';
import { NotificationsService } from 'modules/notifications/notifications.service';
import { NotificationType } from 'modules/notifications/entities/notification.entity';
import { AuditSubscriber } from 'subscribers/audit-log.subscriber';
import dayjs from '@/utils/dayjs.config';

@Injectable()
export class CronService implements OnModuleInit {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly classesService: ClassesService,
    private readonly paymentsService: PaymentsService,
    private readonly sessionsService: SessionsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async onModuleInit() {
    // Cập nhật status lớp học ngay khi server khởi động
    try {
      AuditSubscriber.skipAuditLog = true;
      const result = await this.classesService.updateClassStatus();
      AuditSubscriber.skipAuditLog = false;
      this.logger.log(`[Startup] Class status updated: ${result.updated}/${result.checked} classes`);
    } catch (e) {
      this.logger.warn(`[Startup] Failed to update class status: ${e.message}`);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async updateClassStatusCron() {
    AuditSubscriber.skipAuditLog = true;
    this.logger.log('Automatically updating class status...');
    await this.classesService.updateClassStatus();
     AuditSubscriber.skipAuditLog = false;
    return 'Class status updated successfully.';
  }

  /**
   * Generate monthly invoices on the 5th of each month at 8:00 AM.
   * - Calculates estimated lessons based on class schedule
   * - Applies carry-over credit from previous month absences
   * - Sends notification to each parent with invoice details
   */
  @Cron('0 8 5 * *')
  async generateMonthlyInvoicesCron() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    this.logger.log(`[Cron] Generating invoices for ${month}/${year}...`);

    try {
      const result = await this.paymentsService.generateInvoices(month, year);
      this.logger.log(`[Cron] Invoice generation complete: ${result.generated} invoices created for ${month}/${year}`);
      return result;
    } catch (error) {
      this.logger.error(`[Cron] Invoice generation failed for ${month}/${year}: ${error.message}`);
    }
  }

  /**
   * Nhắc nhở giáo viên điểm danh — chạy mỗi 30 phút từ 8:00 đến 21:30.
   * Chỉ nhắc cho lớp đã qua giờ kết thúc buổi học và chưa được điểm danh.
   * De-duplicate: chỉ gửi 1 lần/ngày/lớp (kiểm tra notification đã gửi qua link field).
   */
  @Cron('0 */30 8-21 * *')
  async remindAttendanceCron() {
    this.logger.log('[Cron] Checking attendance reminders...');

    try {
      const classes = await this.classesService.getActiveClassesScheduledToday();
      const now = dayjs();
      let reminded = 0;

      for (const cls of classes) {
        // Chỉ nhắc cho lớp đã qua giờ kết thúc
        const endTime = dayjs().hour(
          parseInt(cls.schedule.time_slots.end_time.split(':')[0])
        ).minute(
          parseInt(cls.schedule.time_slots.end_time.split(':')[1])
        ).second(0);

        if (now.isBefore(endTime)) continue;

        // Kiểm tra đã có session hôm nay chưa
        const hasSession = await this.sessionsService.hasSessionToday(cls.id);
        if (hasSession) continue;

        // Kiểm tra giáo viên có được gán cho lớp không
        if (!cls.teacher?.id) continue;

        // De-duplicate: kiểm tra đã gửi reminder hôm nay cho lớp này chưa
        const alreadySent = await this.notificationsService.hasNotificationToday(
          cls.teacher.id,
          NotificationType.ATTENDANCE_REMINDER,
          `attendance-reminder:${cls.id}`,
        );
        if (alreadySent) continue;

        // Gửi notification nhắc nhở
        await this.notificationsService.sendToUser(cls.teacher.id, {
          type: NotificationType.ATTENDANCE_REMINDER,
          title: '⏰ Nhắc điểm danh',
          message: `Lớp ${cls.name} hôm nay chưa được điểm danh. Vui lòng điểm danh trước 22:00 để tránh hệ thống tự tạo phiên vắng mặt.`,
          link: `attendance-reminder:${cls.id}`,
        });
        reminded++;
      }

      if (reminded > 0) {
        this.logger.log(`[Cron] Attendance reminder sent for ${reminded} classes`);
      }
    } catch (error) {
      this.logger.error(`[Cron] Attendance reminder failed: ${error.message}`);
    }
  }

  /**
   * Tự động tạo phiên điểm danh — chạy lúc 22:00 hàng ngày.
   * Tạo session cho các lớp có lịch học hôm nay nhưng chưa được điểm danh.
   * Tất cả học sinh mặc định "vắng mặt". Giáo viên có 24h để chỉnh sửa.
   */
  @Cron('0 22 * * *')
  async autoCreateAttendanceCron() {
    this.logger.log('[Cron] Auto-creating attendance sessions...');

    try {
      const classes = await this.classesService.getActiveClassesScheduledToday();
      let created = 0;

      for (const cls of classes) {
        const hasSession = await this.sessionsService.hasSessionToday(cls.id);
        if (hasSession) continue;

        // Tự động tạo session với tất cả học sinh là "absent"
        await this.sessionsService.createSessionForClass(cls.id);
        created++;

        // Gửi thông báo cho giáo viên
        if (cls.teacher?.id) {
          await this.notificationsService.sendToUser(cls.teacher.id, {
            type: NotificationType.ATTENDANCE_REMINDER,
            title: '📋 Tự động điểm danh',
            message: `Hệ thống đã tự động tạo phiên điểm danh cho lớp ${cls.name} với trạng thái mặc định "vắng mặt". Bạn có thể chỉnh sửa trong vòng 24 giờ.`,
            link: `auto-attendance:${cls.id}`,
          });
        }
      }

      this.logger.log(`[Cron] Auto-created ${created} attendance sessions`);
    } catch (error) {
      this.logger.error(`[Cron] Auto-create attendance failed: ${error.message}`);
    }
  }

  async updateClassStatusManual() {
    this.logger.log('Manually updating class status...');
    await this.classesService.updateClassStatus();
    return 'Class status updated successfully.';
  }
}
