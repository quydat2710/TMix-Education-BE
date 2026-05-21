import { Controller, Post, Get, Body, Res, UploadedFile, UseInterceptors, Query } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { TtsService } from './tts.service';
import { SynthesizeDto } from './dto/synthesize.dto';
import { GenerateAudioDto } from './dto/generate-audio.dto';
import { AiService } from '../ai/ai.service';
import { Public } from '@/decorator/customize.decorator';
import * as path from 'path';
import * as crypto from 'crypto';
import * as fs from 'fs';
import { DictationService } from './dictation.service';

/**
 * TTS Controller 
 * Provides REST API endpoints for Text-to-Speech functionality
 * powered by Piper TTS (VITS neural model).
 * 
 */
@Public()
@Controller('tts')
export class TtsController {
    private readonly dictationService = new DictationService();

    constructor(
        private readonly ttsService: TtsService,
        private readonly aiService: AiService,
    ) { }

    /**
     * GET /tts/health
     * Check if TTS engine is available and healthy.
     */
    @Get('health')
    async getHealth() {
        const isAvailable = await this.ttsService.checkServerHealth();
        return {
            status: isAvailable ? 'ok' : 'unavailable',
            engine: 'Piper TTS (VITS)',
            description: 'Neural TTS engine based on VITS architecture (Variational Inference with adversarial learning for end-to-end Text-to-Speech)',
        };
    }

    /**
     * GET /tts/voices
     * Get list of available TTS voices with metadata.
     */
    @Get('voices')
    async getVoices() {
        return this.ttsService.getVoices();
    }

    /**
     * POST /tts/synthesize
     * Convert text to speech audio (single voice).
     */
    @Post('synthesize')
    async synthesize(@Body() dto: SynthesizeDto, @Res() res: Response) {
        const { text, voice, speed } = dto;

        const audioBuffer = await this.ttsService.synthesize(text, voice, speed || 1.0);

        if (!audioBuffer) {
            res.status(503).json({
                statusCode: 503,
                message: 'TTS server unavailable, please use browser fallback',
                fallback: 'browser',
            });
            return;
        }

        res.set({
            'Content-Type': 'audio/wav',
            'Content-Length': audioBuffer.length.toString(),
            'Cache-Control': 'public, max-age=86400',
        });

        res.send(audioBuffer);
    }

    /**
     * POST /tts/preview-audio
     * Preview audio generated from a transcript (dialog or plain text).
     * Returns the audio directly as WAV stream — for teacher to listen before saving.
     * 
     * Request body:
     * {
     *   "transcript": "[A]: Hello!\n[B]: Hi!",
     *   "speed": 1.0,
     *   "pauseBetweenLines": 0.8,
     *   "voiceMap": {"A": "en_US-lessac-medium", "B": "en_US-ryan-medium"}
     * }
     */
    @Post('preview-audio')
    async previewAudio(@Body() dto: GenerateAudioDto, @Res() res: Response) {
        const audioBuffer = await this.ttsService.synthesizeDialog(
            dto.transcript,
            {
                speed: dto.speed,
                pauseBetweenLines: dto.pauseBetweenLines,
                voiceMap: dto.voiceMap,
            },
        );

        if (!audioBuffer) {
            res.status(503).json({
                statusCode: 503,
                message: 'TTS server is not available. Cannot generate audio preview.',
            });
            return;
        }

        res.set({
            'Content-Type': 'audio/wav',
            'Content-Length': audioBuffer.length.toString(),
            'Cache-Control': 'no-cache',
        });

        res.send(audioBuffer);
    }

    /**
     * POST /tts/generate-audio
     * Generate audio from transcript and save to uploads/ directory.
     * Returns the URL of the saved file — for storing in test.audioUrl.
     * 
     * Request body: same as preview-audio
     * Response: { url: "/uploads/tts-audio/xxxx.wav", size: 12345, duration_estimate: "~5s" }
     */
    @Post('generate-audio')
    async generateAudio(@Body() dto: GenerateAudioDto, @Res() res: Response) {
        const audioBuffer = await this.ttsService.synthesizeDialog(
            dto.transcript,
            {
                speed: dto.speed,
                pauseBetweenLines: dto.pauseBetweenLines,
                voiceMap: dto.voiceMap,
            },
        );

        if (!audioBuffer) {
            res.status(503).json({
                statusCode: 503,
                message: 'TTS server is not available. Cannot generate audio.',
            });
            return;
        }

        // Generate unique filename
        const hash = crypto.createHash('md5').update(dto.transcript + Date.now()).digest('hex').substring(0, 12);
        const filename = `listening_${hash}.wav`;
        const uploadsDir = path.join(process.cwd(), 'uploads', 'tts-audio');
        const filePath = path.join(uploadsDir, filename);

        // Save file
        const fs = require('fs');
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }
        fs.writeFileSync(filePath, audioBuffer);

        // Estimate duration (22050 Hz, 16-bit mono = 44100 bytes/sec of PCM, 
        // WAV header is ~44 bytes)
        const pcmSize = audioBuffer.length - 44;
        const durationSeconds = Math.round(pcmSize / 44100);

        res.json({
            url: `/uploads/tts-audio/${filename}`,
            filename,
            size: audioBuffer.length,
            sizeFormatted: `${(audioBuffer.length / 1024).toFixed(1)}KB`,
            durationEstimate: `~${durationSeconds}s`,
        });
    }

    /**
     * POST /tts/evaluate-pronunciation
     * Evaluate student pronunciation:
     * 1. Student records audio of reference text
     * 2. Whisper transcribes audio
     * 3. AI compares transcription vs reference text
     * 4. Returns detailed pronunciation feedback + score
     * 
     * Request: multipart/form-data
     *   - audio: audio file (webm/wav/mp3)
     *   - referenceText: the text student was supposed to read
     *   - prompt: (optional) context prompt
     */
    @Post('evaluate-pronunciation')
    @UseInterceptors(FileInterceptor('audio'))
    async evaluatePronunciation(
        @UploadedFile() audioFile: Express.Multer.File,
        @Body('referenceText') referenceText: string,
        @Body('prompt') prompt: string,
        @Res() res: Response,
    ) {
        if (!audioFile) {
            res.status(400).json({ statusCode: 400, message: 'Audio file is required' });
            return;
        }

        if (!referenceText?.trim()) {
            res.status(400).json({ statusCode: 400, message: 'Reference text is required' });
            return;
        }

        try {
            // Save uploaded audio to temp file
            const tmpDir = path.join(process.cwd(), 'uploads', 'tmp');
            if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

            const ext = audioFile.originalname?.split('.').pop() || 'webm';
            const tmpFile = path.join(tmpDir, `pron_${Date.now()}.${ext}`);
            fs.writeFileSync(tmpFile, audioFile.buffer);

            // Use AI service to grade speaking
            const grading = await this.aiService.gradeSpeaking(
                tmpFile,
                prompt || 'Read the following text aloud clearly and naturally.',
                referenceText.trim(),
            );

            // Cleanup temp file
            try { fs.unlinkSync(tmpFile); } catch { }

            res.json({
                success: true,
                data: grading,
            });
        } catch (error) {
            res.status(500).json({
                statusCode: 500,
                message: `Pronunciation evaluation failed: ${error.message}`,
            });
        }
    }

    // ═══════════════════════════════════════════════
    // DICTATION ENDPOINTS
    // ═══════════════════════════════════════════════

    /**
     * GET /tts/dictation/random
     * Get a random dictation sentence metadata (NO text revealed!)
     * Query: ?level=easy|medium|hard (optional)
     */
    @Get('dictation/random')
    getDictationRandom(@Query('level') level: string, @Res() res: Response) {
        const sentence = this.dictationService.getRandomSentence(level);
        res.json({ success: true, data: sentence });
    }

    /**
     * POST /tts/dictation/audio
     * Generate TTS audio for a dictation sentence (by id).
     * Returns audio binary — client plays it without seeing the text.
     */
    @Post('dictation/audio')
    async getDictationAudio(
        @Body('id') id: string,
        @Body('speed') speed: number,
        @Res() res: Response,
    ) {
        const sentence = this.dictationService.getSentenceById(id);
        if (!sentence) {
            res.status(404).json({ statusCode: 404, message: 'Sentence not found' });
            return;
        }

        const spd = speed || 1.0;
        const voice = this.dictationService.getVoiceForSentence(id);
        const cacheDir = path.join(process.cwd(), 'cache', 'dictation');
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }
        
        const cacheFile = path.join(cacheDir, `${id}_${spd.toFixed(1)}.wav`);

        try {
            let audioBuffer: Buffer;

            // 1. Check local NestJS cache first
            if (fs.existsSync(cacheFile)) {
                audioBuffer = fs.readFileSync(cacheFile);
            } else {
                // 2. Not in cache -> call Python TTS Server
                const buffer = await this.ttsService.synthesize(
                    sentence.text,
                    voice,
                    spd,
                );
                
                if (!buffer) {
                    throw new Error('TTS Service returned null');
                }
                audioBuffer = buffer;

                // 3. Save to local cache
                fs.writeFileSync(cacheFile, audioBuffer);
            }

            res.set({
                'Content-Type': 'audio/wav',
                'Content-Length': audioBuffer.length.toString(),
                'Cache-Control': 'public, max-age=31536000', // Cache in browser for 1 year
            });
            res.send(audioBuffer);
        } catch (error) {
            res.status(503).json({
                statusCode: 503,
                message: 'TTS Server unavailable and no cached audio found',
            });
        }
    }

    /**
     * POST /tts/dictation/check
     * Check user's dictation answer against the original sentence.
     * Case-insensitive comparison.
     * Only reveals original sentence if 100% correct.
     */
    @Post('dictation/check')
    checkDictation(
        @Body('id') id: string,
        @Body('answer') answer: string,
        @Body('forceReveal') forceReveal: boolean,
        @Res() res: Response,
    ) {
        if (!id || !answer?.trim()) {
            res.status(400).json({ statusCode: 400, message: 'id and answer are required' });
            return;
        }

        const result = this.dictationService.checkAnswer(id, answer.trim(), !!forceReveal);
        if (!result) {
            res.status(404).json({ statusCode: 404, message: 'Sentence not found' });
            return;
        }

        res.json({ success: true, data: result });
    }
}
