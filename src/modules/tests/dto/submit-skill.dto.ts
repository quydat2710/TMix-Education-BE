import { IsString, IsOptional } from 'class-validator';

/**
 * DTO for submitting a writing test
 */
export class SubmitWritingDto {
    @IsString()
    writingResponse: string; // Student's essay text
}

/**
 * DTO for submitting a speaking test (metadata - audio file sent via multipart)
 */
export class SubmitSpeakingDto {
    @IsOptional()
    @IsString()
    questionId?: string; // Which question this is for
}
