/**
 * TMix Education — AI Latency & Speed Benchmark
 * 
 * Script này tự động đo lường và đánh giá tốc độ xử lý (thời gian phản hồi)
 * của các dịch vụ AI trong hệ thống:
 * 1. Piper TTS Server (Tốc độ tổng hợp âm thanh từ văn bản)
 * 2. Groq Cloud Llama 3.3 (Tốc độ chấm bài và phân tích)
 * 
 * Chạy: npx ts-node scripts/benchmark-ai-speed.ts
 */

import * as dotenv from 'dotenv';
import axios from 'axios';
import Groq from 'groq-sdk';
import { performance } from 'perf_hooks';

dotenv.config();

const TTS_SERVER_URL = process.env.TTS_SERVER_URL || 'http://127.0.0.1:5050';
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Khởi tạo Groq
const groq = new Groq({ apiKey: GROQ_API_KEY });

// Colors for terminal output
const c = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    red: '\x1b[31m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
};

async function testTtsSpeed() {
    console.log(`${c.bold}${c.cyan}=== TEST 1: Tốc độ xử lý Piper TTS (Local Server) ===${c.reset}`);
    const testTexts = [
        { label: 'Câu ngắn (12 từ)', text: 'Hello, welcome to TMix Education. Today we will learn English pronunciation.' },
        { label: 'Câu trung bình (34 từ)', text: 'Although online learning platforms have fundamentally transformed how we acquire knowledge in modern society, traditional classrooms still play an important role in developing interpersonal skills and building local community relationships.' },
        { label: 'Đoạn văn dài (65 từ)', text: 'Climate change is one of the most pressing challenges facing humanity today. Rising global temperatures have led to more frequent extreme weather events, including devastating floods, prolonged droughts, and unprecedented heatwaves. To address this issue, governments worldwide must implement stricter environmental regulations while simultaneously investing in renewable energy sources such as solar and wind power.' }
    ];

    console.log(`Kết nối TTS Server tại: ${TTS_SERVER_URL}\n`);
    
    for (const item of testTexts) {
        try {
            const start = performance.now();
            const response = await axios.post(`${TTS_SERVER_URL}/synthesize`, {
                text: item.text,
                voice: 'en_US-lessac-medium',
                speed: 1.0
            }, {
                responseType: 'arraybuffer',
                timeout: 15000
            });
            const end = performance.now();
            const duration = (end - start) / 1000; // seconds
            const audioSizeKb = response.data.byteLength / 1024;
            
            console.log(` ▸ ${c.yellow}${item.label}${c.reset}`);
            console.log(`   - Kích thước audio: ${audioSizeKb.toFixed(1)} KB`);
            console.log(`   - Thời gian phản hồi: ${c.green}${duration.toFixed(2)} giây${c.reset}`);
            console.log(`   - Tốc độ sinh: ${(audioSizeKb / duration).toFixed(1)} KB/giây\n`);
        } catch (error: any) {
            console.log(` ✗ Lỗi kiểm tra TTS cho "${item.label}": ${error.message}\n`);
        }
    }
}

async function testLlamaSpeed() {
    console.log(`${c.bold}${c.cyan}=== TEST 2: Tốc độ chấm bài của Llama 3.3 70B (Groq Cloud) ===${c.reset}`);
    if (!GROQ_API_KEY) {
        console.log(`${c.red}✗ Không tìm thấy GROQ_API_KEY trong file .env. Bỏ qua bài test Llama.${c.reset}\n`);
        return;
    }

    const testPrompt = `You are an expert English language examiner. Grade the following student essay in JSON.
    STUDENT ESSAY: "Education is very importent for everyone. People need to study hard to get good jobs. Schools teach us many usefull things about life. I think education help people become better."
    Respond in JSON: {"overallScore": 5.0, "feedback": "Good try."}`;

    // Chạy 3 lần để lấy thời gian trung bình
    const times: number[] = [];
    console.log('Đang gọi API Groq Llama 3.3 70B (Thực hiện 3 lần để tính trung bình)...');

    for (let i = 1; i <= 3; i++) {
        try {
            const start = performance.now();
            await groq.chat.completions.create({
                messages: [
                    { role: 'system', content: 'You are an expert English teacher.' },
                    { role: 'user', content: testPrompt },
                ],
                model: 'llama-3.3-70b-versatile',
                temperature: 0.1,
                response_format: { type: 'json_object' },
            });
            const end = performance.now();
            const duration = (end - start) / 1000;
            times.push(duration);
            console.log(`   - Lần ${i}: ${c.green}${duration.toFixed(2)} giây${c.reset}`);
        } catch (error: any) {
            console.log(`   - Lần ${i}: ${c.red}Lỗi API: ${error.message}${c.reset}`);
        }
    }

    if (times.length > 0) {
        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        console.log(`\n ➔ Thời gian chấm bài trung bình: ${c.bold}${c.green}${avg.toFixed(2)} giây${c.reset}\n`);
    }
}

async function main() {
    console.log(`\n${c.bold}${c.cyan}╔══════════════════════════════════════════════════════════╗${c.reset}`);
    console.log(`${c.bold}${c.cyan}║       TMix Education — Đo lường hiệu năng dịch vụ AI     ║${c.reset}`);
    console.log(`${c.bold}${c.cyan}╚══════════════════════════════════════════════════════════╝${c.reset}\n`);

    await testTtsSpeed();
    await testLlamaSpeed();

    console.log(`${c.bold}${c.cyan}════════════════════════════════════════════════════════════${c.reset}`);
    console.log(`Đã hoàn tất đo lường hiệu năng. Dùng kết quả này làm số liệu thực nghiệm trong đồ án.`);
    console.log(`${c.bold}${c.cyan}════════════════════════════════════════════════════════════${c.reset}\n`);
}

main().catch(console.error);
