import { IsNotEmpty, IsString, IsOptional, IsNumber, Min, Max, MaxLength } from 'class-validator';

export class SynthesizeDto {
    @IsString()
    @IsNotEmpty({ message: 'Text is required' })
    @MaxLength(10000, { message: 'Text must be at most 10000 characters' })
    text: string;

    @IsOptional()
    @IsString()
    voice?: string;

    @IsOptional()
    @IsNumber()
    @Min(0.5)
    @Max(2.0)
    speed?: number;
}
