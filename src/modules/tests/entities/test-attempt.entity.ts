import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { TestEntity } from "./test.entity";
import { StudentEntity } from "modules/students/entities/student.entity";

@Entity('test_attempts')
export class TestAttemptEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    testId: string;

    @Column()
    studentId: string;

    @Column('jsonb', { default: [] })
    answers: any[]; // number[] (MC) | WritingAnswer[] | SpeakingAnswer[]

    @Column({ type: 'float', default: 0 })
    score: number; // Points earned

    @Column({ type: 'float', default: 0 })
    percentage: number; // Percentage score

    @Column({ default: false })
    passed: boolean;

    @Column('jsonb', { default: [] })
    feedback: string[]; // Feedback for each question

    @Column({ type: 'timestamp', nullable: true })
    startedAt: Date;

    @Column({ type: 'timestamp', nullable: true })
    submittedAt: Date;

    @Column({ type: 'timestamp', nullable: true })
    gradedAt: Date;

    @Column('jsonb', { nullable: true })
    aiGrading: any; // WritingGrading | SpeakingGrading — AI feedback

    @Column({ type: 'text', nullable: true })
    writingResponse: string; // Student's essay text

    @Column({ nullable: true })
    recordingUrl: string; // Student's speaking recording URL

    @Column({ type: 'text', nullable: true })
    transcription: string; // STT result from recording

    @ManyToOne(() => TestEntity, test => test.attempts)
    @JoinColumn({ name: 'testId' })
    test: TestEntity;

    @ManyToOne(() => StudentEntity)
    @JoinColumn({ name: 'studentId' })
    student: StudentEntity;

    @CreateDateColumn({ type: "timestamp" })
    createdAt: Date;

    @UpdateDateColumn({ type: "timestamp" })
    updatedAt: Date;
}
