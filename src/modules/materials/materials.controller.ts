import {
  Controller, Get, Post, Delete, Param, Body, Query,
  UploadedFile, UseInterceptors, Res, NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MaterialsService } from './materials.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { MaterialCategory } from './entities/material.entity';
import { UserInfo, Public } from '@/decorator/customize.decorator';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

@Controller('materials')
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateMaterialDto,
    @UserInfo() user: any,
  ) {
    return this.materialsService.create(dto, file, user.id);
  }

  @Get()
  async findByClass(
    @Query('classId') classId: string,
    @Query('category') category?: MaterialCategory,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    return this.materialsService.findByClass(classId, category, +page || 1, +limit || 20);
  }

  /**
   * Serve uploaded files — public so iframes/direct links work without JWT
   */
  @Public()
  @Get('files/:classId/:filename')
  serveFile(
    @Param('classId') classId: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    const filePath = path.join(process.cwd(), 'uploads', 'materials', classId, filename);
    if (!fs.existsSync(filePath)) throw new NotFoundException('File not found');

    const ext = path.extname(filename).toLowerCase();
    const mime: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
      '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
      '.mp4': 'video/mp4',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };

    res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(filePath).pipe(res);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.materialsService.findById(id);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @UserInfo() user: any) {
    return this.materialsService.remove(id, user.id);
  }
}
