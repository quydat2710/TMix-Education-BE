/**
 * Dictation Service
 * 
 * Manages a bank of sentences for dictation practice.
 * Sentences are stored in-memory, grouped by difficulty level.
 * The service provides random sentence selection and
 * case-insensitive word-by-word comparison for checking answers.
 */

export interface DictationSentence {
    id: string;
    text: string;
    level: 'easy' | 'medium' | 'hard';
    category: string;
}

export interface WordResult {
    word: string;
    correct: boolean;
    expected?: string; // only present when wrong
}

export interface DictationCheckResult {
    isCorrect: boolean;
    score: number;          // 0-100 percent
    totalWords: number;
    correctWords: number;
    wordResults: WordResult[];
    originalSentence?: string; // only revealed when 100% correct
}

// ── Sentence Bank ──
const SENTENCE_BANK: DictationSentence[] = [
    // Easy
    { id: 'e1', text: 'The weather is very nice today.', level: 'easy', category: 'Daily Life' },
    { id: 'e2', text: 'I would like a glass of water please.', level: 'easy', category: 'Restaurant' },
    { id: 'e3', text: 'She goes to school every morning.', level: 'easy', category: 'Education' },
    { id: 'e4', text: 'Can you help me find the library?', level: 'easy', category: 'Direction' },
    { id: 'e5', text: 'My brother likes to play football after class.', level: 'easy', category: 'Daily Life' },
    { id: 'e6', text: 'We had a wonderful time at the park.', level: 'easy', category: 'Daily Life' },
    { id: 'e7', text: 'The cat is sleeping on the sofa.', level: 'easy', category: 'Daily Life' },

    // Medium
    { id: 'm1', text: 'Could you please tell me where the nearest hospital is?', level: 'medium', category: 'Direction' },
    { id: 'm2', text: 'I have been studying English for three years now.', level: 'medium', category: 'Education' },
    { id: 'm3', text: 'The meeting has been postponed until next Wednesday.', level: 'medium', category: 'Business' },
    { id: 'm4', text: 'She decided to take the train instead of driving.', level: 'medium', category: 'Travel' },
    { id: 'm5', text: 'The restaurant was fully booked so we went somewhere else.', level: 'medium', category: 'Restaurant' },
    { id: 'm6', text: 'He finished his homework before watching television.', level: 'medium', category: 'Education' },
    { id: 'm7', text: 'They are planning a surprise birthday party for their mother.', level: 'medium', category: 'Daily Life' },

    // Hard
    { id: 'h1', text: 'Despite the challenging circumstances the team managed to deliver the project on schedule.', level: 'hard', category: 'Business' },
    { id: 'h2', text: 'The government announced a new policy to reduce carbon emissions by twenty percent.', level: 'hard', category: 'News' },
    { id: 'h3', text: 'Scientists have discovered a new species of butterfly in the Amazon rainforest.', level: 'hard', category: 'Science' },
    { id: 'h4', text: 'The architecture of the ancient temple reflects the sophisticated engineering of that era.', level: 'hard', category: 'Culture' },
    { id: 'h5', text: 'International cooperation is essential for addressing global environmental challenges.', level: 'hard', category: 'News' },
    { id: 'h6', text: 'The university offers a comprehensive scholarship program for outstanding students.', level: 'hard', category: 'Education' },
];

export class DictationService {
    private sentences = SENTENCE_BANK;

    /** Get a random sentence by level. Returns id + level + category (NO text!) */
    getRandomSentence(level?: string): { id: string; level: string; category: string } {
        let pool = this.sentences;
        if (level && ['easy', 'medium', 'hard'].includes(level)) {
            pool = this.sentences.filter(s => s.level === level);
        }
        const sentence = pool[Math.floor(Math.random() * pool.length)];
        return { id: sentence.id, level: sentence.level, category: sentence.category };
    }

    /** Get the full sentence by id (for internal TTS generation) */
    getSentenceById(id: string): DictationSentence | undefined {
        return this.sentences.find(s => s.id === id);
    }

    /** 
     * Compare user answer with original sentence.
     * Case-insensitive, word-by-word comparison.
     * Only reveals original sentence if 100% correct.
     */
    checkAnswer(id: string, userAnswer: string): DictationCheckResult | null {
        const sentence = this.getSentenceById(id);
        if (!sentence) return null;

        // Normalize: lowercase, strip punctuation at word boundaries, split
        const normalize = (s: string) =>
            s.toLowerCase().replace(/[.,!?;:'"()\-]/g, '').trim().split(/\s+/).filter(Boolean);

        const expectedWords = normalize(sentence.text);
        const userWords = normalize(userAnswer);

        const wordResults: WordResult[] = [];
        let correctCount = 0;
        const maxLen = Math.max(expectedWords.length, userWords.length);

        for (let i = 0; i < maxLen; i++) {
            const expected = expectedWords[i] || '';
            const actual = userWords[i] || '';

            if (expected === actual) {
                wordResults.push({ word: actual || expected, correct: true });
                correctCount++;
            } else if (!actual) {
                // User missed this word
                wordResults.push({ word: '___', correct: false, expected });
            } else if (!expected) {
                // User added extra word
                wordResults.push({ word: actual, correct: false, expected: '(extra)' });
            } else {
                wordResults.push({ word: actual, correct: false, expected });
            }
        }

        const score = maxLen > 0 ? Math.round((correctCount / expectedWords.length) * 100) : 0;
        const isCorrect = score === 100;

        return {
            isCorrect,
            score,
            totalWords: expectedWords.length,
            correctWords: correctCount,
            wordResults,
            originalSentence: isCorrect ? sentence.text : undefined,
        };
    }
}
