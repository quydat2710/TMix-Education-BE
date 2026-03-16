import { Body, Controller, Post } from '@nestjs/common';
import { GroqService } from '../ai/groq.service';

class ChatMessageDto {
    message: string;
    history?: { role: 'user' | 'assistant'; content: string }[];
}

@Controller('chatbot')
export class ChatbotController {
    constructor(private readonly groqService: GroqService) {}

    @Post('send')
    async sendMessage(@Body() dto: ChatMessageDto) {
        if (!this.groqService.isConfigured()) {
            return {
                success: false,
                message: 'AI chưa được cấu hình',
            };
        }

        const systemPrompt = `You are TMix Education Assistant — a friendly, helpful AI tutor for English language learners at TMix Education Center.

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
            const reply = await this.groqService.chatCompletion(messages);
            return { reply };
        } catch (error: any) {
            return { reply: `Xin lỗi, mình gặp lỗi: ${error.message}. Hãy thử lại nhé!` };
        }
    }
}
