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

export class SendMessageDto {
    @IsString()
    @IsNotEmpty({ message: 'Tin nhắn không được để trống' })
    @MaxLength(2000, { message: 'Tin nhắn không được quá 2000 ký tự' })
    message: string;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ChatHistoryItemDto)
    history?: ChatHistoryItemDto[];
}
