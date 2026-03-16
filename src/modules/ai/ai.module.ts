import { Module } from '@nestjs/common';
import { GroqService } from './groq.service';
import { AiService } from './ai.service';

@Module({
    providers: [GroqService, AiService],
    exports: [AiService, GroqService],
})
export class AiModule {}
