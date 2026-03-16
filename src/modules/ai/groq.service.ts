import { Injectable, Logger } from '@nestjs/common';
import Groq from 'groq-sdk';

@Injectable()
export class GroqService {
    private readonly logger = new Logger(GroqService.name);
    private client: Groq;

    constructor() {
        const apiKey = process.env.GROQ_API_KEY;
        
        if (!apiKey) {
            this.logger.warn('GROQ_API_KEY not configured. AI features will be disabled.');
            return;
        }

        this.client = new Groq({ apiKey });
        this.logger.log('Groq initialized with model: llama-3.3-70b-versatile');
    }

    /**
     * Generate text content for grading (Writing)
     */
    async generateText(prompt: string, retries = 2): Promise<string> {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const completion = await this.client.chat.completions.create({
                    messages: [
                        {
                            role: 'system',
                            content: 'You are an expert English teacher and essay grader. Always respond in valid JSON format.',
                        },
                        {
                            role: 'user',
                            content: prompt,
                        },
                    ],
                    model: 'llama-3.3-70b-versatile',
                    temperature: 0.3,
                    max_tokens: 4096,
                    response_format: { type: 'json_object' },
                });

                return completion.choices[0]?.message?.content || '';
            } catch (error: any) {
                if (error?.status === 429 && attempt < retries) {
                    const waitTime = 10 + attempt * 5;
                    this.logger.warn(`Rate limited (429). Retrying in ${waitTime}s... (attempt ${attempt + 1}/${retries})`);
                    await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
                    continue;
                }
                this.logger.error(`Groq text generation failed: ${error.message}`);
                throw error;
            }
        }
        throw new Error('Groq generation failed after all retries');
    }

    /**
     * Transcribe audio using Groq Whisper (for Speaking tests)
     */
    async transcribeAudio(audioFilePath: string): Promise<string> {
        try {
            const fs = await import('fs');
            const transcription = await this.client.audio.transcriptions.create({
                file: fs.createReadStream(audioFilePath),
                model: 'whisper-large-v3',
                language: 'en',
                response_format: 'text',
            });

            return transcription as unknown as string;
        } catch (error: any) {
            this.logger.error(`Groq audio transcription failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Parse JSON from response (handles markdown code blocks)
     */
    parseJsonResponse<T>(text: string): T {
        let cleaned = text.trim();
        if (cleaned.startsWith('```json')) {
            cleaned = cleaned.slice(7);
        } else if (cleaned.startsWith('```')) {
            cleaned = cleaned.slice(3);
        }
        if (cleaned.endsWith('```')) {
            cleaned = cleaned.slice(0, -3);
        }
        return JSON.parse(cleaned.trim());
    }

    isConfigured(): boolean {
        return !!this.client;
    }
}
