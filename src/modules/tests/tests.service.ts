import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TestEntity } from './entities/test.entity';
import { TestAttemptEntity } from './entities/test-attempt.entity';
import { CreateTestDto } from './dto/create-test.dto';
import { UpdateTestDto } from './dto/update-test.dto';
import { SubmitTestDto } from './dto/submit-test.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class TestsService {
    constructor(
        @InjectRepository(TestEntity)
        private testRepository: Repository<TestEntity>,
        @InjectRepository(TestAttemptEntity)
        private attemptRepository: Repository<TestAttemptEntity>,
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

        const totalPoints = questions.reduce((sum, q) => sum + q.points, 0);

        const test = this.testRepository.create({
            ...createTestDto,
            teacherId,
            questions,
            totalPoints,
            status: createTestDto.status || 'draft',
        });

        return this.testRepository.save(test);
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
        return this.testRepository.save(test);
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

        // Strip correct answers from questions
        const questionsWithoutAnswers = test.questions.map(q => ({
            id: q.id,
            question: q.question,
            options: q.options,
            points: q.points,
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

        return this.attemptRepository.save(attempt);
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
            })),
        };
    }
}
