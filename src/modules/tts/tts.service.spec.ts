import { Test, TestingModule } from '@nestjs/testing';
import { TtsService } from './tts.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('TtsService', () => {
    let service: TtsService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TtsService,
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn().mockReturnValue('http://127.0.0.1:5050'),
                    },
                },
            ],
        }).compile();

        service = module.get<TtsService>(TtsService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('checkServerHealth', () => {
        it('should return true when server is healthy', async () => {
            mockedAxios.get.mockResolvedValue({
                data: {
                    status: 'ok',
                    model: 'VITS (Piper TTS)',
                    voices_loaded: ['en_US-lessac-medium'],
                },
            });

            const result = await service.checkServerHealth();

            expect(result).toBe(true);
            expect(service.isAvailable()).toBe(true);
            expect(mockedAxios.get).toHaveBeenCalledWith(
                'http://127.0.0.1:5050/health',
                { timeout: 5000 },
            );
        });

        it('should return false when server is down', async () => {
            mockedAxios.get.mockRejectedValue(new Error('ECONNREFUSED'));

            const result = await service.checkServerHealth();

            expect(result).toBe(false);
            expect(service.isAvailable()).toBe(false);
        });

        it('should return false when server returns non-ok status', async () => {
            mockedAxios.get.mockResolvedValue({
                data: { status: 'error' },
            });

            const result = await service.checkServerHealth();

            expect(result).toBe(false);
        });
    });

    describe('synthesize', () => {
        it('should return audio buffer when synthesis succeeds', async () => {
            // First make server available
            mockedAxios.get.mockResolvedValue({
                data: { status: 'ok', model: 'VITS', voices_loaded: ['en_US-lessac-medium'] },
            });
            await service.checkServerHealth();

            const fakeAudio = Buffer.from('fake-wav-data');
            mockedAxios.post.mockResolvedValue({ data: fakeAudio });

            const result = await service.synthesize('Hello world');

            expect(result).toBeInstanceOf(Buffer);
            expect(mockedAxios.post).toHaveBeenCalledWith(
                'http://127.0.0.1:5050/synthesize',
                { text: 'Hello world', voice: undefined, speed: 1.0 },
                expect.objectContaining({
                    responseType: 'arraybuffer',
                    timeout: 30000,
                }),
            );
        });

        it('should return null when server is unavailable', async () => {
            mockedAxios.get.mockRejectedValue(new Error('ECONNREFUSED'));
            await service.checkServerHealth();

            const result = await service.synthesize('Hello');

            expect(result).toBeNull();
        });

        it('should mark server as unavailable on ECONNREFUSED', async () => {
            mockedAxios.get.mockResolvedValue({
                data: { status: 'ok', model: 'VITS', voices_loaded: [] },
            });
            await service.checkServerHealth();

            const err = new Error('Connection refused');
            (err as any).code = 'ECONNREFUSED';
            mockedAxios.post.mockRejectedValue(err);

            const result = await service.synthesize('Hello');

            expect(result).toBeNull();
            expect(service.isAvailable()).toBe(false);
        });
    });

    describe('getVoices', () => {
        it('should return fallback voices when server is down', async () => {
            mockedAxios.get.mockRejectedValue(new Error('ECONNREFUSED'));

            const result = await service.getVoices();

            expect(result.serverAvailable).toBe(false);
            expect(result.voices).toHaveProperty('browser-default');
        });

        it('should return server voices when available', async () => {
            mockedAxios.get
                .mockResolvedValueOnce({ data: { status: 'ok', model: 'VITS', voices_loaded: ['en_US-lessac-medium'] } }) // health check
                .mockResolvedValueOnce({
                    data: {
                        voices: { 'en_US-lessac-medium': { name: 'Lessac' } },
                        default: 'en_US-lessac-medium',
                    },
                }); // voices

            await service.checkServerHealth();
            const result = await service.getVoices();

            expect(result.serverAvailable).toBe(true);
            expect(result.voices).toHaveProperty('en_US-lessac-medium');
        });
    });
});
