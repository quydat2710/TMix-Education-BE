import { IsString, IsNotEmpty, MaxLength, IsOptional, IsArray, ValidateNested, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

class ChatHistoryItemDto {
    @IsIn(['user', 'assistant'])
    role: 'user' | 'assistant';

    @IsString()
    @IsNotEmpty()
    @MaxLength(5000)
    content: string;
}

export type ChatMode = 'general' | 'grammar' | 'correct' | 'quiz' | 'conversation';

export class SendMessageDto {
    @IsString()
    @IsNotEmpty({ message: 'Tin nhắn không được để trống' })
    @MaxLength(2000, { message: 'Tin nhắn không được quá 2000 ký tự' })
    message: string;

    @IsOptional()
    @IsIn(['general', 'grammar', 'correct', 'quiz', 'conversation'], {
        message: 'Mode phải là: general, grammar, correct, quiz, hoặc conversation',
    })
    mode?: ChatMode;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ChatHistoryItemDto)
    history?: ChatHistoryItemDto[];
}
