import { Module } from '@nestjs/common';
import { TtsService } from './tts.service';
import { TtsController } from './tts.controller';
import { AiModule } from '../ai/ai.module';

@Module({
    imports: [AiModule],
    controllers: [TtsController],
    providers: [TtsService],
    exports: [TtsService],
})
export class TtsModule {}
