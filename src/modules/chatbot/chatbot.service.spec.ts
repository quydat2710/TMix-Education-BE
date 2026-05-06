import { Test, TestingModule } from '@nestjs/testing';
import { ChatbotService } from './chatbot.service';
import { GroqService } from '../ai/groq.service';

describe('ChatbotService', () => {
    let service: ChatbotService;
    let groqService: Partial<GroqService>;

    beforeEach(async () => {
        groqService = {
            isConfigured: jest.fn(),
            chatCompletion: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ChatbotService,
                { provide: GroqService, useValue: groqService },
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

        it('should include system prompt in messages sent to Groq', async () => {
            (groqService.chatCompletion as jest.Mock).mockResolvedValue('reply');

            await service.sendMessage({ message: 'Test' });

            const calledMessages = (groqService.chatCompletion as jest.Mock).mock.calls[0][0];
            expect(calledMessages[0].role).toBe('system');
            expect(calledMessages[0].content).toContain('TMix Education Assistant');
            expect(calledMessages[calledMessages.length - 1]).toEqual({
                role: 'user',
                content: 'Test',
            });
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
    });
});
