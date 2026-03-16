import { IsString, IsNumber, IsOptional, IsArray, ValidateNested, IsEnum, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

class CreateMCQuestionDto {
    @IsString()
    question: string;

    @IsArray()
    @IsString({ each: true })
    options: string[]; // 4 options

    @IsNumber()
    @Min(0)
    @Max(3)
    correctAnswer: number;

    @IsOptional()
    @IsString()
    explanation?: string;

    @IsNumber()
    @Min(1)
    points: number;

    @IsOptional()
    @IsString()
    audioUrl?: string; // Per-question audio (listening)
}

export class CreateTestDto {
    @IsString()
    title: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsString()
    skillType?: string; // 'reading' | 'listening' | 'speaking' | 'writing' (default: reading)

    @IsString()
    classId: string;

    @IsNumber()
    @Min(1)
    duration: number; // minutes

    @IsNumber()
    @Min(0)
    @Max(100)
    passingScore: number; // percentage

    @IsArray()
    questions: any[]; // MCQuestion[] | WritingQuestion[] | SpeakingQuestion[]

    @IsOptional()
    @IsString()
    passage?: string; // Reading passage or Writing prompt

    @IsOptional()
    @IsString()
    speakingPrompt?: string; // Speaking test general prompt

    @IsOptional()
    @IsString()
    audioUrl?: string; // Main audio URL (listening)

    @IsOptional()
    @IsEnum(['draft', 'published'])
    status?: string;
}
