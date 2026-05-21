import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { I18nTranslations } from '@/generated/i18n.generated';
import { InjectRepository } from '@nestjs/typeorm';
import { UserEntity } from 'modules/users/entities/user.entity';
import { ParentEntity } from 'modules/parents/entities/parent.entity';
import { StudentEntity } from 'modules/students/entities/student.entity';
import { TeacherEntity } from 'modules/teachers/entities/teacher.entity';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { RoleEnum } from 'modules/roles/roles.enum';
import { UserMapper } from './user.mapper';
import { User } from './user.domain';
import { FilesService } from 'modules/files/files.service';

/** Union type for all role-specific entities */
type RoleEntity = UserEntity | ParentEntity | StudentEntity | TeacherEntity;

@Injectable()
export class UsersService {
  constructor(
    private readonly i18nService: I18nService<I18nTranslations>,
    private readonly dataSource: DataSource,
    @InjectRepository(UserEntity) private userRepository: Repository<UserEntity>,
    @InjectRepository(ParentEntity) private parentRepository: Repository<ParentEntity>,
    @InjectRepository(StudentEntity) private studentRepository: Repository<StudentEntity>,
    @InjectRepository(TeacherEntity) private teacherRepository: Repository<TeacherEntity>,
    private readonly filesService: FilesService
  ) { }

  /**
   * Get the repository for a given role ID.
   * Centralizes the role→repository mapping used across all user operations.
   */
  private getRepositoryByRole(roleId: number): Repository<RoleEntity> {
    const map: Record<number, Repository<RoleEntity>> = {
      [RoleEnum.admin]: this.userRepository,
      [RoleEnum.teacher]: this.teacherRepository,
      [RoleEnum.parent]: this.parentRepository,
      [RoleEnum.student]: this.studentRepository,
    };
    return map[roleId];
  }

  async isEmailExist(email: string): Promise<boolean> {
    const [user, teacher, parent, student] = await Promise.all([
      this.userRepository.createQueryBuilder('user')
        .where('user.email = :email', { email })
        .getExists(),
      this.teacherRepository.createQueryBuilder('teacher')
        .where('teacher.email = :email', { email })
        .getExists(),
      this.parentRepository.createQueryBuilder('parent')
        .where('parent.email = :email', { email })
        .getExists(),
      this.studentRepository.createQueryBuilder('student')
        .where('student.email = :email', { email })
        .getExists()
    ])

    return user || teacher || parent || student;
  }

  async findByEmail(email: string): Promise<UserEntity | ParentEntity | StudentEntity | TeacherEntity | null> {
    const [user, parent, student, teacher] = await Promise.all([
      this.userRepository.findOne({ where: { email }, relations: ['role'] }),
      this.parentRepository.findOne({ where: { email }, relations: ['role'] }),
      this.studentRepository.findOne({ where: { email }, relations: ['role'] }),
      this.teacherRepository.findOne({ where: { email }, relations: ['role'] }),
    ]);

    return user || parent || student || teacher || null;
  }

  isValidPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  async createAdmin(createUserDto: CreateUserDto): Promise<User> {
    await this.isEmailExist(createUserDto.email);
    const newEntity = await this.userRepository.save(
      this.userRepository.create({ ...createUserDto, role: { id: RoleEnum.admin } } as UserEntity)
    );
    return UserMapper.toDomain(newEntity);
  }

  async updateUserToken(user: { id: string; role?: { id: number } }, refreshToken: string): Promise<void> {
    const roleId = user.role?.id;
    const repository = this.getRepositoryByRole(roleId);
    if (repository) {
      await repository.update({ id: user.id }, { refreshToken } as any);
    }
  }

  async findUserByToken(role: { id: number }, refreshToken: string): Promise<RoleEntity | null> {
    const roleId = role?.id;
    const repository = this.getRepositoryByRole(roleId);
    return repository ? await repository.findOne({ where: { refreshToken } as any, relations: ['role'] }) : null;
  }

  async uploadAvatar(imageUrl: string, publicId: string, user: User): Promise<void> {
    const roleId = user?.role?.id;
    const repository = this.getRepositoryByRole(roleId);
    if (!repository) return;

    const entity = await repository.findOne({ where: { id: user.id } as any });
    if (!entity) {
      throw new NotFoundException(this.i18nService.t('user.FAIL.NOT_FOUND'));
    }

    if (entity && (entity as any).publicId && (entity as any).avatar) {
      await this.filesService.deleteFile((entity as any).publicId);
      (entity as any).avatar = null;
      (entity as any).publicId = null;
    }

    if (roleId !== RoleEnum.admin && (entity as any).avatar && (entity as any).publicId) {
      throw new BadRequestException('Avatar already exists. Please delete the current avatar before uploading a new one.');
    }

    (entity as any).avatar = imageUrl;
    (entity as any).publicId = publicId;
    await repository.save(entity);
  }

  async updateProfile(userId: User['id'], updateData: { name?: string; phone?: string; gender?: string; address?: string; dayOfBirth?: Date }) {
    const user = await this.findUserById(userId);
    if (!user) {
      throw new NotFoundException(this.i18nService.t('user.FAIL.NOT_FOUND'));
    }

    const roleId = user.role?.id;
    const repository = this.getRepositoryByRole(roleId);
    if (!repository) {
      throw new BadRequestException('Invalid role');
    }

    // Update only allowed fields
    const allowedFields: Partial<Pick<User, 'name' | 'phone' | 'gender' | 'address' | 'dayOfBirth'>> = {};
    if (updateData.name !== undefined) allowedFields.name = updateData.name;
    if (updateData.phone !== undefined) allowedFields.phone = updateData.phone;
    if (updateData.gender !== undefined) allowedFields.gender = updateData.gender;
    if (updateData.address !== undefined) allowedFields.address = updateData.address;
    if (updateData.dayOfBirth !== undefined) allowedFields.dayOfBirth = updateData.dayOfBirth;

    if (Object.keys(allowedFields).length === 0) {
      throw new BadRequestException('No valid fields to update');
    }

    await repository.update({ id: userId } as any, allowedFields as any);

    return await repository.findOne({ where: { id: userId } as any, relations: ['role'] });
  }

  async findUserById(userId: User['id']) {
    const [user, parent, student, teacher] = await Promise.all([
      this.userRepository.findOne({ where: { id: userId }, relations: ['role'] }),
      this.parentRepository.findOne({ where: { id: userId }, relations: ['role'] }),
      this.studentRepository.findOne({ where: { id: userId }, relations: ['role'] }),
      this.teacherRepository.findOne({ where: { id: userId }, relations: ['role'] }),
    ]);

    return user || parent || student || teacher || null;
  }

  async assignRole(userId: string, roleId: RoleEnum): Promise<RoleEntity> {
    const user = await this.findUserById(userId);

    if (!user) {
      throw new NotFoundException(this.i18nService.t('user.FAIL.NOT_FOUND'));
    }

    const currentRoleId = user.role?.id;
    const repository = this.getRepositoryByRole(currentRoleId) || this.userRepository;

    if (!repository) {
      throw new BadRequestException('Invalid current role');
    }

    await repository.update(
      { id: userId } as any,
      { role: { id: roleId } } as any
    );

    return await repository.findOne({
      where: { id: userId } as any,
      relations: ['role']
    });
  }

  async resetPassword(email: string, newPassword: string) {
    const user = await this.findByEmail(email);
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    const roleId = user.role?.id;
    const repository = this.getRepositoryByRole(roleId) || this.userRepository;
    user.password = newPassword;
    return await repository.save(user);
  }

  async resetPasswordById(userId: string, newPassword: string) {
    const user = await this.findUserById(userId);
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    const roleId = user.role?.id;
    const repository = this.getRepositoryByRole(roleId) || this.userRepository;
    user.password = newPassword;
    await repository.save(user);
    return { message: 'Đặt lại mật khẩu thành công' };
  }

  async setVerifiedEmail(id: User['id'], user: UserEntity) {
    const currentRoleId = user.role?.id;
    const repository = this.getRepositoryByRole(currentRoleId) || this.userRepository;
    return await repository.update({ id: user.id } as any, { isEmailVerified: true } as any);
  }
}
