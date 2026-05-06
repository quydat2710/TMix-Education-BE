import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationEntity } from './entities/notification.entity';
import { UserEntity } from '@/modules/users/entities/user.entity';
import { ClassStudentEntity } from '@/modules/classes/entities/class-student.entity';
import { StudentEntity } from '@/modules/students/entities/student.entity';
import { DeviceTokenEntity } from './entities/device-token.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NotificationEntity,
      UserEntity,
      ClassStudentEntity,
      StudentEntity,
      DeviceTokenEntity,
    ]),
    JwtModule.register({}),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsGateway],
  exports: [NotificationsService, NotificationsGateway],
})
export class NotificationsModule {}
