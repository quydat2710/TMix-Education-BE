import { IsEnum, IsOptional, IsString } from 'class-validator';
import { MaterialCategory } from '../entities/material.entity';

export class CreateMaterialDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(MaterialCategory)
  category?: MaterialCategory;

  @IsString()
  classId: string;
}
