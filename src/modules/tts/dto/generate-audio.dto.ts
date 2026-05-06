import { IsNotEmpty, IsString, IsOptional, IsNumber, Min, Max, MaxLength } from 'class-validator';

export class GenerateAudioDto {
    @IsString()
    @IsNotEmpty({ message: 'Transcript is required' })
    @MaxLength(20000, { message: 'Transcript must be at most 20000 characters' })
    transcript: string;

    @IsOptional()
    @IsNumber()
    @Min(0.5)
    @Max(2.0)
    speed?: number;

    @IsOptional()
    @IsNumber()
    @Min(0.3)
    @Max(3.0)
    pauseBetweenLines?: number;

    @IsOptional()
    voiceMap?: Record<string, string>;
}
