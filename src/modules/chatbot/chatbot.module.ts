import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatbotController } from './chatbot.controller';
import { ChatbotService } from './chatbot.service';
import { AiModule } from '../ai/ai.module';
import { TestAttemptEntity } from '../tests/entities/test-attempt.entity';
import { ClassStudentEntity } from '../classes/entities/class-student.entity';

@Module({
    imports: [
        AiModule,
        TypeOrmModule.forFeature([TestAttemptEntity, ClassStudentEntity]),
    ],
    controllers: [ChatbotController],
    providers: [ChatbotService],
})
export class ChatbotModule {}
