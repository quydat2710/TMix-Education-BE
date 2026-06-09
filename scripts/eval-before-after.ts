/**
 * Before/After Evaluation Script — TMix Education AI Grading
 * 
 * Purpose: Generate comparison data for thesis report
 * Shows measurable improvement between V1 (old prompt) and V2 (CoT + Context-Aware)
 * 
 * Run: npx ts-node scripts/eval-before-after.ts
 * API cost: ~16 calls (8 test cases × 2 versions) — run once
 */

import * as dotenv from 'dotenv';
dotenv.config();

import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY, timeout: 60000 });

// ═══════════════════════════════════════════
// TEST CASES — same for both versions
// ═══════════════════════════════════════════

interface TestCase {
    name: string;
    essay: string;
    prompt: string;
    minWords: number;
    maxWords: number;
    expectedRange: [number, number]; // [min, max] for overallScore
    expectedErrorCount?: [number, number]; // [min, max] expected grammar errors
    description: string;
}

const TEST_CASES: TestCase[] = [
    {
        name: 'Minor errors only',
        essay: 'Education is very importent for everyone. People need to study hard to get good jobs. Schools teach us many usefull things about life. I think education help people become better. We should always try to learn new things every day.',
        prompt: 'Write about the importance of education',
        minWords: 100, maxWords: 300,
        expectedRange: [4.0, 6.5],
        expectedErrorCount: [2, 5],
        description: 'Simple essay with minor spelling errors (importent, usefull, help→helps)',
    },
    {
        name: 'Moderate errors',
        essay: 'Yesterday I go to school and I buyed many book. The teacher teached us about science and we was very happy. She say that science is important for our future.',
        prompt: 'Describe your day at school',
        minWords: 80, maxWords: 200,
        expectedRange: [2.0, 5.0],
        expectedErrorCount: [4, 8],
        description: 'Simple essay with tense and agreement errors',
    },
    {
        name: 'Major errors',
        essay: 'Because is important. Technology is. Very important for. I don\'t never use phone. Can not never understand this.',
        prompt: 'Write about technology',
        minWords: 100, maxWords: 300,
        expectedRange: [0.5, 2.5],
        expectedErrorCount: [3, 7],
        description: 'Essay with fragments, double negatives (major errors)',
    },
    {
        name: 'Near-perfect complex',
        essay: 'Although many people believe that traditional education remains superior, the rapid advancement of online learning platforms has fundamentally transformed how we acquire knowledge. Research conducted by leading universities demonstrates that students who engage with interactive digital content tend to achieve comparable, if not superior, learning outcomes. Furthermore, the flexibility offered by remote education enables individuals from diverse socioeconomic backgrounds to access high-quality educational resources, thereby promoting greater equity in academic achievement.',
        prompt: 'Discuss online learning vs traditional education',
        minWords: 100, maxWords: 300,
        expectedRange: [7.5, 10.0],
        expectedErrorCount: [0, 1],
        description: 'Complex essay with sophisticated vocabulary, no errors',
    },
    {
        name: 'Simple but correct',
        essay: 'Education is good. People need education. School is important. Students go to school every day. They learn many things. Education helps people get jobs. Everyone should study hard. Knowledge is power. Books are useful for learning. Teachers help students understand.',
        prompt: 'Write about the importance of education',
        minWords: 100, maxWords: 300,
        expectedRange: [3.0, 5.5],
        expectedErrorCount: [0, 1],
        description: 'Only simple SVO sentences, no errors — should NOT get high band',
    },
    {
        name: 'Very short essay',
        essay: 'I like school. School is good.',
        prompt: 'Write about education (120-200 words)',
        minWords: 120, maxWords: 200,
        expectedRange: [0.5, 3.0],
        expectedErrorCount: [0, 1],
        description: 'Under minWords/2 — should be severely penalized',
    },
    {
        name: 'Gibberish',
        essay: 'asdf jkl qwerty zxcv lorem ipsum xyz abc 123 hello world random text nothing makes sense here at all this is complete nonsense',
        prompt: 'Write about your favorite hobby',
        minWords: 100, maxWords: 300,
        expectedRange: [0.0, 1.5],
        description: 'Non-meaningful text — should get near-zero',
    },
    {
        name: 'Short paragraph (80-100 words requirement)',
        essay: 'My favorite place is the park near my house. I go there every weekend with my family. We play games and have picnics. The trees are beautiful and the air is fresh. I love sitting on the bench and reading books. The park makes me feel happy and relaxed. It is the best place in my city.',
        prompt: 'Write a paragraph about your favorite place (80-100 words)',
        minWords: 80, maxWords: 100,
        expectedRange: [5.0, 8.5],
        expectedErrorCount: [0, 2],
        description: 'Short paragraph matching requirement — should NOT be penalized for word count',
    },
];

// ═══════════════════════════════════════════
// V1 PROMPT (Old — hardcoded, no CoT)
// ═══════════════════════════════════════════

const V1_PROMPT = `You are an expert English language examiner. Grade the following student essay.

SCORING: 4 criteria, each 0-10. Overall = TA×0.25 + CO×0.25 + VO×0.25 + GR×0.25.
Grammar uses 2-step: baseBand (complexity) then subtract penalties (minor=-0.25, moderate=-0.5, major=-1.0).

PENALTIES:
- Essay < 100 words → cap TA at 4.0
- Essay < 50 words → cap TA at 2.0

ESSAY PROMPT: {prompt}
STUDENT ESSAY: "{essay}"

Respond in valid JSON: {"overallScore":N,"grammar":{"baseBand":N,"score":N,"errors":[{"text":"","correction":"","severity":"minor|moderate|major","deduction":N}]},"vocabulary":{"score":N},"coherence":{"score":N},"taskAchievement":{"score":N}}`;

// ═══════════════════════════════════════════
// V2 PROMPT (New — CoT + Context-Aware)
// ═══════════════════════════════════════════

const V2_PROMPT = `You are an expert English language examiner. Grade the following student essay.

WORD COUNT REQUIREMENTS: Minimum {minWords} words, Maximum {maxWords} words.

SCORING: 4 criteria, each 0-10. Overall = TA×0.25 + CO×0.25 + VO×0.25 + GR×0.25.
Grammar uses 2-step: baseBand (complexity) then subtract penalties (minor=-0.25, moderate=-0.5, major=-1.0).

PENALTIES:
- Essay < {minWords} words → cap TA at 4.0
- Essay < {halfMinWords} words → cap TA at 2.0

CHAIN-OF-THOUGHT: Before scoring, analyze step-by-step:
1. Classify each sentence as simple/compound/complex
2. Scan every sentence for errors
3. Assess vocabulary range (basic vs advanced)
4. Check word count against {minWords}-{maxWords} requirement
Then determine scores.

ESSAY PROMPT: {prompt}
STUDENT ESSAY: "{essay}"

Respond in valid JSON: {"reasoning":{"sentenceAnalysis":"...","errorScan":"..."},"confidence":N,"overallScore":N,"grammar":{"baseBand":N,"score":N,"errors":[{"text":"","correction":"","severity":"minor|moderate|major","deduction":N}]},"vocabulary":{"score":N},"coherence":{"score":N},"taskAchievement":{"score":N}}`;

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

async function runTest(testCase: TestCase, promptTemplate: string, version: string): Promise<{
    score: number;
    errorCount: number;
    confidence?: number;
}> {
    const prompt = promptTemplate
        .replace('{essay}', testCase.essay)
        .replace('{prompt}', testCase.prompt)
        .replace(/{minWords}/g, String(testCase.minWords))
        .replace(/{maxWords}/g, String(testCase.maxWords))
        .replace(/{halfMinWords}/g, String(Math.floor(testCase.minWords / 2)));

    try {
        const result = await callGroq(prompt);

        // Server-side recalculation (same as production)
        const ta = result.taskAchievement?.score || 0;
        const co = result.coherence?.score || 0;
        const vo = result.vocabulary?.score || 0;
        const gr = result.grammar?.score || 0;
        const overallScore = Math.round((ta * 0.25 + co * 0.25 + vo * 0.25 + gr * 0.25) * 10) / 10;
        const errorCount = result.grammar?.errors?.length || 0;

        return { score: overallScore, errorCount, confidence: result.confidence };
    } catch (error) {
        console.error(`  ❌ ${version} failed for "${testCase.name}": ${error.message}`);
        return { score: -1, errorCount: 0 };
    }
}

function inRange(value: number, range: [number, number]): boolean {
    return value >= range[0] && value <= range[1];
}

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════

async function main() {
    console.log('╔══════════════════════════════════════════════════════════════════╗');
    console.log('║    BEFORE/AFTER COMPARISON — AI GRADING V1 vs V2               ║');
    console.log('║    V1: Basic prompt (hardcoded)                                 ║');
    console.log('║    V2: Chain-of-Thought + Context-Aware (dynamic minWords)      ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝');
    console.log('');

    const results: {
        name: string;
        v1Score: number; v2Score: number;
        v1Errors: number; v2Errors: number;
        v2Confidence: number | undefined;
        expected: [number, number];
        v1InRange: boolean; v2InRange: boolean;
    }[] = [];

    for (const tc of TEST_CASES) {
        console.log(`📝 Testing: ${tc.name}...`);
        console.log(`   ${tc.description}`);

        const v1 = await runTest(tc, V1_PROMPT, 'V1');
        // Small delay to avoid rate limit
        await new Promise(r => setTimeout(r, 2000));
        const v2 = await runTest(tc, V2_PROMPT, 'V2');
        await new Promise(r => setTimeout(r, 2000));

        const v1InRange = v1.score >= 0 && inRange(v1.score, tc.expectedRange);
        const v2InRange = v2.score >= 0 && inRange(v2.score, tc.expectedRange);

        results.push({
            name: tc.name,
            v1Score: v1.score, v2Score: v2.score,
            v1Errors: v1.errorCount, v2Errors: v2.errorCount,
            v2Confidence: v2.confidence,
            expected: tc.expectedRange,
            v1InRange, v2InRange,
        });

        console.log(`   V1: ${v1.score}/10 ${v1InRange ? '✅' : '❌'} | V2: ${v2.score}/10 ${v2InRange ? '✅' : '❌'} | Expected: ${tc.expectedRange[0]}-${tc.expectedRange[1]} | Confidence: ${v2.confidence?.toFixed(2) || 'N/A'}`);
        console.log('');
    }

    // ── Summary Table ──
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('SUMMARY TABLE');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('');
    console.log('| Test Case                        | V1 Score | V2 Score | Expected     | V1  | V2  | Confidence |');
    console.log('|----------------------------------|----------|----------|--------------|-----|-----|------------|');

    for (const r of results) {
        const name = r.name.padEnd(32);
        const v1 = r.v1Score >= 0 ? r.v1Score.toFixed(1).padStart(8) : '  FAIL  ';
        const v2 = r.v2Score >= 0 ? r.v2Score.toFixed(1).padStart(8) : '  FAIL  ';
        const exp = `${r.expected[0]}-${r.expected[1]}`.padEnd(12);
        const v1Check = r.v1InRange ? ' ✅  ' : ' ❌  ';
        const v2Check = r.v2InRange ? ' ✅  ' : ' ❌  ';
        const conf = r.v2Confidence !== undefined ? r.v2Confidence.toFixed(2).padStart(10) : '       N/A';
        console.log(`| ${name} | ${v1} | ${v2} | ${exp} | ${v1Check} | ${v2Check} | ${conf} |`);
    }

    // ── Accuracy Metrics ──
    const v1Accurate = results.filter(r => r.v1InRange).length;
    const v2Accurate = results.filter(r => r.v2InRange).length;
    const total = results.length;

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('ACCURACY METRICS');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(`V1 Accuracy: ${v1Accurate}/${total} (${Math.round(v1Accurate / total * 100)}%)`);
    console.log(`V2 Accuracy: ${v2Accurate}/${total} (${Math.round(v2Accurate / total * 100)}%)`);
    console.log(`Improvement: ${v2Accurate - v1Accurate > 0 ? '+' : ''}${v2Accurate - v1Accurate} test cases`);

    // Average score deviation from expected midpoint
    const v1Deviation = results.filter(r => r.v1Score >= 0).reduce((sum, r) => {
        const mid = (r.expected[0] + r.expected[1]) / 2;
        return sum + Math.abs(r.v1Score - mid);
    }, 0) / total;

    const v2Deviation = results.filter(r => r.v2Score >= 0).reduce((sum, r) => {
        const mid = (r.expected[0] + r.expected[1]) / 2;
        return sum + Math.abs(r.v2Score - mid);
    }, 0) / total;

    console.log(`V1 Avg Deviation from expected midpoint: ${v1Deviation.toFixed(2)}`);
    console.log(`V2 Avg Deviation from expected midpoint: ${v2Deviation.toFixed(2)}`);
    console.log('');

    // Error detection comparison
    const v1TotalErrors = results.reduce((s, r) => s + r.v1Errors, 0);
    const v2TotalErrors = results.reduce((s, r) => s + r.v2Errors, 0);
    console.log(`Total errors detected — V1: ${v1TotalErrors} | V2: ${v2TotalErrors}`);

    // Confidence stats
    const confidences = results.map(r => r.v2Confidence).filter(c => c !== undefined) as number[];
    if (confidences.length > 0) {
        const avgConf = confidences.reduce((s, c) => s + c, 0) / confidences.length;
        const lowConf = confidences.filter(c => c < 0.7).length;
        console.log(`V2 Avg Confidence: ${avgConf.toFixed(2)} | Low confidence (<0.7): ${lowConf}/${confidences.length}`);
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('Done! Use these results for your thesis report.');
    console.log('═══════════════════════════════════════════════════════════════════');
}

main().catch(console.error);
