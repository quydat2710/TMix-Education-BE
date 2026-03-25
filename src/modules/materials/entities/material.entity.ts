import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ClassEntity } from '@/modules/classes/entities/class.entity';

export enum MaterialCategory {
  GRAMMAR = 'grammar',
  VOCABULARY = 'vocabulary',
  LISTENING = 'listening',
  READING = 'reading',
  WRITING = 'writing',
  SPEAKING = 'speaking',
  OTHER = 'other',
}

export enum MaterialFileType {
  PDF = 'pdf',
  IMAGE = 'image',
  AUDIO = 'audio',
  VIDEO = 'video',
  DOCUMENT = 'document',
  OTHER = 'other',
}

@Entity('materials')
export class MaterialEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'enum', enum: MaterialCategory, default: MaterialCategory.OTHER })
  category: MaterialCategory;

  @Column()
  fileUrl: string;

  @Column({ nullable: true })
  filePublicId: string;

  @Column({ type: 'enum', enum: MaterialFileType, default: MaterialFileType.OTHER })
  fileType: MaterialFileType;

  @Column({ nullable: true })
  originalFileName: string;

  @Column({ type: 'bigint', nullable: true })
  fileSize: number;

  @Index()
  @Column()
  classId: string;

  @ManyToOne(() => ClassEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'classId' })
  class: ClassEntity;

  @Column()
  uploadedById: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;
}
