import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { StudentsService } from './students.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { ResponseMessage, UserInfo } from '@/decorator/customize.decorator';
import { QueryDto } from 'utils/types/query.dto';
import { FilterStudentDto, SortStudentDto } from './dto/query-student.dto';
import { Student } from './student.domain';

@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) { }

  @Post()
  @ResponseMessage('student.SUCCESS.CREATE_A_STUDENT')
  create(@Body() createStudentDto: CreateStudentDto) {
    return this.studentsService.create(createStudentDto);
  }

  @Get()
  findAll(@Query() query: QueryDto<FilterStudentDto, SortStudentDto>) {
    const page = query?.page;
    const limit = query?.limit;
    return this.studentsService.findAll({
      filterOptions: query.filters,
      sortOptions: query.sort,
      paginationOptions: {
        page,
        limit,
      },
    });
  }

  @Get('statistics')
  getStatistics() {
    return this.studentsService.getStatistics();
  }

  @Get('monthly-changes')
  getMonthlyChanges(@Query('year') year?: string) {
    const yearNum = year ? parseInt(year) : new Date().getFullYear();
    return this.studentsService.getMonthlyChanges(yearNum);
  }

  @Get('schedule/:id')
  getSchedule(@Param('id') id: Student['id']) {
    return this.studentsService.getSchedule(id);
  }

  /**
   * Get test attempts for a student.
   * Parent role: verifies parent-child relationship.
   * Admin/Teacher: allowed directly.
   * GET /students/:studentId/test-attempts
   */
  @Get(':studentId/test-attempts')
  getTestAttempts(
    @UserInfo() user: any,
    @Param('studentId') studentId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.studentsService.getTestAttempts(user, studentId, +page, +limit);
  }

  @Get(':id')
  findOne(@Param('id') id: Student['id']) {
    return this.studentsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: Student['id'],
    @Body() updateStudentDto: UpdateStudentDto,
  ) {
    return this.studentsService.update(id, updateStudentDto);
  }

  @Delete(':id')
  delete(@Param('id') id: Student['id']) {
    return this.studentsService.delete(id);
  }
}
