import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { TestEntity } from "./test.entity";

@Entity('test_audio_files')
export class TestAudioFileEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    testId: string;

    @Column({ nullable: true })
    questionId: string; // Matches question.id in JSONB

    @Column({ default: 'upload' })
    source: string; // 'upload' | 'tts'

    @Column({ type: 'text', nullable: true })
    originalText: string; // Original text if generated via TTS

    @Column()
    audioUrl: string;

    @Column({ nullable: true })
    duration: number; // Duration in seconds

    @ManyToOne(() => TestEntity)
    @JoinColumn({ name: 'testId' })
    test: TestEntity;

    @CreateDateColumn({ type: "timestamp" })
    createdAt: Date;
}
