import { IsArray, IsNumber } from 'class-validator';

export class SubmitTestDto {
    @IsArray()
    @IsNumber({}, { each: true })
    answers: number[]; // Array of selected option indices (0-3)
}
