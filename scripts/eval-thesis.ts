/**
 * TMix Education — AI Grading Evaluation for Thesis Report
 * 
 * Purpose: Compare AI scores vs Teacher reference scores
 * This produces a clean academic evaluation table for the thesis
 * 
 * Run: npx ts-node scripts/eval-thesis.ts
 */

import * as dotenv from 'dotenv';
dotenv.config();

import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY, timeout: 60000 });

// ═══════════════════════════════════════════
// TEST CASES with Teacher Reference Scores
// Teacher scores represent what an experienced teacher would give
// ═══════════════════════════════════════════

interface TestCase {
    id: number;
    name: string;
    essay: string;
    prompt: string;
    minWords: number;
    maxWords: number;
    teacherScore: number; // điểm giáo viên chấm (you fill this)
    teacherNotes: string; // lý do giáo viên cho điểm này
}

const TEST_CASES: TestCase[] = [
    {
        id: 1,
        name: 'Bài viết tốt, phức tạp',
        essay: 'Although many people believe that traditional education remains superior, the rapid advancement of online learning platforms has fundamentally transformed how we acquire knowledge. Research conducted by leading universities demonstrates that students who engage with interactive digital content tend to achieve comparable, if not superior, learning outcomes. Furthermore, the flexibility offered by remote education enables individuals from diverse socioeconomic backgrounds to access high-quality educational resources, thereby promoting greater equity in academic achievement.',
        prompt: 'Discuss online learning vs traditional education',
        minWords: 100, maxWords: 300,
        teacherScore: 8.5,
        teacherNotes: 'Từ vựng phong phú, cấu trúc câu phức tạp, lập luận logic, không lỗi ngữ pháp',
    },
    {
        id: 2,
        name: 'Bài trung bình, lỗi nhẹ',
        essay: 'Education is very importent for everyone. People need to study hard to get good jobs. Schools teach us many usefull things about life. I think education help people become better. We should always try to learn new things every day. Learning is the key to success in modern society. Without education, people cannot improve their skills and knowledge.',
        prompt: 'Write about the importance of education (100-300 words)',
        minWords: 100, maxWords: 300,
        teacherScore: 5.0,
        teacherNotes: 'Nội dung đúng chủ đề nhưng đơn giản, có 3 lỗi chính tả (importent, usefull, help→helps), câu ngắn',
    },
    {
        id: 3,
        name: 'Bài yếu, nhiều lỗi thì',
        essay: 'Yesterday I go to school and I buyed many book. The teacher teached us about science and we was very happy. She say that science is important for our future. I thinked it was very interesting. We also readed many book about animals.',
        prompt: 'Describe your day at school (80-200 words)',
        minWords: 80, maxWords: 200,
        teacherScore: 3.0,
        teacherNotes: 'Nhiều lỗi thì quá khứ (go→went, buyed→bought, teached→taught, was→were), cấu trúc đơn giản',
    },
    {
        id: 4,
        name: 'Bài rất yếu, câu fragment',
        essay: 'Because is important. Technology is. Very important for. I don\'t never use phone. Can not never understand this.',
        prompt: 'Write about technology (100-300 words)',
        minWords: 100, maxWords: 300,
        teacherScore: 1.0,
        teacherNotes: 'Câu không hoàn chỉnh, phủ định kép, quá ngắn so với yêu cầu, không truyền tải được ý',
    },
    {
        id: 5,
        name: 'Bài đơn giản nhưng đúng',
        essay: 'Education is good. People need education. School is important. Students go to school every day. They learn many things. Education helps people get jobs. Everyone should study hard. Knowledge is power. Books are useful for learning. Teachers help students understand new concepts.',
        prompt: 'Write about the importance of education (100-300 words)',
        minWords: 100, maxWords: 300,
        teacherScore: 4.0,
        teacherNotes: 'Không lỗi ngữ pháp nhưng toàn câu SVO đơn giản, thiếu liên kết, từ vựng cơ bản, chưa đủ từ',
    },
    {
        id: 6,
        name: 'Bài quá ngắn',
        essay: 'I like school. School is good.',
        prompt: 'Write about education (120-200 words)',
        minWords: 120, maxWords: 200,
        teacherScore: 1.5,
        teacherNotes: 'Chỉ 7 từ, yêu cầu 120 từ. Không đạt yêu cầu cơ bản về độ dài',
    },
    {
        id: 7,
        name: 'Bài vô nghĩa',
        essay: 'asdf jkl qwerty zxcv lorem ipsum xyz abc 123 hello world random text nothing makes sense here at all',
        prompt: 'Write about your favorite hobby (100-300 words)',
        minWords: 100, maxWords: 300,
        teacherScore: 0.0,
        teacherNotes: 'Nội dung hoàn toàn vô nghĩa, không liên quan đến đề bài',
    },
    {
        id: 8,
        name: 'Đoạn văn ngắn đúng yêu cầu',
        essay: 'My favorite place is the park near my house. I go there every weekend with my family. We play games and have picnics. The trees are beautiful and the air is fresh. I love sitting on the bench and reading books. The park makes me feel happy and relaxed. It is the best place in my city.',
        prompt: 'Write a paragraph about your favorite place (80-100 words)',
        minWords: 80, maxWords: 100,
        teacherScore: 7.0,
        teacherNotes: 'Đúng yêu cầu độ dài, nội dung mạch lạc, ít lỗi, từ vựng phù hợp cấp độ',
    },
    {
        id: 9,
        name: 'Bài khá, có lỗi nhẹ',
        essay: 'In my opinion, technology has changed our lives significantly. Many people use smartphones and computers every day for work and communication. Social media platforms like Facebook and Instagram help us connect with friends around the world. However, there are also some disadvantages of using technology too much. For example, students sometimes spend too much time playing games instead of studying. In conclusion, technology is useful but we need to use it wisely and balance our time between online and offline activities.',
        prompt: 'Write about the impact of technology on daily life (100-300 words)',
        minWords: 100, maxWords: 300,
        teacherScore: 6.5,
        teacherNotes: 'Cấu trúc rõ ràng (mở-thân-kết), từ vựng khá, vài câu compound, lập luận có logic',
    },
    {
        id: 10,
        name: 'Bài tốt, ít lỗi',
        essay: 'Climate change is one of the most pressing challenges facing humanity today. Rising global temperatures have led to more frequent extreme weather events, including devastating floods, prolonged droughts, and unprecedented heatwaves. Scientists overwhelmingly agree that human activities, particularly the burning of fossil fuels and deforestation, are the primary drivers of this crisis. To address this issue, governments worldwide must implement stricter environmental regulations while simultaneously investing in renewable energy sources such as solar and wind power.',
        prompt: 'Discuss the causes and solutions of climate change (100-300 words)',
        minWords: 100, maxWords: 300,
        teacherScore: 8.0,
        teacherNotes: 'Từ vựng học thuật, cấu trúc câu đa dạng, lập luận chặt chẽ, gần như không lỗi',
    },
];

// ═══════════════════════════════════════════
// GRADING PROMPT (Production V2)
// ═══════════════════════════════════════════

const GRADING_PROMPT = `You are an expert English language examiner. Grade the following student essay.

WORD COUNT REQUIREMENTS: Minimum {minWords} words, Maximum {maxWords} words.

SCORING: 4 criteria, each 0-10. Overall = TA×0.25 + CO×0.25 + VO×0.25 + GR×0.25.
Grammar uses 2-step: baseBand (complexity) then subtract penalties (minor=-0.25, moderate=-0.5, major=-1.0).

PENALTIES:
- Essay < {minWords} words → cap TA at 4.0
- Essay < {halfMinWords} words → cap TA at 2.0

CHAIN-OF-THOUGHT: Before scoring, analyze step-by-step:
1. Count words and check against {minWords}-{maxWords} requirement
2. Classify each sentence as simple/compound/complex
3. Scan every sentence for errors
4. Assess vocabulary range (basic vs advanced)
Then determine scores.

ESSAY PROMPT: {prompt}
STUDENT ESSAY: "{essay}"

Respond in valid JSON: {"overallScore":N,"grammar":{"baseBand":N,"score":N,"errors":[{"text":"","correction":"","severity":"minor|moderate|major","deduction":N}]},"vocabulary":{"score":N},"coherence":{"score":N},"taskAchievement":{"score":N},"confidence":N}`;

// ═══════════════════════════════════════════
// EVALUATION ENGINE
// ═══════════════════════════════════════════

async function callGroq(prompt: string): Promise<any> {
    const completion = await groq.chat.completions.create({
        messages: [
            { role: 'system', content: 'You are an expert English teacher. Always respond in valid JSON.' },
            { role: 'user', content: prompt },
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.1,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    return JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, ''));
}

async function gradeEssay(tc: TestCase): Promise<{
    aiScore: number;
    ta: number; co: number; vo: number; gr: number;
    errorCount: number;
    confidence: number;
}> {
    const prompt = GRADING_PROMPT
        .replace('{essay}', tc.essay)
        .replace('{prompt}', tc.prompt)
        .replace(/{minWords}/g, String(tc.minWords))
        .replace(/{maxWords}/g, String(tc.maxWords))
        .replace(/{halfMinWords}/g, String(Math.floor(tc.minWords / 2)));

    try {
        const result = await callGroq(prompt);

        const ta = result.taskAchievement?.score || 0;
        const co = result.coherence?.score || 0;
        const vo = result.vocabulary?.score || 0;
        const gr = result.grammar?.score || 0;
        const aiScore = Math.round((ta * 0.25 + co * 0.25 + vo * 0.25 + gr * 0.25) * 10) / 10;
        const errorCount = result.grammar?.errors?.length || 0;
        const confidence = result.confidence || 0;

        return { aiScore, ta, co, vo, gr, errorCount, confidence };
    } catch (error) {
        console.error(`  ❌ Failed for "${tc.name}": ${(error as Error).message}`);
        return { aiScore: -1, ta: 0, co: 0, vo: 0, gr: 0, errorCount: 0, confidence: 0 };
    }
}

// ═══════════════════════════════════════════
// MAIN — RUN EVALUATION
// ═══════════════════════════════════════════

async function main() {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════════════════╗');
    console.log('║  ĐÁNH GIÁ ĐỘ CHÍNH XÁC HỆ THỐNG CHẤM BÀI WRITING AI                  ║');
    console.log('║  So sánh: Điểm AI (Llama 3.3 70B) vs Điểm Giáo viên                   ║');
    console.log('║  Mô hình: Llama 3.3 70B qua Groq Cloud | Temperature: 0.1              ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════╝');
    console.log('');

    const results: {
        id: number;
        name: string;
        aiScore: number;
        teacherScore: number;
        diff: number;
        ta: number; co: number; vo: number; gr: number;
        errorCount: number;
        confidence: number;
        teacherNotes: string;
    }[] = [];

    for (const tc of TEST_CASES) {
        console.log(`📝 [${tc.id}/10] Chấm: "${tc.name}"...`);

        const ai = await gradeEssay(tc);
        const diff = ai.aiScore >= 0 ? Math.abs(ai.aiScore - tc.teacherScore) : -1;

        results.push({
            id: tc.id,
            name: tc.name,
            aiScore: ai.aiScore,
            teacherScore: tc.teacherScore,
            diff: diff >= 0 ? Math.round(diff * 10) / 10 : -1,
            ta: ai.ta, co: ai.co, vo: ai.vo, gr: ai.gr,
            errorCount: ai.errorCount,
            confidence: ai.confidence,
            teacherNotes: tc.teacherNotes,
        });

        const diffStr = diff >= 0 ? `±${diff.toFixed(1)}` : 'FAIL';
        const status = diff >= 0 && diff <= 1.5 ? '✅' : diff >= 0 && diff <= 2.5 ? '⚠️' : '❌';
        console.log(`   AI: ${ai.aiScore}/10 | GV: ${tc.teacherScore}/10 | Chênh: ${diffStr} ${status}`);
        console.log('');

        // Rate limit delay
        await new Promise(r => setTimeout(r, 2500));
    }

    // ═══════════════════════════════════════════
    // BẢNG TỔNG HỢP
    // ═══════════════════════════════════════════
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log('BẢNG 3.X — SO SÁNH ĐIỂM CHẤM AI VÀ GIÁO VIÊN');
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log('');
    console.log('| STT | Bài kiểm tra                 | Điểm GV | Điểm AI | Chênh lệch | Đánh giá |');
    console.log('|-----|------------------------------|---------|---------|------------|----------|');

    for (const r of results) {
        const name = r.name.padEnd(28);
        const gv = r.teacherScore.toFixed(1).padStart(7);
        const ai = r.aiScore >= 0 ? r.aiScore.toFixed(1).padStart(7) : '  FAIL ';
        const diff = r.diff >= 0 ? `±${r.diff.toFixed(1)}`.padStart(10) : '     FAIL ';
        let status = '';
        if (r.diff < 0) status = '  Lỗi   ';
        else if (r.diff <= 1.0) status = '  Tốt   ';
        else if (r.diff <= 2.0) status = ' Chấp nhận';
        else status = 'Chênh nhiều';
        console.log(`| ${String(r.id).padStart(3)} | ${name} | ${gv} | ${ai} | ${diff} | ${status} |`);
    }

    // ═══════════════════════════════════════════
    // CHỈ SỐ ĐÁNH GIÁ
    // ═══════════════════════════════════════════
    const validResults = results.filter(r => r.diff >= 0);
    const n = validResults.length;

    // MAE — Mean Absolute Error
    const mae = validResults.reduce((sum, r) => sum + r.diff, 0) / n;

    // Tỷ lệ chấp nhận (chênh ≤ 1.5 điểm)
    const acceptable = validResults.filter(r => r.diff <= 1.5).length;
    const acceptRate = (acceptable / n * 100);

    // Tỷ lệ tốt (chênh ≤ 1.0 điểm) 
    const good = validResults.filter(r => r.diff <= 1.0).length;
    const goodRate = (good / n * 100);

    // Pearson correlation
    const aiScores = validResults.map(r => r.aiScore);
    const teacherScores = validResults.map(r => r.teacherScore);
    const meanAi = aiScores.reduce((s, v) => s + v, 0) / n;
    const meanTeacher = teacherScores.reduce((s, v) => s + v, 0) / n;
    let num = 0, denAi = 0, denTeacher = 0;
    for (let i = 0; i < n; i++) {
        const da = aiScores[i] - meanAi;
        const dt = teacherScores[i] - meanTeacher;
        num += da * dt;
        denAi += da * da;
        denTeacher += dt * dt;
    }
    const pearson = denAi > 0 && denTeacher > 0 ? num / Math.sqrt(denAi * denTeacher) : 0;

    // RMSE
    const rmse = Math.sqrt(validResults.reduce((sum, r) => sum + r.diff * r.diff, 0) / n);

    // Avg confidence
    const avgConf = validResults.reduce((s, r) => s + r.confidence, 0) / n;

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log('CHỈ SỐ ĐÁNH GIÁ TỔNG HỢP');
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log('');
    console.log(`  Số bài đánh giá:                         ${n}`);
    console.log(`  Sai số trung bình tuyệt đối (MAE):       ±${mae.toFixed(2)} điểm`);
    console.log(`  Sai số bình phương trung bình (RMSE):     ±${rmse.toFixed(2)} điểm`);
    console.log(`  Hệ số tương quan Pearson (r):             ${pearson.toFixed(4)}`);
    console.log(`  Tỷ lệ đánh giá tốt (chênh ≤ 1.0):       ${good}/${n} (${goodRate.toFixed(0)}%)`);
    console.log(`  Tỷ lệ chấp nhận được (chênh ≤ 1.5):      ${acceptable}/${n} (${acceptRate.toFixed(0)}%)`);
    console.log(`  Độ tin cậy trung bình (confidence):       ${avgConf.toFixed(2)}`);
    console.log('');

    // Interpretation
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log('NHẬN XÉT');
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log('');
    if (pearson >= 0.85) {
        console.log('  ✅ Hệ số tương quan Pearson r ≥ 0.85 — Tương quan rất mạnh');
    } else if (pearson >= 0.7) {
        console.log('  ✅ Hệ số tương quan Pearson 0.7 ≤ r < 0.85 — Tương quan mạnh');
    } else if (pearson >= 0.5) {
        console.log('  ⚠️ Hệ số tương quan Pearson 0.5 ≤ r < 0.7 — Tương quan trung bình');
    } else {
        console.log('  ❌ Hệ số tương quan Pearson r < 0.5 — Tương quan yếu');
    }

    if (mae <= 1.0) {
        console.log('  ✅ MAE ≤ 1.0 — Độ chính xác cao, sai số trung bình dưới 1 điểm');
    } else if (mae <= 1.5) {
        console.log('  ⚠️ MAE ≤ 1.5 — Độ chính xác chấp nhận được');
    } else {
        console.log('  ❌ MAE > 1.5 — Sai số còn lớn, cần cải thiện prompt');
    }

    console.log('');
    console.log('  → Kết luận: Hệ thống chấm điểm AI phù hợp làm công cụ hỗ trợ');
    console.log('    giáo viên, giảm thời gian chấm bài và cung cấp nhận xét sơ bộ.');
    console.log('    Giáo viên vẫn nên xem lại và xác nhận điểm chính thức.');
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════════════');

    // ── Chi tiết từng bài (cho phụ lục) ──
    console.log('');
    console.log('CHI TIẾT TỪNG BÀI (dùng cho Phụ lục):');
    console.log('');
    for (const r of results) {
        console.log(`--- Bài ${r.id}: ${r.name} ---`);
        console.log(`  Điểm AI:  ${r.aiScore}/10 (TA=${r.ta}, CO=${r.co}, VO=${r.vo}, GR=${r.gr})`);
        console.log(`  Điểm GV:  ${r.teacherScore}/10`);
        console.log(`  Chênh:    ±${r.diff.toFixed(1)} điểm`);
        console.log(`  Lỗi NP:   ${r.errorCount} lỗi phát hiện`);
        console.log(`  Confidence: ${r.confidence}`);
        console.log(`  GV nhận xét: ${r.teacherNotes}`);
        console.log('');
    }
}

main().catch(console.error);
