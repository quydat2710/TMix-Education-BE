import { Body, Controller, HttpException, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ChatbotService } from './chatbot.service';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('chatbot')
@Throttle({ default: { ttl: 60000, limit: 10 } }) // 10 requests per minute for AI
export class ChatbotController {
    constructor(private readonly chatbotService: ChatbotService) {}

    @Post('send')
    async sendMessage(@Body() dto: SendMessageDto) {
        if (!this.chatbotService.isReady()) {
            throw new HttpException(
                'AI service is not configured',
                HttpStatus.SERVICE_UNAVAILABLE,
            );
        }

        try {
            const reply = await this.chatbotService.sendMessage(dto);
            return { reply };
        } catch (error: any) {
            throw new HttpException(
                error.message || 'Chatbot service error',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }
}
