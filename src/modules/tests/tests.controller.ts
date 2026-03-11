import { Controller, Get, Post, Body, Patch, Put, Param, Delete, Query, Req } from '@nestjs/common';
import { TestsService } from './tests.service';
import { CreateTestDto } from './dto/create-test.dto';
import { UpdateTestDto } from './dto/update-test.dto';
import { SubmitTestDto } from './dto/submit-test.dto';
import { UserInfo } from '@/decorator/customize.decorator';

@Controller('tests')
export class TestsController {
    constructor(private readonly testsService: TestsService) { }

    // ============================================
    // Teacher Routes
    // ============================================

    /**
     * Create a new test
     * POST /tests
     */
    @Post()
    create(@UserInfo() user: any, @Body() createTestDto: CreateTestDto) {
        return this.testsService.create(user.id, createTestDto);
    }

    /**
     * Get all tests by logged-in teacher
     * GET /tests/teacher/me
     */
    @Get('teacher/me')
    findMyTests(
        @UserInfo() user: any,
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 10,
    ) {
        return this.testsService.findByTeacher(user.id, +page, +limit);
    }

    /**
     * Get test statistics
     * GET /tests/:id/statistics
     */
    @Get(':id/statistics')
    getStatistics(@Param('id') id: string) {
        return this.testsService.getTestStatistics(id);
    }

    /**
     * Publish a test
     * PATCH /tests/:id/publish
     */
    @Patch(':id/publish')
    publish(@UserInfo() user: any, @Param('id') id: string) {
        return this.testsService.publish(id, user.id);
    }

    /**
     * Unpublish a test
     * PATCH /tests/:id/unpublish
     */
    @Patch(':id/unpublish')
    unpublish(@UserInfo() user: any, @Param('id') id: string) {
        return this.testsService.unpublish(id, user.id);
    }

    /**
     * Archive a test
     * PATCH /tests/:id/archive
     */
    @Patch(':id/archive')
    archive(@UserInfo() user: any, @Param('id') id: string) {
        return this.testsService.archive(id, user.id);
    }

    /**
     * Duplicate a test (optionally for a different class)
     * POST /tests/:id/duplicate
     */
    @Post(':id/duplicate')
    duplicate(
        @UserInfo() user: any,
        @Param('id') id: string,
        @Body('classId') newClassId?: string,
    ) {
        return this.testsService.duplicate(id, user.id, newClassId);
    }

    // ============================================
    // Student Routes
    // ============================================

    /**
     * Get available tests for logged-in student
     * GET /tests/student/available
     */
    @Get('student/available')
    getAvailableTests(@UserInfo() user: any) {
        return this.testsService.getAvailableTests(user.id);
    }

    /**
     * Get student's attempt history
     * GET /tests/student/attempts
     */
    @Get('student/attempts')
    getMyAttempts(
        @UserInfo() user: any,
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 10,
    ) {
        return this.testsService.getStudentAttempts(user.id, +page, +limit);
    }

    /**
     * Get test for student (without correct answers)
     * GET /tests/student/:id
     */
    @Get('student/:id')
    getTestForStudent(@UserInfo() user: any, @Param('id') id: string) {
        return this.testsService.getTestForStudent(id, user.id);
    }

    /**
     * Submit test answers for grading
     * POST /tests/:id/submit
     */
    @Post(':id/submit')
    submitTest(
        @UserInfo() user: any,
        @Param('id') id: string,
        @Body() submitDto: SubmitTestDto,
    ) {
        return this.testsService.submitTest(id, user.id, submitDto);
    }

    /**
     * Get attempt result by ID
     * GET /tests/attempts/:id
     */
    @Get('attempts/:id')
    getAttempt(@Param('id') id: string) {
        return this.testsService.getAttemptById(id);
    }

    // ============================================
    // General Routes (must be last due to :id param)
    // ============================================

    /**
     * Get test by ID (with answers - for teacher)
     * GET /tests/:id
     */
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.testsService.findById(id);
    }

    /**
     * Update test
     * PUT /tests/:id
     */
    @Put(':id')
    update(
        @UserInfo() user: any,
        @Param('id') id: string,
        @Body() updateTestDto: UpdateTestDto,
    ) {
        return this.testsService.update(id, user.id, updateTestDto);
    }

    /**
     * Delete test
     * DELETE /tests/:id
     */
    @Delete(':id')
    remove(@UserInfo() user: any, @Param('id') id: string) {
        return this.testsService.delete(id, user.id);
    }
}
