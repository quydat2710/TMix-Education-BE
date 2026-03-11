import { Column, CreateDateColumn, DeleteDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { TeacherEntity } from "modules/teachers/entities/teacher.entity";
import { ClassEntity } from "modules/classes/entities/class.entity";
import { TestAttemptEntity } from "./test-attempt.entity";

/**
 * Multiple Choice Question (stored as JSONB inside Test)
 */
export class MCQuestion {
    @Column()
    id: string;

    @Column()
    question: string;

    @Column("text", { array: true })
    options: string[]; // 4 options (A, B, C, D)

    @Column()
    correctAnswer: number; // Index 0-3

    @Column({ nullable: true })
    explanation: string;

    @Column({ default: 1 })
    points: number;
}

@Entity('tests')
export class TestEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    title: string;

    @Column({ nullable: true })
    description: string;

    @Column()
    classId: string;

    @Column()
    teacherId: string;

    @Column()
    duration: number; // in minutes

    @Column({ default: 0 })
    totalPoints: number;

    @Column({ default: 70 })
    passingScore: number; // percentage 0-100

    @Column('jsonb', { default: [] })
    questions: MCQuestion[];

    @Column({ enum: ['draft', 'published', 'archived'], default: 'draft' })
    status: string;

    @ManyToOne(() => ClassEntity)
    @JoinColumn({ name: 'classId' })
    class: ClassEntity;

    @ManyToOne(() => TeacherEntity)
    @JoinColumn({ name: 'teacherId' })
    teacher: TeacherEntity;

    @OneToMany(() => TestAttemptEntity, attempt => attempt.test)
    attempts: TestAttemptEntity[];

    @CreateDateColumn({ type: "timestamp" })
    createdAt: Date;

    @UpdateDateColumn({ type: "timestamp" })
    updatedAt: Date;

    @DeleteDateColumn()
    deletedAt?: Date;
}
