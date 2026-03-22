import { Module } from '@nestjs/common';
import { RegistrationsService } from './registrations.service';
import { RegistrationsController } from './registrations.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RegistrationEntity } from './entities/registration.entity';
import { ClassEntity } from '../classes/entities/class.entity';
import { RegistrationRepository } from './registration.repository';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TypeOrmModule.forFeature([RegistrationEntity, ClassEntity]), NotificationsModule],
  controllers: [RegistrationsController],
  providers: [RegistrationsService, RegistrationRepository],
  exports: [RegistrationsService, RegistrationRepository],
})
export class RegistrationsModule {}
