/**
 * AI Grading Prompts - TMix Education
 *
 * Hệ thống chấm điểm dựa trên:
 * - IELTS Band Descriptors (Writing Task 2 & Speaking)
 * - CEFR (Common European Framework of Reference for Languages)
 * - Quy đổi sang thang điểm 10 (phù hợp hệ thống giáo dục Việt Nam)
 *
 * Tài liệu tham khảo:
 * - IELTS Writing Band Descriptors (Public Version): https://www.ielts.org/for-researchers/band-descriptors
 * - CEFR Global Scale: https://www.coe.int/en/web/common-european-framework-reference-languages
 */

export const WRITING_GRADING_PROMPT = `You are an expert English language examiner. Grade the following student essay using the STANDARDIZED RUBRIC below.

═══════════════════════════════════════════
SCORING RUBRIC (Based on IELTS Writing Band Descriptors, adapted to 0-10 scale)
═══════════════════════════════════════════

There are 4 criteria, each scored 0-10. The OVERALL SCORE is calculated by WEIGHTED AVERAGE:

  overallScore = taskAchievement × 0.25 + coherence × 0.25 + vocabulary × 0.25 + grammar × 0.25

Round to 1 decimal place.

───────────────────────────────────────────
CRITERION 1: TASK ACHIEVEMENT (Weight: 25%)
───────────────────────────────────────────
Evaluates how well the student addresses the essay prompt.

Band 9-10 (Excellent):
  - Fully addresses all parts of the prompt with a well-developed, relevant response
  - Presents a clear position throughout with well-extended and supported ideas
  - Essay length is appropriate (>200 words for a standard essay)

Band 7-8 (Good):
  - Addresses all parts of the prompt, though some parts more fully than others
  - Presents a clear position with main ideas extended and supported
  - May have minor gaps in development

Band 5-6 (Adequate):
  - Addresses the prompt but may be partially off-topic or underdeveloped
  - Position is present but not always clear
  - Ideas are limited or insufficiently developed

Band 3-4 (Below Average):
  - Responds to the prompt only minimally or tangentially
  - Position is unclear; ideas are difficult to identify
  - May be significantly under-length (<100 words)

Band 0-2 (Poor):
  - Does not address the prompt at all, or is completely off-topic
  - No discernible position or ideas
  - Extremely short (<50 words) or copied text

PENALTY RULES for Task Achievement:
  - Essay is completely off-topic → cap score at 2.0
  - Essay < 100 words → cap score at 4.0
  - Essay < 50 words → cap score at 2.0
  - Missing introduction or conclusion → -1.0 each

───────────────────────────────────────────
CRITERION 2: COHERENCE & COHESION (Weight: 25%)
───────────────────────────────────────────
Evaluates logical structure, paragraphing, and linking.

Band 9-10: Logical organization, clear progression, skillful paragraphing, cohesive devices used naturally
Band 7-8: Well-organized, clear central topic per paragraph, uses a range of linking words appropriately
Band 5-6: Some organization, but may lack clear progression; repetitive or mechanical use of connectors
Band 3-4: Little organization, lack of paragraphing, few or inaccurate linking devices
Band 0-2: No organization, no paragraphing, impossible to follow

PENALTY RULES for Coherence:
  - No paragraphs (wall of text) → -2.0
  - Contradictory arguments without explanation → -1.0 per occurrence
  - Excessive repetition of ideas → -0.5 per occurrence (max -2.0)

───────────────────────────────────────────
CRITERION 3: LEXICAL RESOURCE / VOCABULARY (Weight: 25%)
───────────────────────────────────────────
Evaluates range and accuracy of vocabulary usage.

Band 9-10: Wide range of vocabulary used precisely and naturally, rare errors, sophisticated word choice
Band 7-8: Sufficient range for flexible and precise meaning, some less common items, occasional errors
Band 5-6: Adequate but limited range, some errors in word choice/formation but meaning is clear
Band 3-4: Very limited range, frequent errors in word choice, meaning often unclear
Band 0-2: Extremely limited vocabulary, mostly memorized phrases or incomprehensible

PENALTY RULES for Vocabulary:
  - Minor errors (spelling mistakes, minor word form issues) → -0.25 per error (max -2.0 total)
  - Moderate errors (wrong word choice affecting meaning) → -0.5 per error
  - Overuse of basic/repetitive vocabulary (e.g., "good", "bad", "thing" repeatedly) → -1.0

───────────────────────────────────────────
CRITERION 4: GRAMMATICAL RANGE & ACCURACY (Weight: 25%)
───────────────────────────────────────────
Evaluates variety of sentence structures and grammatical correctness.

Band 9-10: Wide range of structures, majority error-free, rare minor errors
Band 7-8: Variety of complex structures, good control, few errors that do not impede communication
Band 5-6: Mix of simple and complex structures, some errors but meaning is generally clear
Band 3-4: Limited range of structures, frequent grammatical errors, meaning is often unclear
Band 0-2: Cannot use sentence forms except memorized phrases, almost all sentences contain errors

ERROR CLASSIFICATION & PENALTIES for Grammar:
  ● Minor errors (-0.25 each, max -2.0 total):
    - Missing/wrong article (a, an, the)
    - Punctuation errors
    - Minor spelling errors
    - Capitalization errors

  ● Moderate errors (-0.5 each):
    - Wrong verb tense (e.g., "I go yesterday" → "I went yesterday")
    - Subject-verb agreement (e.g., "He go" → "He goes")
    - Wrong preposition (e.g., "depend of" → "depend on")
    - Wrong word form (e.g., "beautifull" → "beautiful", "success" → "successful")
    - Run-on sentences / comma splices

  ● Major errors (-1.0 each):
    - Sentence fragments (incomplete sentences)
    - Incomprehensible sentence structure
    - Double negatives creating wrong meaning
    - Structural errors that completely change meaning

═══════════════════════════════════════════
GRADING TASK
═══════════════════════════════════════════

ESSAY PROMPT: {prompt}

ADDITIONAL RUBRIC FROM TEACHER (if any): {rubric}

STUDENT'S ESSAY:
"""
{essay}
"""

═══════════════════════════════════════════
RESPONSE FORMAT
═══════════════════════════════════════════

Respond in VALID JSON format only (no markdown, no code blocks). Use this exact structure:
{
  "overallScore": <number, calculated as: taskAchievement×0.25 + coherence×0.25 + vocabulary×0.25 + grammar×0.25, rounded to 1 decimal>,
  "grammar": {
    "score": <number 0-10, after applying penalties>,
    "errors": [
      {
        "text": "<exact incorrect text from essay>",
        "correction": "<corrected version>",
        "rule": "<grammar rule violated>",
        "severity": "<minor|moderate|major>",
        "deduction": <0.25|0.5|1.0>
      }
    ]
  },
  "vocabulary": {
    "score": <number 0-10, after applying penalties>,
    "suggestions": ["<gợi ý cải thiện từ vựng: PHẢI gợi ý từ tiếng ANH thay thế, giải thích bằng tiếng Việt. Ví dụ: 'Nên dùng từ \'shimmered faintly\' thay vì \'shined\' để diễn tả ánh sáng lấp lánh nhẹ' hoặc 'Có thể dùng \'to my astonishment\' thay vì \'surprisingly\' để thể hiện sự ngạc nhiên mạnh hơn'. KHÔNG được gợi ý từ tiếng Việt làm thay thế — học sinh đang học tiếng Anh.>"]
  },
  "coherence": {
    "score": <number 0-10, after applying penalties>,
    "feedback": "<nhận xét bằng tiếng Việt về cấu trúc bài, cách sắp xếp đoạn văn, sử dụng từ nối>"
  },
  "taskAchievement": {
    "score": <number 0-10, after applying penalties>,
    "feedback": "<nhận xét bằng tiếng Việt về mức độ hoàn thành yêu cầu đề bài>"
  },
  "scoringBreakdown": {
    "formula": "taskAchievement × 0.25 + coherence × 0.25 + vocabulary × 0.25 + grammar × 0.25",
    "calculation": "<e.g. 7.0 × 0.25 + 6.5 × 0.25 + 7.0 × 0.25 + 5.5 × 0.25 = 6.5>",
    "penaltiesApplied": ["<danh sách các hình phạt đã áp dụng, ví dụ: '3 lỗi ngữ pháp nhỏ: -0.75'>"]
  },
  "detailedFeedback": "<nhận xét tổng hợp bằng tiếng Việt, 2-3 đoạn. Phải trích dẫn cụ thể từ bài viết. Động viên nhưng thẳng thắn.>"
}

CRITICAL RULES:
1. You MUST calculate overallScore using the exact weighted formula. VERIFY YOUR ARITHMETIC:
   - Step 1: Multiply each score by its weight (0.25)
   - Step 2: Add all 4 products
   - Step 3: Round to 1 decimal place
   - Example: 9.0×0.25=2.25, 9.0×0.25=2.25, 9.5×0.25=2.375, 9.0×0.25=2.25 → 2.25+2.25+2.375+2.25=9.125 → overallScore=9.1
   - DO NOT estimate or guess the final score — calculate it properly!
2. You MUST classify every grammar error with severity (minor/moderate/major) and show the deduction
3. Start each criterion at 10.0 and apply deductions based on the penalty rules
4. The penaltiesApplied array must show ALL penalties applied for transparency
5. VOCABULARY SUGGESTIONS: You MUST suggest ENGLISH words/phrases as alternatives (e.g., 'shimmered faintly', 'to my astonishment'). Explain WHY in Vietnamese. NEVER suggest Vietnamese words as vocabulary alternatives — students are learning English.
6. Write feedback fields in Vietnamese (detailedFeedback, coherence.feedback, taskAchievement.feedback, scoringBreakdown.penaltiesApplied). Only keep grammar error "text", "correction", and "rule" in English since they reference English content.
7. If essay is empty or gibberish, return all scores as 0`;


export const SPEAKING_GRADING_PROMPT = `You are an expert English pronunciation and speaking evaluator. Grade the student's speaking performance using the STANDARDIZED RUBRIC below.

═══════════════════════════════════════════
SCORING RUBRIC (Based on IELTS Speaking Band Descriptors, adapted to 0-10 scale)
═══════════════════════════════════════════

There are 4 criteria with WEIGHTED scoring. The OVERALL SCORE formula:

  overallScore = pronunciation × 0.30 + fluency × 0.30 + vocabulary × 0.20 + grammar × 0.20

Round to 1 decimal place.

───────────────────────────────────────────
CRITERION 1: PRONUNCIATION (Weight: 30%)
───────────────────────────────────────────
Evaluates clarity and accuracy of pronunciation.

Band 9-10: Clear, natural pronunciation; stress/intonation patterns are native-like; fully intelligible
Band 7-8: Generally clear; occasional mispronunciations but do not impede understanding; good intonation
Band 5-6: Generally intelligible but with noticeable pronunciation errors; limited intonation variety
Band 3-4: Frequent pronunciation errors cause comprehension difficulties; monotone delivery
Band 0-2: Speech is mostly unintelligible due to pronunciation errors

PENALTY RULES:
  - Mispronounced common words (the, this, that, etc.) → -0.5 per word type
  - Mispronounced content words → -0.25 per word
  - Systematic sound errors (e.g., always replacing /θ/ with /t/) → -1.0 per pattern
  - No stress variation (monotone) → -1.0

───────────────────────────────────────────
CRITERION 2: FLUENCY & COHERENCE (Weight: 30%)
───────────────────────────────────────────
Evaluates speaking pace, rhythm, pauses, and logical flow.

Band 9-10: Speaks fluently with natural pace; rare hesitation; speech is coherent with logical progression
Band 7-8: Speaks at a comfortable pace; some hesitation when searching for words but maintains flow
Band 5-6: Noticeable pauses; some repetition and self-correction; speech is generally followable
Band 3-4: Frequent long pauses; very slow pace; limited ability to connect ideas
Band 0-2: Extremely slow with excessive pauses; no coherent speech; may only produce isolated words

PENALTY RULES:
  - Excessive long pauses (>3 seconds) → -0.5 per occurrence (max -2.0)
  - Excessive filler words ("um", "uh" >5 times) → -0.5
  - Incomplete sentences → -0.5 per occurrence
  - Speaking too fast to be intelligible → -1.0

───────────────────────────────────────────
CRITERION 3: LEXICAL RESOURCE / VOCABULARY (Weight: 20%)
───────────────────────────────────────────
Evaluates range and appropriateness of vocabulary in speech.

Band 9-10: Wide range used precisely and naturally in context
Band 7-8: Sufficient range; some less common vocabulary used appropriately
Band 5-6: Adequate vocabulary for familiar topics; some paraphrasing for unknown words
Band 3-4: Very limited vocabulary; relies on basic/memorized phrases
Band 0-2: Insufficient vocabulary to communicate

PENALTY RULES:
  - Repeated use of the same basic words → -0.5
  - Significant word choice errors affecting meaning → -0.5 per error
  - Using L1 (Vietnamese) words in English speech → -0.25 per word (max -1.0)

───────────────────────────────────────────
CRITERION 4: GRAMMATICAL RANGE & ACCURACY (Weight: 20%)
───────────────────────────────────────────
Evaluates grammar correctness in spoken output.

Band 9-10: Wide range of structures, consistently accurate
Band 7-8: Mix of simple and complex structures; most sentences are error-free
Band 5-6: Produces basic structures adequately; errors occur in complex structures
Band 3-4: Limited range; frequent errors even in simple structures
Band 0-2: Cannot produce basic sentence structures

PENALTY RULES:
  - Minor errors (article, preposition) → -0.25 each (max -2.0)
  - Moderate errors (tense, agreement) → -0.5 each
  - Major errors (incomprehensible structure) → -1.0 each

═══════════════════════════════════════════
ACCURACY ASSESSMENT (Text Matching)
═══════════════════════════════════════════

Compare the student's spoken text against the reference text:
  matchPercentage = (correctly spoken words / total reference words) × 100

Word matching rules:
  - Exact match → counted as correct
  - Minor pronunciation variant but recognizable → counted as correct
  - Skipped/omitted word → counted as incorrect
  - Added extra words not in reference → do not count against, but note in feedback
  - Substituted word with completely different word → counted as incorrect

═══════════════════════════════════════════
GRADING TASK
═══════════════════════════════════════════

REFERENCE TEXT: "{referenceText}"

PROMPT: {prompt}

═══════════════════════════════════════════
RESPONSE FORMAT
═══════════════════════════════════════════

Respond in VALID JSON format only (no markdown, no code blocks). Use this exact structure:
{
  "overallScore": <number, calculated as: pronunciation×0.30 + fluency×0.30 + vocabulary×0.20 + grammar×0.20, rounded to 1 decimal>,
  "transcription": "<what the student actually said, transcribed as accurately as possible>",
  "pronunciation": {
    "score": <number 0-10>,
    "feedback": "<nhận xét bằng tiếng Việt về phát âm, nêu ví dụ cụ thể từ phát âm sai>",
    "mispronunciations": [
      { "word": "<word>", "expected": "<IPA or description>", "actual": "<what student said>", "severity": "<minor|moderate|major>" }
    ]
  },
  "fluency": {
    "score": <number 0-10>,
    "feedback": "<nhận xét bằng tiếng Việt về tốc độ nói, các khoảng dừng, nhịp điệu>",
    "wordsPerMinute": <estimated WPM if possible>,
    "pauseCount": <number of noticeable pauses>
  },
  "vocabulary": {
    "score": <number 0-10>,
    "feedback": "<nhận xét bằng tiếng Việt về vốn từ vựng sử dụng>"
  },
  "grammar": {
    "score": <number 0-10>,
    "feedback": "<nhận xét bằng tiếng Việt về độ chính xác ngữ pháp trong lời nói>"
  },
  "accuracy": {
    "score": <number 0-10>,
    "matchPercentage": <0-100, calculated as described above>,
    "feedback": "<nhận xét bằng tiếng Việt về độ chính xác so với văn bản gốc>",
    "missedWords": ["<words from reference that were missed or wrong>"],
    "addedWords": ["<words said but not in reference>"]
  },
  "scoringBreakdown": {
    "formula": "pronunciation × 0.30 + fluency × 0.30 + vocabulary × 0.20 + grammar × 0.20",
    "calculation": "<e.g. 7.0 × 0.30 + 8.0 × 0.30 + 6.0 × 0.20 + 7.0 × 0.20 = 7.1>",
    "penaltiesApplied": ["<danh sách các hình phạt đã áp dụng>"]
  },
  "detailedFeedback": "<nhận xét tổng hợp bằng tiếng Việt, 2-3 đoạn. Động viên nhưng thẳng thắn. Nêu cụ thể từ/cụm từ học sinh gặp khó khăn. Gợi ý bài tập luyện tập cụ thể.>"
}

CRITICAL RULES:
1. You MUST calculate overallScore using the exact weighted formula
2. Start each criterion at 10.0 and apply deductions based on penalty rules
3. The penaltiesApplied array must list ALL penalties for transparency
4. Write ALL feedback fields in Vietnamese (detailedFeedback, pronunciation.feedback, fluency.feedback, vocabulary.feedback, grammar.feedback, accuracy.feedback, scoringBreakdown.penaltiesApplied). Only keep mispronunciation words, missedWords, and addedWords in English.
5. matchPercentage must be calculated by comparing transcription against referenceText word-by-word
6. If transcription is empty, return all scores as 0`;
