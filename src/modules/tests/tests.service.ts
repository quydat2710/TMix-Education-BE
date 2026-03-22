import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TestEntity } from './entities/test.entity';
import { TestAttemptEntity } from './entities/test-attempt.entity';
import { CreateTestDto } from './dto/create-test.dto';
import { UpdateTestDto } from './dto/update-test.dto';
import { SubmitTestDto } from './dto/submit-test.dto';
import { SubmitWritingDto } from './dto/submit-skill.dto';
import { AiService } from '../ai/ai.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class TestsService {
    private readonly logger = new Logger(TestsService.name);

    constructor(
        @InjectRepository(TestEntity)
        private testRepository: Repository<TestEntity>,
        @InjectRepository(TestAttemptEntity)
        private attemptRepository: Repository<TestAttemptEntity>,
        private readonly aiService: AiService,
        private readonly notificationsService: NotificationsService,
    ) { }

    // ============================================
    // Teacher Methods
    // ============================================

    /**
     * Create a new test
     */
    async create(teacherId: string, createTestDto: CreateTestDto): Promise<TestEntity> {
        // Add IDs to questions and calculate total points
        const questions = createTestDto.questions.map((q, index) => ({
            ...q,
            id: uuidv4(),
        }));

        const totalPoints = questions.reduce((sum, q) => sum + (q.points || 10), 0);

        const test = this.testRepository.create({
            ...createTestDto,
            teacherId,
            questions,
            totalPoints,
            status: createTestDto.status || 'draft',
        });

        const saved = await this.testRepository.save(test);

        // If created directly as published, notify students
        if (saved.status === 'published' && saved.classId) {
            try {
                this.logger.log(`Test "${saved.title}" created as published, sending notifications for classId: ${saved.classId}`);
                await this.notificationsService.sendToClass(saved.classId, {
                    type: NotificationType.NEW_TEST,
                    title: 'Bài test mới',
                    message: `Giáo viên vừa tạo bài test "${saved.title}". Hãy vào làm bài nhé!`,
                    link: '/student/tests',
                });
            } catch (e) {
                this.logger.error(`Failed to send test notification on create: ${e.message}`, e.stack);
            }
        }

        return saved;
    }

    /**
     * Get all tests by teacher
     */
    async findByTeacher(teacherId: string, page = 1, limit = 10) {
        const [results, total] = await this.testRepository.findAndCount({
            where: { teacherId },
            relations: ['class', 'teacher'],
            order: { createdAt: 'DESC' },
            skip: (page - 1) * limit,
            take: limit,
        });

        return {
            meta: {
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                totalItems: total,
            },
            result: results,
        };
    }

    /**
     * Get test by ID (with correct answers - for teacher)
     */
    async findById(id: string): Promise<TestEntity> {
        const test = await this.testRepository.findOne({
            where: { id },
            relations: ['class', 'teacher'],
        });
        if (!test) throw new NotFoundException('Test not found');
        return test;
    }

    /**
     * Update a test
     */
    async update(id: string, teacherId: string, updateTestDto: UpdateTestDto): Promise<TestEntity> {
        const test = await this.findById(id);
        if (test.teacherId !== teacherId) {
            throw new ForbiddenException('You can only edit your own tests');
        }

        // Recalculate totalPoints if questions changed
        if (updateTestDto.questions) {
            const questions = updateTestDto.questions.map((q, index) => ({
                ...q,
                id: (q as any).id || uuidv4(),
            }));
            updateTestDto.questions = questions;
            (updateTestDto as any).totalPoints = questions.reduce((sum, q) => sum + q.points, 0);
        }

        Object.assign(test, updateTestDto);
        return this.testRepository.save(test);
    }

    /**
     * Delete a test (soft delete)
     */
    async delete(id: string, teacherId: string): Promise<void> {
        const test = await this.findById(id);
        if (test.teacherId !== teacherId) {
            throw new ForbiddenException('You can only delete your own tests');
        }
        await this.testRepository.softDelete(id);
    }

    /**
     * Publish a test
     */
    async publish(id: string, teacherId: string): Promise<TestEntity> {
        const test = await this.findById(id);
        if (test.teacherId !== teacherId) {
            throw new ForbiddenException('You can only publish your own tests');
        }
        if (!test.questions || test.questions.length === 0) {
            throw new BadRequestException('Cannot publish a test with no questions');
        }
        test.status = 'published';
        const saved = await this.testRepository.save(test);

        // Notify all students in the class
        try {
            this.logger.log(`Publishing test "${test.title}" for classId: ${test.classId}`);
            const notifResult = await this.notificationsService.sendToClass(test.classId, {
                type: NotificationType.NEW_TEST,
                title: 'Bài test mới',
                message: `Giáo viên vừa tạo bài test "${test.title}" cho lớp ${test.class?.name || ''}. Hãy vào làm bài nhé!`,
                link: '/student/tests',
            });
            this.logger.log(`Sent ${notifResult.length} notifications for published test`);
        } catch (e) {
            this.logger.error(`Failed to send test notification: ${e.message}`, e.stack);
        }

        return saved;
    }

    /**
     * Unpublish a test
     */
    async unpublish(id: string, teacherId: string): Promise<TestEntity> {
        const test = await this.findById(id);
        if (test.teacherId !== teacherId) {
            throw new ForbiddenException('You can only unpublish your own tests');
        }
        test.status = 'draft';
        return this.testRepository.save(test);
    }

    /**
     * Archive a test
     */
    async archive(id: string, teacherId: string): Promise<TestEntity> {
        const test = await this.findById(id);
        if (test.teacherId !== teacherId) {
            throw new ForbiddenException('You can only archive your own tests');
        }
        test.status = 'archived';
        return this.testRepository.save(test);
    }

    /**
     * Duplicate a test (create a copy, optionally for a different class)
     */
    async duplicate(id: string, teacherId: string, newClassId?: string): Promise<TestEntity> {
        const original = await this.findById(id);
        if (original.teacherId !== teacherId) {
            throw new ForbiddenException('You can only duplicate your own tests');
        }

        // Deep copy questions with new IDs
        const newQuestions = original.questions.map(q => ({
            ...q,
            id: uuidv4(),
        }));

        const duplicate = this.testRepository.create({
            title: `${original.title} (Bản sao)`,
            description: original.description,
            classId: newClassId || original.classId,
            teacherId,
            duration: original.duration,
            totalPoints: original.totalPoints,
            passingScore: original.passingScore,
            questions: newQuestions,
            status: 'draft',
        });

        return this.testRepository.save(duplicate);
    }

    // ============================================
    // Student Methods
    // ============================================

    /**
     * Get available tests for a student
     * Returns published tests from the student's enrolled classes
     */
    async getAvailableTests(studentId: string) {
        // Find all classes the student is enrolled in
        const tests = await this.testRepository
            .createQueryBuilder('test')
            .innerJoin('class_student', 'cs', 'cs.classId = test.classId AND cs.studentId = :studentId', { studentId })
            .leftJoinAndSelect('test.class', 'class')
            .leftJoinAndSelect('test.teacher', 'teacher')
            .where('test.status = :status', { status: 'published' })
            .andWhere('cs.isActive = true')
            .orderBy('test.createdAt', 'DESC')
            .getMany();

        // For each test, check if student has attempted it
        const testsWithAttempts = await Promise.all(
            tests.map(async (test) => {
                const lastAttempt = await this.attemptRepository.findOne({
                    where: { testId: test.id, studentId },
                    order: { submittedAt: 'DESC' },
                });

                return {
                    id: test.id,
                    title: test.title,
                    description: test.description,
                    className: test.class?.name || '',
                    teacherName: test.teacher?.name || '',
                    duration: test.duration,
                    totalPoints: test.totalPoints,
                    passingScore: test.passingScore,
                    questionCount: test.questions?.length || 0,
                    hasAttempted: !!lastAttempt,
                    lastAttempt: lastAttempt
                        ? {
                            score: lastAttempt.score,
                            percentage: lastAttempt.percentage,
                            passed: lastAttempt.passed,
                            submittedAt: lastAttempt.submittedAt,
                        }
                        : null,
                };
            }),
        );

        return testsWithAttempts;
    }

    /**
     * Get test for student (without correct answers)
     */
    async getTestForStudent(id: string, studentId: string): Promise<any> {
        const test = await this.testRepository.findOne({
            where: { id, status: 'published' },
            relations: ['class', 'teacher'],
        });
        if (!test) throw new NotFoundException('Test not found or not published');

        // For writing/speaking tests, return questions as-is (no MC answers to strip)
        if (test.skillType === 'writing' || test.skillType === 'speaking') {
            return {
                ...test,
            };
        }

        // Strip correct answers from MC questions (reading/listening)
        const questionsWithoutAnswers = test.questions.map(q => ({
            id: q.id,
            question: q.question,
            options: q.options,
            points: q.points,
            audioUrl: q.audioUrl, // Include per-question audio for listening
        }));

        return {
            ...test,
            questions: questionsWithoutAnswers,
        };
    }

    /**
     * Submit test and auto-grade
     */
    async submitTest(testId: string, studentId: string, submitDto: SubmitTestDto): Promise<TestAttemptEntity> {
        const test = await this.testRepository.findOne({
            where: { id: testId, status: 'published' },
        });
        if (!test) throw new NotFoundException('Test not found or not published');

        const { answers } = submitDto;

        // Auto-grade
        let score = 0;
        const feedback: string[] = [];
        const optionLabels = ['A', 'B', 'C', 'D'];

        for (let i = 0; i < test.questions.length; i++) {
            const question = test.questions[i];
            const studentAnswer = answers[i];
            const isCorrect = studentAnswer === question.correctAnswer;

            if (isCorrect) {
                score += question.points;
                feedback.push(`Câu ${i + 1}: ✅ Chính xác! ${question.explanation || ''}`);
            } else {
                const correctLabel = optionLabels[question.correctAnswer] || '?';
                feedback.push(
                    `Câu ${i + 1}: ❌ Sai. Đáp án đúng là ${correctLabel}. ${question.explanation || ''}`,
                );
            }
        }

        const percentage = test.totalPoints > 0
            ? Math.round((score / test.totalPoints) * 1000) / 10
            : 0;
        const passed = percentage >= test.passingScore;

        const attempt = this.attemptRepository.create({
            testId,
            studentId,
            answers,
            score,
            percentage,
            passed,
            feedback,
            startedAt: new Date(),
            submittedAt: new Date(),
            gradedAt: new Date(),
        });

        const saved = await this.attemptRepository.save(attempt);

        // Notify student of test result
        try {
            const test2 = await this.testRepository.findOne({ where: { id: testId }, relations: ['class'] });
            await this.notificationsService.sendToUser(studentId, {
                type: NotificationType.TEST_RESULT,
                title: passed ? '🎉 Đạt bài test!' : '📝 Kết quả bài test',
                message: `Bạn đạt ${percentage}% (${score} điểm) trong bài test "${test2?.title || ''}".`,
                link: `/student/tests/results/${saved.id}`,
            });
        } catch (e) {
            this.logger.warn(`Failed to send result notification: ${e.message}`);
        }

        // Notify parent of student's test result
        try {
            const test3 = await this.testRepository.findOne({ where: { id: testId } });
            await this.notificationsService.sendToParentOfStudent(studentId, {
                type: NotificationType.TEST_RESULT,
                title: 'Kết quả bài test của con',
                message: `Con bạn đạt ${percentage}% (${score} điểm) trong bài test "${test3?.title || ''}".`,
                link: '/parent/children',
            });
        } catch (e) {
            this.logger.warn(`Failed to send parent notification: ${e.message}`);
        }

        return saved;
    }

    /**
     * Get student's attempt history
     */
    async getStudentAttempts(studentId: string, page = 1, limit = 10) {
        const [results, total] = await this.attemptRepository.findAndCount({
            where: { studentId },
            relations: ['test', 'test.class'],
            order: { submittedAt: 'DESC' },
            skip: (page - 1) * limit,
            take: limit,
        });

        return {
            meta: {
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                totalItems: total,
            },
            result: results,
        };
    }

    /**
     * Get attempt by ID
     */
    async getAttemptById(attemptId: string): Promise<TestAttemptEntity> {
        const attempt = await this.attemptRepository.findOne({
            where: { id: attemptId },
            relations: ['test', 'test.class', 'student'],
        });
        if (!attempt) throw new NotFoundException('Attempt not found');
        return attempt;
    }

    // ============================================
    // Statistics
    // ============================================

    /**
     * Get test statistics (for teacher)
     */
    async getTestStatistics(testId: string) {
        const attempts = await this.attemptRepository.find({
            where: { testId },
            relations: ['student'],
        });

        if (attempts.length === 0) {
            return {
                testId,
                totalAttempts: 0,
                averageScore: 0,
                averagePercentage: 0,
                passRate: 0,
                highestScore: 0,
                lowestScore: 0,
                attempts: [],
            };
        }

        const scores = attempts.map(a => a.score);
        const percentages = attempts.map(a => a.percentage);
        const passedCount = attempts.filter(a => a.passed).length;

        return {
            testId,
            totalAttempts: attempts.length,
            averageScore: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
            averagePercentage: Math.round((percentages.reduce((a, b) => a + b, 0) / percentages.length) * 10) / 10,
            passRate: Math.round((passedCount / attempts.length) * 1000) / 10,
            highestScore: Math.max(...scores),
            lowestScore: Math.min(...scores),
            attempts: attempts.map(a => ({
                id: a.id,
                studentId: a.studentId,
                studentName: a.student?.name || '',
                score: a.score,
                percentage: a.percentage,
                passed: a.passed,
                submittedAt: a.submittedAt,
                aiGrading: a.aiGrading, // Include AI grading in stats
            })),
        };
    }

    /**
     * Teacher reviews and overrides attempt score/feedback
     */
    async reviewAttempt(
        attemptId: string,
        teacherId: string,
        body: { score?: number; percentage?: number; passed?: boolean; teacherFeedback?: string },
    ): Promise<TestAttemptEntity> {
        const attempt = await this.attemptRepository.findOne({
            where: { id: attemptId },
            relations: ['test'],
        });
        if (!attempt) throw new NotFoundException('Attempt not found');
        if (attempt.test.teacherId !== teacherId) {
            throw new ForbiddenException('Bạn không có quyền chỉnh sửa bài làm này');
        }

        if (body.score !== undefined) attempt.score = body.score;
        if (body.percentage !== undefined) attempt.percentage = body.percentage;
        if (body.passed !== undefined) attempt.passed = body.passed;
        if (body.teacherFeedback !== undefined) {
            // Store teacher feedback alongside AI feedback
            attempt.feedback = [...(attempt.feedback || []), `[Giáo viên] ${body.teacherFeedback}`];
        }

        attempt.gradedAt = new Date();
        return this.attemptRepository.save(attempt);
    }

    // ============================================
    // AI-Graded Skill Methods
    // ============================================

    /**
     * Submit writing test → AI grading via Groq (Llama 3.3)
     */
    async submitWriting(testId: string, studentId: string, submitDto: SubmitWritingDto): Promise<TestAttemptEntity> {
        const test = await this.testRepository.findOne({
            where: { id: testId, status: 'published' },
        });
        if (!test) throw new NotFoundException('Test not found or not published');
        if (test.skillType !== 'writing') throw new BadRequestException('This is not a writing test');

        const { writingResponse } = submitDto;
        if (!writingResponse || writingResponse.trim().length === 0) {
            throw new BadRequestException('Writing response cannot be empty');
        }

        // Get prompt and rubric from test questions
        const writingQuestion = test.questions[0];
        const prompt = writingQuestion?.prompt || test.passage || 'Write an essay';
        const rubric = writingQuestion?.rubric;

        // Call AI for grading
        this.logger.log(`Grading writing for test ${testId}, student ${studentId}`);
        const aiGrading = await this.aiService.gradeWriting(writingResponse, prompt, rubric);

        // Calculate score: AI gives 0-10, convert to points
        const maxPoints = test.totalPoints || 10;
        const score = Math.round((aiGrading.overallScore / 10) * maxPoints * 10) / 10;
        const percentage = Math.round(aiGrading.overallScore * 10) / 1;
        const passed = percentage >= test.passingScore;

        const attempt = this.attemptRepository.create({
            testId,
            studentId,
            answers: [],
            writingResponse,
            aiGrading,
            score,
            percentage,
            passed,
            feedback: [aiGrading.detailedFeedback],
            startedAt: new Date(),
            submittedAt: new Date(),
            gradedAt: new Date(),
        });

        const savedWriting = await this.attemptRepository.save(attempt);

        // Notify student of writing test result
        try {
            await this.notificationsService.sendToUser(studentId, {
                type: NotificationType.TEST_RESULT,
                title: passed ? '🎉 Đạt bài Writing!' : '📝 Kết quả bài Writing',
                message: `Bạn đạt ${percentage}% trong bài Writing "${test.title}". AI đã chấm xong.`,
                link: `/student/tests/results/${savedWriting.id}`,
            });
        } catch (e) {
            this.logger.warn(`Failed to send writing result notification: ${e.message}`);
        }

        // Notify parent of writing test result
        try {
            await this.notificationsService.sendToParentOfStudent(studentId, {
                type: NotificationType.TEST_RESULT,
                title: 'Kết quả bài Writing của con',
                message: `Con bạn đạt ${percentage}% trong bài Writing "${test.title}".`,
                link: '/parent/children',
            });
        } catch (e) {
            this.logger.warn(`Failed to send parent writing notification: ${e.message}`);
        }

        return savedWriting;
    }

    /**
     * Submit speaking test → upload audio → Groq Whisper + Llama grading
     */
    async submitSpeaking(testId: string, studentId: string, file: Express.Multer.File): Promise<TestAttemptEntity> {
        const test = await this.testRepository.findOne({
            where: { id: testId, status: 'published' },
        });
        if (!test) throw new NotFoundException('Test not found or not published');
        if (test.skillType !== 'speaking') throw new BadRequestException('This is not a speaking test');
        if (!file) throw new BadRequestException('Audio file is required');

        // Save audio temporarily
        const uploadDir = path.join(process.cwd(), 'uploads', 'recordings');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        const fileName = `${uuidv4()}${path.extname(file.originalname) || '.m4a'}`;
        const filePath = path.join(uploadDir, fileName);
        fs.writeFileSync(filePath, file.buffer);

        // Get reference text from test
        const speakingQuestion = test.questions[0];
        const prompt = speakingQuestion?.prompt || test.speakingPrompt || 'Read the text aloud';
        const referenceText = speakingQuestion?.referenceText || test.speakingPrompt || '';

        // Call AI for grading (transcription + text grading)
        this.logger.log(`Grading speaking for test ${testId}, student ${studentId}`);
        const aiGrading = await this.aiService.gradeSpeaking(filePath, prompt, referenceText);

        // Upload recording to Cloudinary for teacher review
        let recordingUrl = '';
        try {
            const cloudinary = require('cloudinary').v2;
            const uploadResult = await cloudinary.uploader.upload(filePath, {
                resource_type: 'video', // 'video' handles audio files too
                folder: 'tmix/recordings',
                public_id: `speaking_${testId}_${studentId}_${Date.now()}`,
            });
            recordingUrl = uploadResult.secure_url;
            this.logger.log(`Recording uploaded to Cloudinary: ${recordingUrl}`);
        } catch (uploadErr) {
            this.logger.warn(`Failed to upload recording to Cloudinary: ${uploadErr.message}`);
        }

        // Clean up temp file
        try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }

        // Calculate score
        const maxPoints = test.totalPoints || 10;
        const score = Math.round((aiGrading.overallScore / 10) * maxPoints * 10) / 10;
        const percentage = Math.round(aiGrading.overallScore * 10) / 1;
        const passed = percentage >= test.passingScore;

        const attempt = this.attemptRepository.create({
            testId,
            studentId,
            answers: [],
            recordingUrl,
            transcription: aiGrading.transcription,
            aiGrading,
            score,
            percentage,
            passed,
            feedback: [aiGrading.detailedFeedback],
            startedAt: new Date(),
            submittedAt: new Date(),
            gradedAt: new Date(),
        });

        const savedSpeaking = await this.attemptRepository.save(attempt);

        // Notify student of speaking test result
        try {
            await this.notificationsService.sendToUser(studentId, {
                type: NotificationType.TEST_RESULT,
                title: passed ? '🎉 Đạt bài Speaking!' : '📝 Kết quả bài Speaking',
                message: `Bạn đạt ${percentage}% trong bài Speaking "${test.title}". AI đã chấm xong.`,
                link: `/student/tests/results/${savedSpeaking.id}`,
            });
        } catch (e) {
            this.logger.warn(`Failed to send speaking result notification: ${e.message}`);
        }

        // Notify parent of speaking test result
        try {
            await this.notificationsService.sendToParentOfStudent(studentId, {
                type: NotificationType.TEST_RESULT,
                title: 'Kết quả bài Speaking của con',
                message: `Con bạn đạt ${percentage}% trong bài Speaking "${test.title}".`,
                link: '/parent/children',
            });
        } catch (e) {
            this.logger.warn(`Failed to send parent speaking notification: ${e.message}`);
        }

        return savedSpeaking;
    }

    /**
     * Get AI grading feedback for an attempt
     */
    async getAiFeedback(attemptId: string) {
        const attempt = await this.attemptRepository.findOne({
            where: { id: attemptId },
            relations: ['test'],
        });
        if (!attempt) throw new NotFoundException('Attempt not found');

        return {
            attemptId: attempt.id,
            testTitle: attempt.test?.title,
            skillType: attempt.test?.skillType,
            score: attempt.score,
            percentage: attempt.percentage,
            passed: attempt.passed,
            writingResponse: attempt.writingResponse,
            transcription: attempt.transcription,
            aiGrading: attempt.aiGrading,
            gradedAt: attempt.gradedAt,
        };
    }
}
