import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CronController } from './cron.controller';
import { CronService } from './cron.service';
import { ClassesModule } from 'modules/classes/classes.module';
import { PaymentsModule } from 'modules/payments/payments.module';
import { SessionsModule } from 'modules/sessions/sessions.module';
import { NotificationsModule } from 'modules/notifications/notifications.module';
@Module({
  imports: [ScheduleModule.forRoot(), ClassesModule, PaymentsModule, SessionsModule, NotificationsModule],
  controllers: [CronController],
  providers: [CronService],
})
export class CronModule {}
