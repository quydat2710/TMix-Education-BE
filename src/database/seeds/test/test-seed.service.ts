import { TestEntity } from "@/modules/tests/entities/test.entity";
import { TestAttemptEntity } from "@/modules/tests/entities/test-attempt.entity";
import { ClassEntity } from "modules/classes/entities/class.entity";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as crypto from 'crypto';

interface QuestionTemplate {
    question: string;
    options: string[];
    correctAnswer: number;
    explanation: string;
}

const grammarQuestions: QuestionTemplate[] = [
    { question: "She ___ to school every day.", options: ["go", "goes", "going", "gone"], correctAnswer: 1, explanation: "Subject 'She' requires verb in third person singular: goes." },
    { question: "They ___ playing football when it started raining.", options: ["are", "was", "were", "is"], correctAnswer: 2, explanation: "'They' takes 'were' in past continuous tense." },
    { question: "If I ___ rich, I would travel the world.", options: ["am", "was", "were", "be"], correctAnswer: 2, explanation: "In second conditional, we use 'were' for all subjects." },
    { question: "The book ___ by millions of people.", options: ["has read", "has been read", "have read", "reading"], correctAnswer: 1, explanation: "Passive voice: has been + past participle." },
    { question: "He asked me where I ___.", options: ["live", "lived", "living", "am live"], correctAnswer: 1, explanation: "Reported speech requires backshift: live → lived." },
    { question: "I wish I ___ speak French fluently.", options: ["can", "could", "will", "may"], correctAnswer: 1, explanation: "After 'wish', use 'could' for present ability." },
    { question: "She ___ here since 2020.", options: ["lives", "lived", "has lived", "is living"], correctAnswer: 2, explanation: "Present perfect with 'since' for duration from past to now." },
    { question: "Neither Tom nor his friends ___ the answer.", options: ["know", "knows", "knowing", "known"], correctAnswer: 0, explanation: "With 'neither...nor', the verb agrees with the nearest subject (friends → know)." },
];

const vocabularyQuestions: QuestionTemplate[] = [
    { question: "What is the synonym of 'happy'?", options: ["sad", "joyful", "angry", "tired"], correctAnswer: 1, explanation: "'Joyful' means feeling great happiness." },
    { question: "The word 'enormous' means ___.", options: ["tiny", "very large", "bright", "slow"], correctAnswer: 1, explanation: "'Enormous' = extremely large in size." },
    { question: "'Diligent' is closest in meaning to ___.", options: ["lazy", "hardworking", "clever", "friendly"], correctAnswer: 1, explanation: "'Diligent' means showing careful and persistent effort." },
    { question: "The antonym of 'ancient' is ___.", options: ["old", "modern", "historical", "classic"], correctAnswer: 1, explanation: "'Modern' is the opposite of 'ancient'." },
    { question: "What does 'reluctant' mean?", options: ["eager", "unwilling", "excited", "confident"], correctAnswer: 1, explanation: "'Reluctant' means unwilling or hesitant." },
    { question: "'Abundant' means ___.", options: ["scarce", "plentiful", "empty", "limited"], correctAnswer: 1, explanation: "'Abundant' = existing in large quantities." },
];

const readingQuestions: QuestionTemplate[] = [
    { question: "What is the main idea of a passage usually found in?", options: ["The last sentence", "The first paragraph", "Random places", "The title only"], correctAnswer: 1, explanation: "Main ideas are typically introduced in the first paragraph." },
    { question: "Which is NOT a type of reading comprehension question?", options: ["Main idea", "Detail", "Inference", "Grammar correction"], correctAnswer: 3, explanation: "Grammar correction is not a standard reading comprehension question type." },
    { question: "Context clues help readers to ___.", options: ["skip words", "understand unknown words", "read faster", "memorize text"], correctAnswer: 1, explanation: "Context clues help determine meaning of unfamiliar words." },
    { question: "A 'topic sentence' usually appears ___.", options: ["at the end only", "at the beginning of a paragraph", "in the middle", "nowhere specific"], correctAnswer: 1, explanation: "Topic sentences typically open paragraphs." },
];

@Injectable()
export class TestSeedService {
    constructor(
        @InjectRepository(TestEntity) private testRepository: Repository<TestEntity>,
        @InjectRepository(TestAttemptEntity) private attemptRepository: Repository<TestAttemptEntity>,
        @InjectRepository(ClassEntity) private classRepository: Repository<ClassEntity>
    ) { }

    async run() {
        const tests = await this.testRepository.find();
        if (tests.length > 0) return;

        const classes = await this.classRepository.find({
            where: [{ status: 'closed' }, { status: 'active' }],
            relations: ['students', 'students.student', 'teacher']
        });

        const testTemplates = [
            { title: "Grammar Test - Tenses", description: "Kiểm tra ngữ pháp: Các thì trong tiếng Anh", questions: grammarQuestions.slice(0, 5), duration: 30, passingScore: 60 },
            { title: "Grammar Test - Advanced", description: "Kiểm tra ngữ pháp nâng cao: Câu điều kiện, bị động, tường thuật", questions: grammarQuestions.slice(3, 8), duration: 30, passingScore: 60 },
            { title: "Vocabulary Quiz - Daily Life", description: "Từ vựng chủ đề đời sống hàng ngày", questions: vocabularyQuestions.slice(0, 4), duration: 20, passingScore: 70 },
            { title: "Vocabulary Quiz - Advanced", description: "Từ vựng nâng cao: Đồng nghĩa và trái nghĩa", questions: vocabularyQuestions.slice(2, 6), duration: 20, passingScore: 70 },
            { title: "Reading Comprehension", description: "Đọc hiểu: Xác định ý chính và chi tiết", questions: readingQuestions, duration: 45, passingScore: 50 },
            { title: "Mid-term Test", description: "Kiểm tra giữa kỳ: Tổng hợp ngữ pháp, từ vựng và đọc hiểu", questions: [...grammarQuestions.slice(0, 3), ...vocabularyQuestions.slice(0, 3), ...readingQuestions.slice(0, 2)], duration: 60, passingScore: 60 },
            { title: "Final Test", description: "Kiểm tra cuối kỳ: Đánh giá toàn diện kiến thức", questions: [...grammarQuestions.slice(0, 4), ...vocabularyQuestions.slice(0, 3), ...readingQuestions.slice(0, 3)], duration: 60, passingScore: 60 },
        ];

        let templateIndex = 0;

        for (const aclass of classes) {
            if (!aclass.teacher || !aclass.students || aclass.students.length === 0) continue;

            // Each class gets 2 tests
            for (let t = 0; t < 2; t++) {
                const template = testTemplates[templateIndex % testTemplates.length];
                templateIndex++;

                const questions = template.questions.map((q, i) => ({
                    id: crypto.randomUUID(),
                    question: q.question,
                    options: q.options,
                    correctAnswer: q.correctAnswer,
                    explanation: q.explanation,
                    points: 1
                }));

                const totalPoints = questions.length;

                const test = await this.testRepository.save(
                    this.testRepository.create({
                        title: template.title,
                        description: template.description,
                        classId: aclass.id,
                        teacherId: aclass.teacher.id,
                        duration: template.duration,
                        totalPoints,
                        passingScore: template.passingScore,
                        questions,
                        status: aclass.status === 'closed' ? 'archived' : 'published'
                    })
                );

                // Create test attempts for students
                const studentsToAttempt = aclass.status === 'closed'
                    ? aclass.students  // All students did the test in closed classes
                    : aclass.students.filter(() => Math.random() < 0.6); // 60% in active

                for (const classStudent of studentsToAttempt) {
                    if (!classStudent.student) continue;

                    // Generate random answers
                    const answers = questions.map(q => {
                        // 60-80% chance of correct answer
                        return Math.random() < 0.7 ? q.correctAnswer : Math.floor(Math.random() * 4);
                    });

                    // Calculate score
                    let score = 0;
                    const feedback: string[] = [];
                    questions.forEach((q, i) => {
                        if (answers[i] === q.correctAnswer) {
                            score += q.points;
                            feedback.push('Correct');
                        } else {
                            feedback.push(`Incorrect. ${q.explanation}`);
                        }
                    });

                    const percentage = Math.round((score / totalPoints) * 100);
                    const passed = percentage >= template.passingScore;

                    const startedAt = new Date('2026-02-15');
                    startedAt.setDate(startedAt.getDate() + Math.floor(Math.random() * 20));
                    const submittedAt = new Date(startedAt);
                    submittedAt.setMinutes(submittedAt.getMinutes() + Math.floor(Math.random() * template.duration));

                    await this.attemptRepository.save(
                        this.attemptRepository.create({
                            testId: test.id,
                            studentId: classStudent.studentId as string,
                            answers,
                            score,
                            percentage,
                            passed,
                            feedback,
                            startedAt,
                            submittedAt,
                            gradedAt: submittedAt
                        })
                    );
                }
            }
        }
    }
}
