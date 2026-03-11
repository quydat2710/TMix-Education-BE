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
}

export class CreateTestDto {
    @IsString()
    title: string;

    @IsOptional()
    @IsString()
    description?: string;

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
    @ValidateNested({ each: true })
    @Type(() => CreateMCQuestionDto)
    questions: CreateMCQuestionDto[];

    @IsOptional()
    @IsEnum(['draft', 'published'])
    status?: string;
}
