import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { StudentRepository } from './student.repository';
import { IPaginationOptions } from 'utils/types/pagination-options';
import { PaginationResponseDto } from 'utils/types/pagination-response.dto';
import { Student } from './student.domain';
import { I18nService } from 'nestjs-i18n';
import { I18nTranslations } from '@/generated/i18n.generated';
import { UsersService } from 'modules/users/users.service';
import { FilterStudentDto, SortStudentDto } from './dto/query-student.dto';
import { TestAttemptEntity } from 'modules/tests/entities/test-attempt.entity';
import { StudentEntity } from './entities/student.entity';

@Injectable()
export class StudentsService {
  private readonly logger = new Logger(StudentsService.name);

  constructor(
    private studentRepository: StudentRepository,
    private usersService: UsersService,
    private i18nSerivce: I18nService<I18nTranslations>,
    @InjectRepository(TestAttemptEntity)
    private attemptRepository: Repository<TestAttemptEntity>,
    @InjectRepository(StudentEntity)
    private studentEntityRepository: Repository<StudentEntity>,
  ) { }
  async create(createStudentDto: CreateStudentDto) {
    await this.usersService.isEmailExist(createStudentDto?.email);
    return this.studentRepository.create(createStudentDto);
  }

  findAll({
    filterOptions,
    sortOptions,
    paginationOptions,
  }: {
    filterOptions?: FilterStudentDto | null;
    sortOptions?: SortStudentDto[] | null;
    paginationOptions: IPaginationOptions;
  }): Promise<PaginationResponseDto<Student>> {
    return this.studentRepository.findManyWithPagination({
      filterOptions,
      sortOptions,
      paginationOptions,
    });
  }

  async findOne(id: Student['id']) {
    const student = await this.studentRepository.findById(id);
    if (!student)
      throw new NotFoundException(this.i18nSerivce.t('user.FAIL.NOT_FOUND'));
    return student;
  }

  async update(id: Student['id'], updateStudentDto: UpdateStudentDto) {
    if (updateStudentDto && updateStudentDto.email) {
      await this.usersService.isEmailExist(updateStudentDto?.email);
    }
    return this.studentRepository.update(id, updateStudentDto);
  }

  async delete(id: Student['id']) {
    await this.findOne(id);
    return this.studentRepository.delete(id);
  }

  async findStudents(ids: Student['id'][]) {
    return await this.studentRepository.findStudents(ids);
  }

  async getSchedule(id: Student['id']) {
    return this.studentRepository.getSchedule(id);
  }
  async getStatistics() {
    return this.studentRepository.getStatistics();
  }

  async getMonthlyChanges(year: number) {
    return this.studentRepository.getMonthlyChanges(year);
  }

  /**
   * Get test attempts for a student.
   * If the requesting user is a parent, verify parent-child relationship via DB.
   * Uses aggregate SQL for summary (no JS loop), and separate paginated query.
   */
  async getTestAttempts(
    user: any,
    studentId: string,
    page = 1,
    limit = 20,
  ) {
    // 1. Authorization: verify parent-child relationship via DB
    const userRole = user?.role?.name?.toLowerCase() || '';
    if (userRole === 'parent') {
      const student = await this.studentEntityRepository.findOne({
        where: { id: studentId },
        relations: ['parent'],
      });
      if (!student) {
        throw new NotFoundException('Không tìm thấy học sinh');
      }
      if (!student.parent || student.parent.id !== user.id) {
        throw new ForbiddenException('Bạn không có quyền xem thông tin học sinh này');
      }
    }
    // Admin/Teacher roles are allowed without extra checks

    // 2. Aggregate summary query (SQL-level, no JS loop)
    const summaryRaw = await this.attemptRepository
      .createQueryBuilder('attempt')
      .innerJoin('attempt.test', 'test')
      .select('COUNT(*)', 'totalAttempts')
      .addSelect('COALESCE(AVG(attempt.percentage), 0)', 'averageScore')
      .addSelect(
        'CASE WHEN COUNT(*) > 0 THEN ROUND(SUM(CASE WHEN attempt.passed = true THEN 1 ELSE 0 END)::numeric / COUNT(*) * 100, 1) ELSE 0 END',
        'passRate',
      )
      .where('attempt.studentId = :studentId', { studentId })
      .getRawOne();

    // 3. Skill breakdown query (grouped by skillType)
    const skillRaw = await this.attemptRepository
      .createQueryBuilder('attempt')
      .innerJoin('attempt.test', 'test')
      .select('test.skillType', 'skillType')
      .addSelect('COALESCE(AVG(attempt.percentage), 0)', 'averageScore')
      .addSelect('COUNT(*)', 'count')
      .where('attempt.studentId = :studentId', { studentId })
      .groupBy('test.skillType')
      .getRawMany();

    const bySkillType: Record<string, { averageScore: number; count: number }> = {};
    for (const row of skillRaw) {
      bySkillType[row.skillType || 'reading'] = {
        averageScore: Math.round(parseFloat(row.averageScore) * 10) / 10,
        count: parseInt(row.count),
      };
    }

    // Find strongest skill
    let bestSkill = '';
    let bestScore = 0;
    for (const [skill, data] of Object.entries(bySkillType)) {
      if (data.averageScore > bestScore) {
        bestScore = data.averageScore;
        bestSkill = skill;
      }
    }

    const summary = {
      totalAttempts: parseInt(summaryRaw?.totalAttempts) || 0,
      averageScore: Math.round(parseFloat(summaryRaw?.averageScore || '0') * 10) / 10,
      passRate: parseFloat(summaryRaw?.passRate || '0'),
      bestSkill,
      bySkillType,
    };

    // 4. Paginated attempts with explicit field selection (QueryBuilder)
    const totalItems = summary.totalAttempts;
    const totalPages = Math.ceil(totalItems / limit);

    const attempts = await this.attemptRepository
      .createQueryBuilder('attempt')
      .leftJoin('attempt.test', 'test')
      .leftJoin('test.class', 'class')
      .select([
        'attempt.id',
        'attempt.score',
        'attempt.percentage',
        'attempt.passed',
        'attempt.submittedAt',
        'test.id',
        'test.title',
        'test.skillType',
        'class.id',
        'class.name',
      ])
      .where('attempt.studentId = :studentId', { studentId })
      .orderBy('attempt.submittedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    // 5. Score trend (last 10 attempts for chart)
    const trendRaw = await this.attemptRepository
      .createQueryBuilder('attempt')
      .leftJoin('attempt.test', 'test')
      .select([
        'attempt.id',
        'attempt.percentage',
        'attempt.submittedAt',
        'test.skillType',
      ])
      .where('attempt.studentId = :studentId', { studentId })
      .orderBy('attempt.submittedAt', 'ASC')
      .limit(30)
      .getMany();

    const trend = trendRaw.map(a => ({
      percentage: a.percentage,
      submittedAt: a.submittedAt,
      skillType: a.test?.skillType || 'reading',
    }));

    return {
      meta: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      summary,
      charts: {
        trend,
        skillBreakdown: bySkillType,
      },
      attempts: attempts.map(a => ({
        id: a.id,
        testTitle: a.test?.title || '',
        testSkillType: a.test?.skillType || 'reading',
        className: a.test?.class?.name || '',
        score: a.score,
        percentage: a.percentage,
        passed: a.passed,
        submittedAt: a.submittedAt,
      })),
    };
  }
}
