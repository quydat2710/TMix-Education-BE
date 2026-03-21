import { Injectable, Logger } from '@nestjs/common';
import { GroqService } from './groq.service';
import { WRITING_GRADING_PROMPT, SPEAKING_GRADING_PROMPT } from './prompts/grading.prompts';

export interface WritingGrading {
    overallScore: number;
    grammar: { score: number; errors: { text: string; correction: string; rule: string; severity?: string; deduction?: number }[] };
    vocabulary: { score: number; suggestions: string[] };
    coherence: { score: number; feedback: string };
    taskAchievement: { score: number; feedback: string };
    scoringBreakdown?: { formula: string; calculation: string; penaltiesApplied: string[] };
    detailedFeedback: string;
}

export interface SpeakingGrading {
    overallScore: number;
    transcription: string;
    pronunciation: { score: number; feedback: string; mispronunciations?: { word: string; expected: string; actual: string; severity: string }[] };
    fluency: { score: number; feedback: string; wordsPerMinute?: number; pauseCount?: number };
    vocabulary?: { score: number; feedback: string };
    grammar?: { score: number; feedback: string };
    accuracy: { score: number; matchPercentage: number; feedback: string; missedWords?: string[]; addedWords?: string[] };
    scoringBreakdown?: { formula: string; calculation: string; penaltiesApplied: string[] };
    detailedFeedback: string;
}

@Injectable()
export class AiService {
    private readonly logger = new Logger(AiService.name);

    constructor(private readonly groqService: GroqService) {}

    /**
     * Grade a writing essay using Groq (Llama 3.3 70B)
     */
    async gradeWriting(essay: string, prompt: string, rubric?: string): Promise<WritingGrading> {
        this.logger.log(`gradeWriting called. Groq configured: ${this.groqService.isConfigured()}`);
        
        if (!this.groqService.isConfigured()) {
            this.logger.warn('Groq not configured! Returning default grading (score=0)');
            return this.getDefaultWritingGrading();
        }

        const fullPrompt = WRITING_GRADING_PROMPT
            .replace('{essay}', essay)
            .replace('{prompt}', prompt || 'Write an essay on the given topic')
            .replace('{rubric}', rubric || 'Grammar accuracy, Vocabulary range, Coherence and cohesion, Task achievement');

        try {
            const response = await this.groqService.generateText(fullPrompt);
            this.logger.log(`Groq raw response length: ${response?.length || 0}`);
            const grading = this.groqService.parseJsonResponse<WritingGrading>(response);
            
            this.logger.log(`Writing graded: overall=${grading.overallScore}/10`);
            return grading;
        } catch (error) {
            this.logger.error(`Writing grading failed: ${error.message}`);
            this.logger.error(`Stack: ${error.stack}`);
            return this.getDefaultWritingGrading();
        }
    }

    /**
     * Grade a speaking recording:
     * 1. Transcribe audio via Groq Whisper
     * 2. Grade transcription via Llama 3.3
     */
    async gradeSpeaking(audioFilePath: string, prompt: string, referenceText: string): Promise<SpeakingGrading> {
        if (!this.groqService.isConfigured()) {
            return this.getDefaultSpeakingGrading();
        }

        try {
            // Step 1: Transcribe audio
            this.logger.log('Transcribing audio with Groq Whisper...');
            const transcription = await this.groqService.transcribeAudio(audioFilePath);
            this.logger.log(`Transcription: "${transcription?.substring(0, 100)}..."`);

            // Step 2: Grade transcription
            const fullPrompt = SPEAKING_GRADING_PROMPT
                .replace('{referenceText}', referenceText)
                .replace('{prompt}', prompt || 'Read the text aloud')
                + `\n\nStudent's transcription:\n"${transcription}"`;

            const response = await this.groqService.generateText(fullPrompt);
            const grading = this.groqService.parseJsonResponse<SpeakingGrading>(response);
            grading.transcription = transcription;
            
            this.logger.log(`Speaking graded: overall=${grading.overallScore}/10`);
            return grading;
        } catch (error) {
            this.logger.error(`Speaking grading failed: ${error.message}`);
            return this.getDefaultSpeakingGrading();
        }
    }

    private getDefaultWritingGrading(): WritingGrading {
        return {
            overallScore: 0,
            grammar: { score: 0, errors: [] },
            vocabulary: { score: 0, suggestions: [] },
            coherence: { score: 0, feedback: 'AI chấm điểm hiện không khả dụng.' },
            taskAchievement: { score: 0, feedback: 'AI chấm điểm hiện không khả dụng.' },
            detailedFeedback: 'Hệ thống AI chấm điểm hiện không khả dụng. Vui lòng liên hệ giáo viên để được chấm điểm thủ công.'
        };
    }

    private getDefaultSpeakingGrading(): SpeakingGrading {
        return {
            overallScore: 0,
            transcription: '',
            pronunciation: { score: 0, feedback: 'AI chấm điểm hiện không khả dụng.' },
            fluency: { score: 0, feedback: 'AI chấm điểm hiện không khả dụng.' },
            accuracy: { score: 0, matchPercentage: 0, feedback: 'AI chấm điểm hiện không khả dụng.' },
            detailedFeedback: 'Hệ thống AI chấm điểm hiện không khả dụng. Vui lòng liên hệ giáo viên để được chấm điểm thủ công.'
        };
    }
}
