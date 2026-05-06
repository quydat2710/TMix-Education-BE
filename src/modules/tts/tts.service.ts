import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';


@Injectable()
export class TtsService implements OnModuleInit {
    private readonly logger = new Logger(TtsService.name);
    private ttsServerUrl: string;
    private isServerAvailable = false;

    constructor(private readonly configService: ConfigService) {
        this.ttsServerUrl = this.configService.get<string>('TTS_SERVER_URL') || 'http://127.0.0.1:5050';
    }

    async onModuleInit() {
        await this.checkServerHealth();
    }

    /**
     * Check if the Piper TTS Python server is running and healthy.
     */
    async checkServerHealth(): Promise<boolean> {
        try {
            const response = await axios.get(`${this.ttsServerUrl}/health`, { timeout: 5000 });
            this.isServerAvailable = response.data?.status === 'ok';
            if (this.isServerAvailable) {
                this.logger.log(`✓ TTS Server connected (${this.ttsServerUrl})`);
                this.logger.log(`  Model: ${response.data?.model}`);
                this.logger.log(`  Voices: ${response.data?.voices_loaded?.join(', ')}`);
            }
            return this.isServerAvailable;
        } catch {
            this.isServerAvailable = false;
            this.logger.warn(`✗ TTS Server not available at ${this.ttsServerUrl}. TTS features will be disabled.`);
            return false;
        }
    }

    /**
     * Get list of available TTS voices from the Piper server.
     */
    async getVoices(): Promise<any> {
        if (!this.isServerAvailable) {
            await this.checkServerHealth();
        }

        if (!this.isServerAvailable) {
            return {
                voices: {
                    'browser-default': {
                        name: 'Browser Default (Fallback)',
                        language: 'en-US',
                        gender: 'neutral',
                        quality: 'low',
                        description: 'Browser built-in TTS (fallback when Piper server is unavailable)'
                    }
                },
                default: 'browser-default',
                serverAvailable: false
            };
        }

        try {
            const response = await axios.get(`${this.ttsServerUrl}/voices`, { timeout: 5000 });
            return { ...response.data, serverAvailable: true };
        } catch (error) {
            this.logger.error(`Failed to get voices: ${error.message}`);
            return { voices: {}, default: null, serverAvailable: false };
        }
    }

    /**
     * Synthesize text to speech audio (WAV format) using Piper TTS (VITS model).
     * 
     * @param text - The text to convert to speech
     * @param voice - Voice model name (default: en_US-lessac-medium)
     * @param speed - Speech speed multiplier (0.5x - 2.0x, default: 1.0)
     * @returns Audio buffer (WAV format) or null if TTS is unavailable
     */
    async synthesize(text: string, voice?: string, speed: number = 1.0): Promise<Buffer | null> {
        if (!this.isServerAvailable) {
            await this.checkServerHealth();
            if (!this.isServerAvailable) {
                this.logger.warn('TTS server unavailable, returning null');
                return null;
            }
        }

        try {
            const response = await axios.post(
                `${this.ttsServerUrl}/synthesize`,
                { text, voice, speed },
                {
                    responseType: 'arraybuffer',
                    timeout: 30000,
                    headers: { 'Content-Type': 'application/json' },
                },
            );

            const audioBuffer = Buffer.from(response.data);
            this.logger.log(`Synthesized: "${text.substring(0, 50)}..." -> ${audioBuffer.length} bytes`);
            return audioBuffer;
        } catch (error) {
            this.logger.error(`TTS synthesis failed: ${error.message}`);
            if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
                this.isServerAvailable = false;
            }
            return null;
        }
    }

    /**
     * Synthesize a multi-speaker dialog transcript to audio.
     * Supports both plain text and [A]: [B]: [C]: dialog format.
     * 
     * @param transcript - The transcript text (plain or dialog format)
     * @param options - speed, pauseBetweenLines, voiceMap
     * @returns Audio buffer (WAV format) or null if TTS is unavailable
     */
    async synthesizeDialog(
        transcript: string,
        options: {
            speed?: number;
            pauseBetweenLines?: number;
            voiceMap?: Record<string, string>;
        } = {},
    ): Promise<Buffer | null> {
        if (!this.isServerAvailable) {
            await this.checkServerHealth();
            if (!this.isServerAvailable) {
                this.logger.warn('TTS server unavailable for dialog synthesis');
                return null;
            }
        }

        try {
            const response = await axios.post(
                `${this.ttsServerUrl}/synthesize-dialog`,
                {
                    transcript,
                    speed: options.speed || 1.0,
                    pauseBetweenLines: options.pauseBetweenLines || 0.8,
                    voiceMap: options.voiceMap || null,
                },
                {
                    responseType: 'arraybuffer',
                    timeout: 120000, // 2 min timeout for long dialogs
                    headers: { 'Content-Type': 'application/json' },
                },
            );

            const audioBuffer = Buffer.from(response.data);
            this.logger.log(
                `Dialog synthesized: ${audioBuffer.length} bytes, ` +
                `${transcript.length} chars transcript`,
            );
            return audioBuffer;
        } catch (error) {
            this.logger.error(`Dialog synthesis failed: ${error.message}`);
            if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
                this.isServerAvailable = false;
            }
            return null;
        }
    }

    /**
     * Synthesize dialog and save to a file on disk.
     * Used for generating listening test audio files.
     * 
     * @param transcript - The transcript text
     * @param outputPath - Absolute path to save the WAV file
     * @param options - synthesis options
     * @returns File size in bytes, or null if failed
     */
    async synthesizeAndSave(
        transcript: string,
        outputPath: string,
        options: {
            speed?: number;
            pauseBetweenLines?: number;
            voiceMap?: Record<string, string>;
        } = {},
    ): Promise<number | null> {
        const audioBuffer = await this.synthesizeDialog(transcript, options);
        if (!audioBuffer) return null;

        const fs = require('fs');
        const path = require('path');

        // Ensure output directory exists
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(outputPath, audioBuffer);
        this.logger.log(`Audio saved: ${outputPath} (${audioBuffer.length} bytes)`);
        return audioBuffer.length;
    }

    /**
     * Check if TTS service is currently available.
     */
    isAvailable(): boolean {
        return this.isServerAvailable;
    }
}
