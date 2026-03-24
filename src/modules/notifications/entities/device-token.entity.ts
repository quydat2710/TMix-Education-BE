import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('device_tokens')
export class DeviceTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  userId: string;

  @Column()
  token: string;

  @Column({ default: 'android' })
  platform: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;
}
