import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CronController } from './cron.controller';
import { CronService } from './cron.service';
import { ClassesModule } from 'modules/classes/classes.module';
import { PaymentsModule } from 'modules/payments/payments.module';
@Module({
  imports: [ScheduleModule.forRoot(), ClassesModule, PaymentsModule],
  controllers: [CronController],
  providers: [CronService],
})
export class CronModule {}
