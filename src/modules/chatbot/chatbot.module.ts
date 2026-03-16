import { Module } from '@nestjs/common';
import { ChatbotController } from './chatbot.controller';
import { AiModule } from '../ai/ai.module';

@Module({
    imports: [AiModule],
    controllers: [ChatbotController],
})
export class ChatbotModule {}
