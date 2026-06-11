import { Injectable, Logger } from '@nestjs/common';
import { GroqService } from './groq.service';
import { WRITING_GRADING_PROMPT, SPEAKING_GRADING_PROMPT, FREE_SPEAKING_GRADING_PROMPT } from './prompts/grading.prompts';

export interface WritingGrading {
    reasoning?: {
        sentenceAnalysis: string;
        errorScan: string;
        vocabularyAssessment: string;
        coherenceAssessment: string;
        wordCountCheck: string;
    };
    confidence?: number;
    overallScore: number;
    grammar: { baseBand?: number; score: number; errors: { text: string; correction: string; rule: string; severity?: string; deduction?: number }[] };
    vocabulary: { baseBand?: number; score: number; suggestions: string[] };
    coherence: { score: number; feedback: string };
    taskAchievement: { score: number; feedback: string };
    scoringBreakdown?: { formula: string; calculation: string; penaltiesApplied: string[] };
    detailedFeedback: string;
}

export interface SpeakingGrading {
    overallScore: number;
    transcription: string;
    pronunciation: { baseBand?: number; score: number; feedback: string; mispronunciations?: { word: string; expected: string; actual: string; severity: string }[] };
    fluency: { baseBand?: number; score: number; feedback: string; wordsPerMinute?: number; pauseCount?: number };
    vocabulary?: { baseBand?: number; score: number; feedback: string };
    grammar?: { baseBand?: number; score: number; feedback: string };
    accuracy?: { score: number; matchPercentage: number; feedback: string; missedWords?: string[]; addedWords?: string[] };
    scoringBreakdown?: { formula: string; calculation: string; penaltiesApplied: string[] };
    detailedFeedback: string;
}

/**
 * Grading options — context from teacher's test configuration
 */
export interface GradingOptions {
    minWords?: number;
    maxWords?: number;
}

/**
 * Text complexity metrics — server-side validation of AI's baseBand
 * Enhanced with: complexSentenceRatio, connectorsCount, readabilityScore
 */
interface TextMetrics {
    wordCount: number;
    sentenceCount: number;
    avgSentenceLength: number;
    vocabularyDiversity: number; // unique words / total words (0-1)
    paragraphCount: number;
    maxRecommendedBand: number; // Server-calculated band ceiling
    complexSentenceRatio: number; // % sentences with subordinate clauses
    connectorsCount: number; // number of cohesive devices found
    readabilityScore: number; // Flesch-Kincaid Grade Level
}

// Subordinating conjunctions that indicate complex sentences
const SUBORDINATING_CONJUNCTIONS = [
    'although', 'though', 'even though', 'because', 'since', 'unless',
    'while', 'whereas', 'if', 'whether', 'when', 'whenever', 'where',
    'wherever', 'after', 'before', 'until', 'as soon as', 'in order to',
    'so that', 'provided that', 'as long as',
];

// Relative pronouns that indicate complex sentences
const RELATIVE_PRONOUNS = ['which', 'who', 'whom', 'whose', 'that'];

// Cohesive devices / discourse markers
const COHESIVE_DEVICES = [
    'however', 'furthermore', 'moreover', 'additionally', 'consequently',
    'nevertheless', 'nonetheless', 'therefore', 'thus', 'hence',
    'in contrast', 'on the other hand', 'in addition', 'as a result',
    'for example', 'for instance', 'in conclusion', 'to summarize',
    'first', 'firstly', 'second', 'secondly', 'third', 'thirdly',
    'finally', 'in particular', 'specifically', 'meanwhile', 'subsequently',
    'overall', 'in summary', 'to conclude', 'above all',
];

@Injectable()
export class AiService {
    private readonly logger = new Logger(AiService.name);

    constructor(private readonly groqService: GroqService) { }

    /**
     * Estimate syllable count for English words (Flesch-Kincaid)
     * Based on simplified vowel-counting heuristic
     */
    private countSyllables(word: string): number {
        word = word.toLowerCase().replace(/[^a-z]/g, '');
        if (word.length <= 3) return 1;
        // Remove silent 'e' and common suffixes
        word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
        word = word.replace(/^y/, '');
        const matches = word.match(/[aeiouy]{1,2}/g);
        return matches ? Math.max(matches.length, 1) : 1;
    }

    /**
     * Analyze text complexity for server-side validation
     * Enhanced with: complex sentence detection, connectors counting, Flesch-Kincaid readability
     */
    private analyzeTextMetrics(text: string): TextMetrics {
        const words = text.trim().split(/\s+/).filter(w => w.length > 0);
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
        const uniqueWords = new Set(words.map(w => w.toLowerCase().replace(/[^a-z']/g, '')));

        const wordCount = words.length;
        const sentenceCount = Math.max(sentences.length, 1);
        const avgSentenceLength = wordCount / sentenceCount;
        const vocabularyDiversity = wordCount > 0 ? uniqueWords.size / wordCount : 0;
        const paragraphCount = paragraphs.length;

        // ── Complex sentence ratio ──
        const textLower = text.toLowerCase();
        let complexSentences = 0;
        for (const sentence of sentences) {
            const sentenceLower = sentence.toLowerCase();
            const hasSubordinate = SUBORDINATING_CONJUNCTIONS.some(c => sentenceLower.includes(c));
            const hasRelative = RELATIVE_PRONOUNS.some(p => {
                // Only count 'that' when used as relative pronoun (after a noun, not at start)
                if (p === 'that' && sentenceLower.trim().startsWith('that')) return false;
                return sentenceLower.includes(p);
            });
            if (hasSubordinate || hasRelative) complexSentences++;
        }
        const complexSentenceRatio = sentenceCount > 0 ? complexSentences / sentenceCount : 0;

        // ── Cohesive devices count ──
        let connectorsCount = 0;
        for (const device of COHESIVE_DEVICES) {
            const regex = new RegExp(`\\b${device}\\b`, 'gi');
            const matches = textLower.match(regex);
            if (matches) connectorsCount += matches.length;
        }

        // ── Flesch-Kincaid Grade Level ──
        let totalSyllables = 0;
        for (const word of words) {
            totalSyllables += this.countSyllables(word);
        }
        const readabilityScore = wordCount > 0 && sentenceCount > 0
            ? 0.39 * (wordCount / sentenceCount) + 11.8 * (totalSyllables / wordCount) - 15.59
            : 0;

        // ── Calculate max recommended band (ENHANCED) ──
        let maxBand = 10;

        // Short sentences + low diversity = simple writing
        if (avgSentenceLength < 8 && vocabularyDiversity < 0.55) {
            maxBand = 5; // Very simple
        } else if (avgSentenceLength < 10 && vocabularyDiversity < 0.6) {
            maxBand = 6; // Simple
        } else if (avgSentenceLength < 14) {
            maxBand = 7; // Moderate
        } else if (avgSentenceLength < 18) {
            maxBand = 8; // Good
        }

        // Adjust based on complex sentence ratio
        // Long sentences but NO complex structures = just listing/run-on, not truly complex
        if (avgSentenceLength >= 14 && complexSentenceRatio < 0.1) {
            maxBand = Math.min(maxBand, 6); // Long but simple → cap at 6
            this.logger.warn(`Long sentences (avg=${avgSentenceLength.toFixed(1)}) but low complexity ratio (${(complexSentenceRatio * 100).toFixed(0)}%) → capping maxBand to 6`);
        }
        // High complexity ratio → allow higher band
        if (complexSentenceRatio > 0.4 && vocabularyDiversity > 0.6) {
            maxBand = Math.max(maxBand, 8); // Genuinely complex → allow 8+
        }

        this.logger.log(`TextMetrics: words=${wordCount}, sentences=${sentenceCount}, avgLen=${avgSentenceLength.toFixed(1)}, diversity=${vocabularyDiversity.toFixed(2)}, paragraphs=${paragraphCount}, complexRatio=${(complexSentenceRatio * 100).toFixed(0)}%, connectors=${connectorsCount}, FK=${readabilityScore.toFixed(1)} → maxBand=${maxBand}`);

        return {
            wordCount, sentenceCount, avgSentenceLength, vocabularyDiversity,
            paragraphCount, maxRecommendedBand: maxBand,
            complexSentenceRatio, connectorsCount, readabilityScore,
        };
    }

    /**
     * Server-side enforcement: recalculate grammar score from baseBand + penalties
     */
    private enforceGrammarScore(grading: WritingGrading, metrics: TextMetrics): void {
        const errors = grading.grammar?.errors || [];
        let baseBand = grading.grammar?.baseBand || grading.grammar?.score || 5;

        // Validate baseBand against text metrics
        if (baseBand > metrics.maxRecommendedBand) {
            this.logger.warn(`Grammar baseBand ${baseBand} exceeds text metrics maxBand ${metrics.maxRecommendedBand} → capping`);
            baseBand = metrics.maxRecommendedBand;
        }

        // Recalculate deductions with correct severity mapping
        let totalDeduction = 0;
        let minorTotal = 0;

        for (const err of errors) {
            const sev = (err.severity || 'minor').toLowerCase();

            // Enforce correct deduction amounts
            if (sev === 'minor') {
                err.deduction = 0.25;
                if (minorTotal + 0.25 <= 2.0) {
                    minorTotal += 0.25;
                    totalDeduction += 0.25;
                }
            } else if (sev === 'moderate') {
                err.deduction = 0.5;
                totalDeduction += 0.5;
            } else if (sev === 'major') {
                err.deduction = 1.0;
                totalDeduction += 1.0;
            }
        }

        const newScore = Math.max(0, Math.round((baseBand - totalDeduction) * 10) / 10);

        this.logger.log(`Grammar enforcement: baseBand=${baseBand}, deductions=${totalDeduction.toFixed(2)} (${errors.length} errors), score=${grading.grammar.score}→${newScore}`);

        grading.grammar.baseBand = baseBand;
        grading.grammar.score = newScore;
    }

    /**
     * Server-side enforcement: validate vocabulary baseBand against text metrics
     */
    private enforceVocabularyScore(grading: WritingGrading, metrics: TextMetrics): void {
        const baseBand = grading.vocabulary?.baseBand || grading.vocabulary?.score || 5;

        // If vocabulary diversity is very low, cap the band
        // Note: thresholds softened to avoid over-penalizing when combined with other enforcement layers
        let maxVocabBand = 10;
        if (metrics.vocabularyDiversity < 0.40) {
            maxVocabBand = 4;
        } else if (metrics.vocabularyDiversity < 0.50) {
            maxVocabBand = 5;
        } else if (metrics.vocabularyDiversity < 0.60) {
            maxVocabBand = 6;
        }

        if (baseBand > maxVocabBand) {
            this.logger.warn(`Vocab baseBand ${baseBand} exceeds diversity-based max ${maxVocabBand} (diversity=${metrics.vocabularyDiversity.toFixed(2)}) → capping`);
            grading.vocabulary.baseBand = maxVocabBand;
            grading.vocabulary.score = Math.min(grading.vocabulary.score, maxVocabBand);
        }
    }

    /**
     * Server-side enforcement: validate coherence score based on connectors and paragraphing
     */
    private enforceCoherenceScore(grading: WritingGrading, metrics: TextMetrics): void {
        // No connectors AND single paragraph AND long essay → coherence cannot be > 5
        // Short essays (<150 words) are naturally single-paragraph, so don't penalize them for that
        if (metrics.connectorsCount === 0 && metrics.paragraphCount <= 1 && metrics.wordCount >= 150) {
            if (grading.coherence.score > 5) {
                this.logger.warn(`Coherence score ${grading.coherence.score} but 0 connectors and ${metrics.paragraphCount} paragraph(s) for ${metrics.wordCount} words → capping at 5`);
                grading.coherence.score = 5;
            }
        }
        // Very few connectors for a long essay
        if (metrics.wordCount > 150 && metrics.connectorsCount <= 1 && grading.coherence.score > 6) {
            this.logger.warn(`Coherence score ${grading.coherence.score} but only ${metrics.connectorsCount} connector(s) for ${metrics.wordCount} words → capping at 6`);
            grading.coherence.score = 6;
        }
    }

    /**
     * Server-side enforcement: validate task achievement based on word count requirements
     */
    private enforceTaskAchievementScore(grading: WritingGrading, metrics: TextMetrics, minWords: number, maxWords: number): void {
        const halfMin = Math.floor(minWords / 2);

        if (metrics.wordCount < halfMin) {
            // Severely under-length → cap at 2
            if (grading.taskAchievement.score > 2) {
                this.logger.warn(`TA score ${grading.taskAchievement.score} but wordCount=${metrics.wordCount} < halfMin=${halfMin} → capping at 2`);
                grading.taskAchievement.score = 2;
            }
        } else if (metrics.wordCount < minWords) {
            // Under minimum → cap at 4
            if (grading.taskAchievement.score > 4) {
                this.logger.warn(`TA score ${grading.taskAchievement.score} but wordCount=${metrics.wordCount} < minWords=${minWords} → capping at 4`);
                grading.taskAchievement.score = 4;
            }
        }
    }

    /**
     * Grade a writing essay using Groq (Llama 3.3 70B)
     * 5-layer system: Pre-processing → AI grading → Server enforcement → Confidence check → Teacher override
     *
     * Techniques applied:
     * - Chain-of-Thought Prompting (Wei et al., 2022)
     * - Context-Aware Grading (dynamic minWords/maxWords from teacher)
     * - Multi-layer server-side enforcement (text metrics, score recalculation)
     * - Confidence scoring for uncertain gradings
     */
    async gradeWriting(essay: string, prompt: string, rubric?: string, options?: GradingOptions): Promise<WritingGrading> {
        this.logger.log(`gradeWriting called. Groq configured: ${this.groqService.isConfigured()}`);

        if (!this.groqService.isConfigured()) {
            this.logger.warn('Groq not configured! Returning default grading (score=0)');
            return this.getDefaultWritingGrading();
        }

        // Context-aware word count requirements
        const minWords = options?.minWords || 100;
        const maxWords = options?.maxWords || 300;
        const halfMinWords = Math.floor(minWords / 2);

        // Step 0: Server-side text analysis (Pre-processing)
        const metrics = this.analyzeTextMetrics(essay);

        const fullPrompt = WRITING_GRADING_PROMPT
            .replace('{essay}', essay)
            .replace('{prompt}', prompt || 'Write an essay on the given topic')
            .replace('{rubric}', rubric || 'Grammar accuracy, Vocabulary range, Coherence and cohesion, Task achievement')
            .replace(/{minWords}/g, String(minWords))
            .replace(/{maxWords}/g, String(maxWords))
            .replace(/{halfMinWords}/g, String(halfMinWords));

        try {
            const response = await this.groqService.generateText(fullPrompt);
            this.logger.log(`Groq raw response length: ${response?.length || 0}`);
            const grading = this.groqService.parseJsonResponse<WritingGrading>(response);

            // Server enforcement Layer 1: Recalculate grammar score from baseBand + penalties
            this.enforceGrammarScore(grading, metrics);

            // Server enforcement Layer 2: Validate vocabulary baseBand
            this.enforceVocabularyScore(grading, metrics);

            // Server enforcement Layer 3: Validate coherence based on connectors
            this.enforceCoherenceScore(grading, metrics);

            // Server enforcement Layer 4: Validate task achievement based on word count
            this.enforceTaskAchievementScore(grading, metrics, minWords, maxWords);

            // Server enforcement Layer 5: Recalculate overallScore (AI bad at arithmetic)
            const ta = grading.taskAchievement?.score || 0;
            const co = grading.coherence?.score || 0;
            const vo = grading.vocabulary?.score || 0;
            const gr = grading.grammar?.score || 0;
            grading.overallScore = Math.round((ta * 0.25 + co * 0.25 + vo * 0.25 + gr * 0.25) * 10) / 10;

            // Fix the calculation string in scoringBreakdown
            if (grading.scoringBreakdown) {
                grading.scoringBreakdown.calculation = `${ta} × 0.25 + ${co} × 0.25 + ${vo} × 0.25 + ${gr} × 0.25 = ${grading.overallScore}`;
            }

            // Confidence check: flag low-confidence gradings for teacher review
            if (grading.confidence !== undefined && grading.confidence < 0.6) {
                this.logger.warn(`⚠️ Low confidence grading (${grading.confidence.toFixed(2)}). Teacher review recommended.`);
            }

            this.logger.log(`Writing graded: overall=${grading.overallScore}/10 (TA=${ta}, CO=${co}, VO=${vo}, GR=${gr}) | confidence=${grading.confidence?.toFixed(2) || 'N/A'} | TextMetrics: words=${metrics.wordCount}, diversity=${metrics.vocabularyDiversity.toFixed(2)}, complexRatio=${(metrics.complexSentenceRatio * 100).toFixed(0)}%, connectors=${metrics.connectorsCount}, FK=${metrics.readabilityScore.toFixed(1)}, maxBand=${metrics.maxRecommendedBand}`);

            // Strip reasoning from response (keep response lightweight for frontend)
            delete grading.reasoning;

            return grading;
        } catch (error) {
            this.logger.error(`Writing grading failed: ${error.message}`);
            this.logger.error(`Stack: ${error.stack}`);
            return this.getDefaultWritingGrading();
        }
    }

    /**
     * Grade a speaking recording:
     * Mode "read_aloud": compare transcription with reference text (Levenshtein + LLM)
     * Mode "free_speaking": evaluate transcription against a topic prompt (LLM only)
     */
    async gradeSpeaking(
        audioFilePath: string, 
        promptOrTopic: string, 
        referenceText?: string,
        mode: 'read_aloud' | 'free_speaking' = 'read_aloud'
    ): Promise<SpeakingGrading> {
        if (!this.groqService.isConfigured()) {
            return this.getDefaultSpeakingGrading();
        }

        try {
            // Step 1: Transcribe audio
            this.logger.log(`Transcribing audio with Groq Whisper for mode: ${mode}...`);
            const transcriptionResult = await this.groqService.transcribeAudio(audioFilePath);
            const transcription = transcriptionResult.text;
            const duration = transcriptionResult.duration;
            this.logger.log(`Transcription: "${transcription?.substring(0, 100)}..." (duration: ${duration}s)`);

            // Step 2: Calculate Words Per Minute (WPM)
            const wordCount = transcription ? transcription.trim().split(/\s+/).length : 0;
            const wpm = duration > 0 ? Math.round((wordCount / duration) * 60) : 0;
            this.logger.log(`Words: ${wordCount}, WPM: ${wpm}`);

            // Step 3: Grade transcription based on mode
            let fullPrompt = '';
            
            if (mode === 'free_speaking') {
                fullPrompt = FREE_SPEAKING_GRADING_PROMPT
                    .replace('{topic}', promptOrTopic || 'Free speaking')
                    .replace('{transcription}', transcription || '')
                    .replace(/{wpm}/g, wpm.toString());
            } else {
                fullPrompt = SPEAKING_GRADING_PROMPT
                    .replace('{referenceText}', referenceText || '')
                    .replace('{prompt}', promptOrTopic || 'Read the text aloud')
                    .replace(/{wpm}/g, wpm.toString())
                    + `\n\nStudent's transcription:\n"${transcription}"`;
            }

            const response = await this.groqService.generateText(fullPrompt);
            const grading = this.groqService.parseJsonResponse<SpeakingGrading>(response);
            grading.transcription = transcription;

            // Ensure wordsPerMinute is populated in the grading result
            if (grading.fluency) {
                if (typeof grading.fluency === 'object') {
                    grading.fluency.wordsPerMinute = wpm;
                } else {
                    grading.fluency = {
                        score: grading.fluency as unknown as number,
                        feedback: '',
                        wordsPerMinute: wpm
                    };
                }
            }

            // Recalculate overallScore server-side
            const pr = grading.pronunciation?.score || 0;
            const fl = grading.fluency?.score || 0;
            
            if (mode === 'free_speaking') {
                const vo = grading.vocabulary?.score || 0;
                const gr = grading.grammar?.score || 0;
                grading.overallScore = Math.round((pr * 0.25 + fl * 0.25 + vo * 0.25 + gr * 0.25) * 10) / 10;
                if (grading.scoringBreakdown) {
                    grading.scoringBreakdown.calculation = `${pr} × 0.25 + ${fl} × 0.25 + ${vo} × 0.25 + ${gr} × 0.25 = ${grading.overallScore}`;
                }
            } else {
                // For Read Aloud, calculate mathematical Accuracy and remove Vocabulary & Grammar (as they read a pre-written text)
                const matchPct = this.calculateAccuracyPercentage(referenceText || '', transcription);
                const accuracyScore = matchPct / 10;
                
                grading.accuracy = {
                    score: accuracyScore,
                    matchPercentage: matchPct,
                    feedback: `Hệ thống so khớp tự động đạt độ chính xác ${matchPct}% (${accuracyScore}/10).`,
                    missedWords: grading.accuracy?.missedWords || [],
                    addedWords: grading.accuracy?.addedWords || []
                };

                // Remove vocabulary and grammar since they are read from reference text
                delete grading.vocabulary;
                delete grading.grammar;

                // Recalculate overallScore based on Pronunciation (40%), Fluency (30%), Accuracy (30%)
                grading.overallScore = Math.round((pr * 0.40 + fl * 0.30 + accuracyScore * 0.30) * 10) / 10;
                grading.scoringBreakdown = {
                    formula: 'pronunciation × 0.40 + fluency × 0.30 + accuracy × 0.30',
                    calculation: `${pr} × 0.40 + ${fl} × 0.30 + ${accuracyScore} × 0.30 = ${grading.overallScore}`,
                    penaltiesApplied: grading.scoringBreakdown?.penaltiesApplied || []
                };
            }

            this.logger.log(`Speaking graded (${mode}): overall=${grading.overallScore}/10 (PR=${pr}, FL=${fl}, AC=${grading.accuracy?.score || 0})`);
            return grading;
        } catch (error) {
            this.logger.error(`Speaking grading failed: ${error.message}`);
            return this.getDefaultSpeakingGrading();
        }
    }

    private getDefaultWritingGrading(): WritingGrading {
        return {
            overallScore: 0,
            grammar: { baseBand: 0, score: 0, errors: [] },
            vocabulary: { baseBand: 0, score: 0, suggestions: [] },
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

    private calculateAccuracyPercentage(reference: string, transcription: string): number {
        if (!reference || !transcription) return 0;
        const refWords = reference.toLowerCase().replace(/[.,!?;:'"()]/g, '').split(/\s+/).filter(Boolean);
        const transWords = transcription.toLowerCase().replace(/[.,!?;:'"()]/g, '').split(/\s+/).filter(Boolean);
        if (refWords.length === 0) return 0;

        let correctCount = 0;
        let tIdx = 0;
        for (let rIdx = 0; rIdx < refWords.length; rIdx++) {
            let found = false;
            for (let search = tIdx; search < Math.min(tIdx + 3, transWords.length); search++) {
                if (refWords[rIdx] === transWords[search]) {
                    correctCount++;
                    tIdx = search + 1;
                    found = true;
                    break;
                }
            }
        }
        return Math.round((correctCount / refWords.length) * 100);
    }
}
