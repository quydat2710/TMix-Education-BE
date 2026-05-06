import { Injectable, Logger } from '@nestjs/common';
import { GroqService } from '../ai/groq.service';
import { SendMessageDto } from './dto/send-message.dto';

@Injectable()
export class ChatbotService {
    private readonly logger = new Logger(ChatbotService.name);

    private readonly systemPrompt = `You are TMix Education Assistant — a friendly, helpful AI tutor for English language learners at TMix Education Center.

Your capabilities:
- Explain English grammar rules clearly with examples
- Help with vocabulary, idioms, and phrases
- Correct sentences and explain errors
- Practice conversations with the student
- Translate between Vietnamese and English
- Give tips for IELTS, TOEIC, and other English exams
- Answer questions about learning strategies

Guidelines:
- Reply in the SAME language the student uses (Vietnamese or English)
- Keep answers concise but thorough
- Use examples when explaining grammar
- Be encouraging and patient
- Use emoji occasionally to be friendly 😊
- If asked non-English-learning topics, politely redirect to English study`;

    constructor(private readonly groqService: GroqService) {}

    /**
     * Check if chatbot is configured and ready.
     */
    isReady(): boolean {
        return this.groqService.isConfigured();
    }

    /**
     * Send a message to the AI chatbot and get a reply.
     * @param dto - message + optional conversation history
     * @returns AI reply string
     */
    async sendMessage(dto: SendMessageDto): Promise<string> {
        const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
            { role: 'system', content: this.systemPrompt },
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
            const reply = await this.groqService.chatCompletion(messages);
            this.logger.log(`Chatbot reply generated (${reply.length} chars) for: "${dto.message.substring(0, 50)}..."`);
            return reply;
        } catch (error: any) {
            this.logger.error(`Chatbot error: ${error.message}`);
            throw new Error('AI service temporarily unavailable. Please try again.');
        }
    }
}
