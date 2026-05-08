import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GroqService } from '../ai/groq.service';
import { SendMessageDto, ChatMode } from './dto/send-message.dto';
import { BASE_SYSTEM_PROMPT, MODE_PROMPTS, buildStudentContext } from './chatbot.prompts';
import { TestAttemptEntity } from '../tests/entities/test-attempt.entity';
import { ClassStudentEntity } from '../classes/entities/class-student.entity';

/**
 * User info extracted from JWT token
 */
export interface ChatUser {
    id: string;
    name: string;
    email: string;
    role: { id: number; name: string };
}

@Injectable()
export class ChatbotService {
    private readonly logger = new Logger(ChatbotService.name);

    /** Temperature settings per mode for optimal output quality */
    private readonly modeTemperature: Record<string, number> = {
        general: 0.5,
        grammar: 0.3,     // Low — precise explanations
        correct: 0.2,     // Very low — accurate error detection
        quiz: 0.6,        // Medium — varied questions
        conversation: 0.7, // Higher — natural conversation flow
    };

    constructor(
        private readonly groqService: GroqService,
        @InjectRepository(TestAttemptEntity)
        private readonly testAttemptRepo: Repository<TestAttemptEntity>,
        @InjectRepository(ClassStudentEntity)
        private readonly classStudentRepo: Repository<ClassStudentEntity>,
    ) {}

    /**
     * Check if chatbot is configured and ready.
     */
    isReady(): boolean {
        return this.groqService.isConfigured();
    }

    /**
     * Send a message to the AI chatbot and get a context-aware reply.
     * @param dto - message + optional conversation history + mode
     * @param user - authenticated user from JWT (optional for backward compatibility)
     * @returns AI reply string
     */
    async sendMessage(dto: SendMessageDto, user?: ChatUser): Promise<string> {
        const mode = dto.mode || 'general';

        // Build context-aware system prompt
        const systemPrompt = await this.buildSystemPrompt(mode, user);

        const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
            { role: 'system', content: systemPrompt },
        ];

        // Add conversation history (last 20 messages max)
        if (dto.history && dto.history.length > 0) {
            const recent = dto.history.slice(-20);
            for (const msg of recent) {
                messages.push({ role: msg.role, content: msg.content });
            }
        }

        // Add current message
        messages.push({ role: 'user', content: dto.message });

        try {
            const temperature = this.modeTemperature[mode] ?? 0.4;
            const reply = await this.groqService.chatCompletion(messages, {
                temperature,
                maxTokens: mode === 'correct' ? 3000 : 2048, // Correction mode needs more tokens for tables
            });

            this.logger.log(
                `Chatbot [${mode}] reply (${reply.length} chars) for user=${user?.name || 'anonymous'}: "${dto.message.substring(0, 50)}..."`,
            );
            return reply;
        } catch (error: any) {
            this.logger.error(`Chatbot error [${mode}]: ${error.message}`);
            throw new Error('AI service temporarily unavailable. Please try again.');
        }
    }

    /**
     * Build a context-aware system prompt based on mode and student data.
     */
    private async buildSystemPrompt(mode: ChatMode, user?: ChatUser): Promise<string> {
        const parts: string[] = [BASE_SYSTEM_PROMPT];

        // Add mode-specific instructions
        if (mode !== 'general' && MODE_PROMPTS[mode]) {
            parts.push(MODE_PROMPTS[mode]);
        }

        // Inject student context if user is authenticated
        if (user?.id) {
            try {
                const studentContext = await this.getStudentContext(user.id, user.name);
                if (studentContext) {
                    parts.push(studentContext);
                }
            } catch (error) {
                this.logger.warn(`Could not load student context for ${user.id}: ${error.message}`);
                // Continue without student context — don't break the chatbot
            }
        }

        return parts.join('\n\n');
    }

    /**
     * Query the database for student learning data and build a context string.
     */
    private async getStudentContext(studentId: string, studentName?: string): Promise<string | null> {
        // Get recent test attempts with test info
        const recentAttempts = await this.testAttemptRepo.find({
            where: { studentId },
            relations: ['test'],
            order: { createdAt: 'DESC' },
            take: 5,
        });

        // Get active class enrollments
        const classEnrollments = await this.classStudentRepo.find({
            where: { studentId: studentId as any, isActive: true },
            relations: ['class'],
        });

        // If no data at all, skip context injection
        if (recentAttempts.length === 0 && classEnrollments.length === 0) {
            return studentName
                ? `## 📋 STUDENT PROFILE\n- **Name**: ${studentName}\n- *New student — no learning data yet. Be extra welcoming and encouraging!*`
                : null;
        }

        // Compute scores and weak areas
        const recentScores = recentAttempts
            .filter(a => a.test)
            .map(a => ({
                title: a.test.title,
                percentage: Math.round(a.percentage),
                skillType: a.test.skillType || 'unknown',
            }));

        const averageScore =
            recentScores.length > 0
                ? Math.round(recentScores.reduce((sum, s) => sum + s.percentage, 0) / recentScores.length)
                : undefined;

        const weakAreas = this.detectWeakAreas(recentAttempts);

        const classes = classEnrollments
            .filter(e => e.class)
            .map(e => e.class.name);

        return buildStudentContext({
            studentName,
            classes,
            recentScores,
            averageScore,
            weakAreas,
        });
    }

    /**
     * Analyze test attempts to detect which skills the student is weakest in.
     */
    private detectWeakAreas(attempts: TestAttemptEntity[]): string[] {
        const skillScores: Record<string, number[]> = {};

        for (const attempt of attempts) {
            const skill = attempt.test?.skillType || 'unknown';
            if (!skillScores[skill]) skillScores[skill] = [];
            skillScores[skill].push(attempt.percentage);
        }

        return Object.entries(skillScores)
            .map(([skill, scores]) => ({
                skill,
                avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
            }))
            .filter(s => s.avg < 70)
            .sort((a, b) => a.avg - b.avg) // Weakest first
            .map(s => `${s.skill} (avg: ${s.avg}%)`);
    }
}
