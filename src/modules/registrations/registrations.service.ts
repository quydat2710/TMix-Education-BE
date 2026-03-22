import { Injectable } from '@nestjs/common';
import { CreateRegistrationDto } from './dto/create-registration.dto';
import { UpdateRegistrationDto } from './dto/update-registration.dto';
import { RegistrationRepository } from './registration.repository';
import { IPaginationOptions } from '@/utils/types/pagination-options';
import { PaginationResponseDto } from '@/utils/types/pagination-response.dto';
import { Registration } from './registration.domain';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { Logger } from '@nestjs/common';

@Injectable()
export class RegistrationsService {
  private readonly logger = new Logger(RegistrationsService.name);

  constructor(
    private registrationRepository: RegistrationRepository,
    private notificationsService: NotificationsService,
  ) { }

  async create(data: CreateRegistrationDto) {
    const result = await this.registrationRepository.create(data);

    // Notify admins about new registration
    try {
      await this.notificationsService.sendToRole('admin', {
        type: NotificationType.NEW_REGISTRATION,
        title: 'Đăng ký mới',
        message: `Có đăng ký mới từ ${data.name || 'học sinh'}. Vui lòng kiểm tra!`,
        link: '/admin/registrations',
      });
    } catch (e) {
      this.logger.warn(`Failed to send registration notification: ${e.message}`);
    }

    return result;
  }

  async findAll({
    filterOptions,
    sortOptions,
    paginationOptions,
  }: {
    filterOptions?: any;
    sortOptions?: any;
    paginationOptions?: IPaginationOptions;
  }): Promise<PaginationResponseDto<Registration>> {
    return this.registrationRepository.findManyWithPagination({
      filterOptions,
      sortOptions,
      paginationOptions,
    });
  }

  async findOne(id: string) {
    return this.registrationRepository.findById(id);
  }

  async update(id: string, updateRegistrationDto: UpdateRegistrationDto) {
    return this.registrationRepository.update(id, updateRegistrationDto);
  }

  async remove(id: string) {
    return this.registrationRepository.remove(id);
  }
}
