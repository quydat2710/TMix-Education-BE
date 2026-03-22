import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Index,
} from "typeorm";

export enum NotificationType {
  NEW_TEST = 'new_test',
  TEST_RESULT = 'test_result',
  PAYMENT_REMINDER = 'payment_reminder',
  PAYMENT_SUCCESS = 'payment_success',
  NEW_REGISTRATION = 'new_registration',
  SCHEDULE_CHANGE = 'schedule_change',
  GENERAL = 'general',
}

@Entity('notifications')
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: NotificationType,
    default: NotificationType.GENERAL,
  })
  type: NotificationType;

  @Column()
  title: string;

  @Column('text')
  message: string;

  @Column({ nullable: true })
  link: string;

  @Index()
  @Column()
  recipientId: string;

  @Column({ default: false })
  @Index()
  isRead: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
