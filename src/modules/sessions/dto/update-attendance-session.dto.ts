import { IsString, IsEnum, IsOptional, MaxLength } from 'class-validator';

const VALID_STATUSES = ['present', 'absent', 'late'] as const;

export class UpdateAttendanceSessionDto {
    @IsEnum(VALID_STATUSES, { message: 'Status must be present, absent, or late' })
    status: string;

    @IsString()
    studentId: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    note: string;
}