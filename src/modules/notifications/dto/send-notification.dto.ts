import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { NotificationType } from '../entities/notification.entity';

export class SendNotificationDto {
  @IsEnum(NotificationType)
  @IsOptional()
  type?: NotificationType;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsString()
  @IsOptional()
  link?: string;

  @IsString()
  @IsOptional()
  recipientRole?: string; // 'admin' | 'teacher' | 'student' | 'parent' | 'all'

  @IsUUID()
  @IsOptional()
  recipientId?: string; // Send to specific user

  @IsUUID()
  @IsOptional()
  classId?: string; // Send to all students in a class
}
