import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MaterialEntity, MaterialCategory, MaterialFileType } from './entities/material.entity';
import { CreateMaterialDto } from './dto/create-material.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { ClassEntity } from '../classes/entities/class.entity';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MaterialsService {
  private readonly logger = new Logger(MaterialsService.name);
  private readonly uploadDir = path.join(process.cwd(), 'uploads', 'materials');

  constructor(
    @InjectRepository(MaterialEntity)
    private materialRepo: Repository<MaterialEntity>,
    @InjectRepository(ClassEntity)
    private classRepo: Repository<ClassEntity>,
    private readonly notificationsService: NotificationsService,
  ) {
    // Ensure upload directory exists on startup
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  /**
   * Upload a material file to local storage and create record
   */
  async create(
    dto: CreateMaterialDto,
    file: Express.Multer.File,
    uploadedById: string,
  ): Promise<MaterialEntity> {
    // Create class subdirectory
    const classDir = path.join(this.uploadDir, dto.classId);
    if (!fs.existsSync(classDir)) {
      fs.mkdirSync(classDir, { recursive: true });
    }

    // Save file to disk
    const safeFilename = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const filePath = path.join(classDir, safeFilename);
    fs.writeFileSync(filePath, file.buffer);

    // Store URL path for serving via controller endpoint
    const fileUrl = `/materials/files/${dto.classId}/${safeFilename}`;
    const fileType = this.detectFileType(file.mimetype);

    const material = this.materialRepo.create({
      title: dto.title,
      description: dto.description,
      category: dto.category || MaterialCategory.OTHER,
      fileUrl,
      filePublicId: safeFilename,
      fileType,
      originalFileName: file.originalname,
      fileSize: file.size,
      classId: dto.classId,
      uploadedById,
    });

    const saved = await this.materialRepo.save(material);

    // Notify students
    try {
      const classEntity = await this.classRepo.findOne({ where: { id: dto.classId } });
      await this.notificationsService.sendToClass(dto.classId, {
        type: NotificationType.GENERAL,
        title: '📚 Tài liệu mới',
        message: `Giáo viên vừa upload tài liệu "${dto.title}" cho lớp ${classEntity?.name || ''}.`,
        link: '/student/materials',
      });
    } catch (e) {
      this.logger.warn(`Failed to send notification: ${e.message}`);
    }

    this.logger.log(`Material "${dto.title}" saved for class ${dto.classId}`);
    return saved;
  }

  /**
   * Get materials by class with optional filters
   */
  async findByClass(classId: string, category?: MaterialCategory, page = 1, limit = 20) {
    const qb = this.materialRepo
      .createQueryBuilder('material')
      .where('material.classId = :classId', { classId })
      .orderBy('material.createdAt', 'DESC');

    if (category) {
      qb.andWhere('material.category = :category', { category });
    }

    const totalItems = await qb.getCount();
    const result = await qb.skip((page - 1) * limit).take(limit).getMany();

    return {
      meta: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
      result,
    };
  }

  /**
   * Get a single material by ID
   */
  async findById(id: string): Promise<MaterialEntity> {
    const material = await this.materialRepo.findOne({ where: { id }, relations: ['class'] });
    if (!material) throw new NotFoundException('Material not found');
    return material;
  }

  /**
   * Delete a material and its file
   */
  async remove(id: string, userId: string): Promise<boolean> {
    const material = await this.materialRepo.findOne({ where: { id } });
    if (!material) throw new NotFoundException('Material not found');

    // Delete local file
    if (material.fileUrl?.startsWith('/materials/files/')) {
      const relativePath = material.fileUrl.replace('/materials/files/', '');
      const filePath = path.join(this.uploadDir, ...relativePath.split('/'));
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (e) {
        this.logger.warn(`Failed to delete file: ${e.message}`);
      }
    }

    await this.materialRepo.remove(material);
    this.logger.log(`Material "${material.title}" deleted by user ${userId}`);
    return true;
  }

  private detectFileType(mimetype: string): MaterialFileType {
    if (mimetype === 'application/pdf') return MaterialFileType.PDF;
    if (mimetype.startsWith('image/')) return MaterialFileType.IMAGE;
    if (mimetype.startsWith('audio/')) return MaterialFileType.AUDIO;
    if (mimetype.startsWith('video/')) return MaterialFileType.VIDEO;
    if (mimetype.includes('word') || mimetype.includes('document') || mimetype.includes('spreadsheet')) {
      return MaterialFileType.DOCUMENT;
    }
    return MaterialFileType.OTHER;
  }
}
