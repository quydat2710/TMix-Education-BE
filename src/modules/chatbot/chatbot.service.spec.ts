import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ChatbotService } from './chatbot.service';
import { GroqService } from '../ai/groq.service';
import { TestAttemptEntity } from '../tests/entities/test-attempt.entity';
import { ClassStudentEntity } from '../classes/entities/class-student.entity';

describe('ChatbotService', () => {
    let service: ChatbotService;
    let groqService: Partial<GroqService>;
    let testAttemptRepo: any;
    let classStudentRepo: any;

    beforeEach(async () => {
        groqService = {
            isConfigured: jest.fn(),
            chatCompletion: jest.fn(),
        };

        testAttemptRepo = {
            find: jest.fn().mockResolvedValue([]),
        };

        classStudentRepo = {
            find: jest.fn().mockResolvedValue([]),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ChatbotService,
                { provide: GroqService, useValue: groqService },
                { provide: getRepositoryToken(TestAttemptEntity), useValue: testAttemptRepo },
                { provide: getRepositoryToken(ClassStudentEntity), useValue: classStudentRepo },
            ],
        }).compile();

        service = module.get<ChatbotService>(ChatbotService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('isReady', () => {
        it('should return true when Groq is configured', () => {
            (groqService.isConfigured as jest.Mock).mockReturnValue(true);
            expect(service.isReady()).toBe(true);
        });

        it('should return false when Groq is not configured', () => {
            (groqService.isConfigured as jest.Mock).mockReturnValue(false);
            expect(service.isReady()).toBe(false);
        });
    });

    describe('sendMessage', () => {
        it('should return AI reply for a simple message', async () => {
            const mockReply = 'Hello! How can I help you learn English today? 😊';
            (groqService.chatCompletion as jest.Mock).mockResolvedValue(mockReply);

            const result = await service.sendMessage({ message: 'Hello' });

            expect(result).toBe(mockReply);
            expect(groqService.chatCompletion).toHaveBeenCalledTimes(1);
        });

        it('should include system prompt with TMix AI Tutor identity', async () => {
            (groqService.chatCompletion as jest.Mock).mockResolvedValue('reply');

            await service.sendMessage({ message: 'Test' });

            const calledMessages = (groqService.chatCompletion as jest.Mock).mock.calls[0][0];
            expect(calledMessages[0].role).toBe('system');
            expect(calledMessages[0].content).toContain('TMix AI Tutor');
            expect(calledMessages[calledMessages.length - 1]).toEqual({
                role: 'user',
                content: 'Test',
            });
        });

        it('should include mode-specific prompt for grammar mode', async () => {
            (groqService.chatCompletion as jest.Mock).mockResolvedValue('reply');

            await service.sendMessage({ message: 'Explain present perfect', mode: 'grammar' });

            const calledMessages = (groqService.chatCompletion as jest.Mock).mock.calls[0][0];
            expect(calledMessages[0].content).toContain('GRAMMAR EXPLANATION');
        });

        it('should include mode-specific prompt for correct mode', async () => {
            (groqService.chatCompletion as jest.Mock).mockResolvedValue('reply');

            await service.sendMessage({ message: 'I have went to school', mode: 'correct' });

            const calledMessages = (groqService.chatCompletion as jest.Mock).mock.calls[0][0];
            expect(calledMessages[0].content).toContain('WRITING CORRECTION');
        });

        it('should include mode-specific prompt for quiz mode', async () => {
            (groqService.chatCompletion as jest.Mock).mockResolvedValue('reply');

            await service.sendMessage({ message: 'Quiz me on tenses', mode: 'quiz' });

            const calledMessages = (groqService.chatCompletion as jest.Mock).mock.calls[0][0];
            expect(calledMessages[0].content).toContain('QUIZ');
        });

        it('should include mode-specific prompt for conversation mode', async () => {
            (groqService.chatCompletion as jest.Mock).mockResolvedValue('reply');

            await service.sendMessage({ message: 'Lets practice', mode: 'conversation' });

            const calledMessages = (groqService.chatCompletion as jest.Mock).mock.calls[0][0];
            expect(calledMessages[0].content).toContain('CONVERSATION PRACTICE');
        });

        it('should inject student context when user is provided', async () => {
            (groqService.chatCompletion as jest.Mock).mockResolvedValue('reply');
            testAttemptRepo.find.mockResolvedValue([
                {
                    percentage: 85,
                    test: { title: 'Reading Test 1', skillType: 'reading' },
                    createdAt: new Date(),
                },
            ]);
            classStudentRepo.find.mockResolvedValue([
                { class: { name: 'IELTS Advanced' } },
            ]);

            const user = { id: 'student-1', name: 'Nguyen Van A', email: 'a@test.com', role: { id: 3, name: 'student' } };
            await service.sendMessage({ message: 'Hello' }, user);

            const calledMessages = (groqService.chatCompletion as jest.Mock).mock.calls[0][0];
            expect(calledMessages[0].content).toContain('STUDENT PROFILE');
            expect(calledMessages[0].content).toContain('Nguyen Van A');
            expect(calledMessages[0].content).toContain('IELTS Advanced');
        });

        it('should include conversation history', async () => {
            (groqService.chatCompletion as jest.Mock).mockResolvedValue('reply');

            await service.sendMessage({
                message: 'What is present perfect?',
                history: [
                    { role: 'user', content: 'Hi' },
                    { role: 'assistant', content: 'Hello!' },
                ],
            });

            const calledMessages = (groqService.chatCompletion as jest.Mock).mock.calls[0][0];
            // system + 2 history + 1 current = 4
            expect(calledMessages.length).toBe(4);
            expect(calledMessages[1]).toEqual({ role: 'user', content: 'Hi' });
            expect(calledMessages[2]).toEqual({ role: 'assistant', content: 'Hello!' });
        });

        it('should limit history to last 20 messages', async () => {
            (groqService.chatCompletion as jest.Mock).mockResolvedValue('reply');

            const longHistory = Array.from({ length: 30 }, (_, i) => ({
                role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
                content: `Message ${i}`,
            }));

            await service.sendMessage({
                message: 'Final question',
                history: longHistory,
            });

            const calledMessages = (groqService.chatCompletion as jest.Mock).mock.calls[0][0];
            // system(1) + last 20 history + current message(1) = 22
            expect(calledMessages.length).toBe(22);
        });

        it('should throw sanitized error when Groq fails', async () => {
            (groqService.chatCompletion as jest.Mock).mockRejectedValue(
                new Error('GROQ_INTERNAL: API key quota exceeded for model llama-3.3-70b'),
            );

            await expect(service.sendMessage({ message: 'Test' }))
                .rejects
                .toThrow('AI service temporarily unavailable. Please try again.');
        });

        it('should handle empty history gracefully', async () => {
            (groqService.chatCompletion as jest.Mock).mockResolvedValue('reply');

            await service.sendMessage({ message: 'Test', history: [] });

            const calledMessages = (groqService.chatCompletion as jest.Mock).mock.calls[0][0];
            // system + current = 2
            expect(calledMessages.length).toBe(2);
        });

        it('should pass different temperature per mode', async () => {
            (groqService.chatCompletion as jest.Mock).mockResolvedValue('reply');

            await service.sendMessage({ message: 'Test', mode: 'correct' });

            const calledOptions = (groqService.chatCompletion as jest.Mock).mock.calls[0][1];
            expect(calledOptions.temperature).toBe(0.2); // Correction mode = very low
        });

        it('should work without user context (anonymous)', async () => {
            (groqService.chatCompletion as jest.Mock).mockResolvedValue('reply');

            const result = await service.sendMessage({ message: 'Hello' });
            expect(result).toBe('reply');

            const calledMessages = (groqService.chatCompletion as jest.Mock).mock.calls[0][0];
            expect(calledMessages[0].content).not.toContain('STUDENT PROFILE');
        });
    });
});
