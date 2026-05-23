import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentEntity } from '../students/entities/student.entity';
import { TeacherEntity } from '../teachers/entities/teacher.entity';
import { ParentEntity } from '../parents/entities/parent.entity';
import { ClassEntity } from '../classes/entities/class.entity';
import { PaymentEntity } from '../payments/entities/payment.entity';
import { TeacherPaymentEntity } from '../teacher-payments/entities/teacher-payment.entity';
import { RegistrationEntity } from '../registrations/entities/registration.entity';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { TestEntity } from '../tests/entities/test.entity';
import { TestAttemptEntity } from '../tests/entities/test-attempt.entity';

@Injectable()
export class DashboardRepository {
  constructor(
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    @InjectRepository(TeacherEntity)
    private readonly teacherRepository: Repository<TeacherEntity>,
    @InjectRepository(ParentEntity)
    private readonly parentRepository: Repository<ParentEntity>,
    @InjectRepository(ClassEntity)
    private readonly classRepository: Repository<ClassEntity>,
    @InjectRepository(PaymentEntity)
    private readonly paymentRepository: Repository<PaymentEntity>,
    @InjectRepository(TeacherPaymentEntity)
    private readonly teacherPaymentRepository: Repository<TeacherPaymentEntity>,
    @InjectRepository(RegistrationEntity)
    private readonly registrationRepository: Repository<RegistrationEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transactionRepository: Repository<TransactionEntity>,
    @InjectRepository(TestEntity)
    private readonly testRepository: Repository<TestEntity>,
    @InjectRepository(TestAttemptEntity)
    private readonly testAttemptRepository: Repository<TestAttemptEntity>,
  ) { }

  async getAdminDashboard() {
    // Đếm tổng số
    const totalStudent = await this.studentRepository.count();
    const totalTeacher = await this.teacherRepository.count();
    const activeClasses = await this.classRepository.count({
      where: { status: 'active' },
    });
    const upcomingClasses = await this.classRepository.count({
      where: { status: 'upcoming' },
    });
    const closedClasses = await this.classRepository.count({
      where: { status: 'closed' },
    });

    // Payment info aggregation
    const paymentStats = await this.paymentRepository
      .createQueryBuilder('payment')
      .select('SUM(payment.totalAmount)', 'totalRevenue')
      .addSelect('SUM(payment.paidAmount)', 'totalPaidAmount')
      .addSelect(
        'SUM(payment.totalAmount - payment.paidAmount)',
        'totalUnPaidAmount',
      )
      .getRawOne();

    // Teacher payment info aggregation
    const teacherPaymentStats = await this.teacherPaymentRepository
      .createQueryBuilder('teacherPayment')
      .select('SUM(teacherPayment.totalAmount)', 'totalSalary')
      .addSelect('SUM(teacherPayment.paidAmount)', 'totalPaidAmount')
      .addSelect(
        'SUM(teacherPayment.totalAmount - teacherPayment.paidAmount)',
        'totalUnPaidAmount',
      )
      .getRawOne();

    // Recent payments (top 5)
    const recentPayments = await this.paymentRepository.find({
      relations: ['student', 'student.parent', 'class'],
      order: { year: 'DESC', month: 'DESC' },
      take: 5,
    });

    const recentlyPayment = recentPayments.map((payment) => ({
      id: payment.id,
      name: payment.student?.name || 'Unknown',
      paidAmount: payment.paidAmount,
      totalAmount: payment.totalAmount,
      status: payment.status,
      month: payment.month,
      year: payment.year,
      totalLessons: payment.totalLessons,
      discountPercent: payment.discountPercent,
      className: payment.class?.name || 'N/A',
      parentName: payment.student?.parent?.name || 'Chưa có',
      parentPhone: payment.student?.parent?.phone || 'N/A',
      parentEmail: payment.student?.parent?.email || 'N/A',
      studentEmail: payment.student?.email || 'N/A',
      studentPhone: payment.student?.phone || 'N/A',
    }));

    // Recent teacher payments (top 5)
    const recentTeacherPayments = await this.teacherPaymentRepository.find({
      relations: ['teacher'],
      order: { year: 'DESC', month: 'DESC' },
      take: 5,
    });

    const recentlySalary = recentTeacherPayments.map((payment) => ({
      name: payment.teacher?.name || 'Unknown',
      paidAmount: payment.paidAmount,
      totalAmount: payment.totalAmount,
      month: payment.month,
      year: payment.year,
      status: payment.status,
    }));

    return {
      totalStudent,
      totalTeacher,
      activeClasses,
      upcomingClasses,
      closedClasses,
      paymentInfo: {
        totalRevenue: Number(paymentStats.totalRevenue) || 0,
        totalPaidAmount: Number(paymentStats.totalPaidAmount) || 0,
        totalUnPaidAmount: Number(paymentStats.totalUnPaidAmount) || 0,
      },
      teacherPaymentInfo: {
        totalSalary: Number(teacherPaymentStats.totalSalary) || 0,
        totalPaidAmount: Number(teacherPaymentStats.totalPaidAmount) || 0,
        totalUnPaidAmount: Number(teacherPaymentStats.totalUnPaidAmount) || 0,
      },
      recentlyPayment,
      recentlySalary,
    };
  }

  async getTeacherDashboard(teacherId: string) {
    // Get teacher with classes
    const teacher = await this.teacherRepository.findOne({
      where: { id: teacherId },
      relations: ['classes'],
    });

    if (!teacher) {
      throw new Error('Teacher not found');
    }

    // Count classes by status
    const teachingClasses =
      teacher.classes?.filter((cls) => cls.status === 'active').length || 0;
    const closedClasses =
      teacher.classes?.filter((cls) => cls.status === 'closed').length || 0;
    const upcomingClasses =
      teacher.classes?.filter((cls) => cls.status === 'upcoming').length || 0;

    // Get class IDs for student counting (chỉ query khi có classes)
    const classIds = teacher.classes?.map((cls) => cls.id) || [];

    // Count total students in teacher's classes
    let totalStudents = 0;
    if (classIds.length > 0) {
      totalStudents = await this.studentRepository
        .createQueryBuilder('student')
        .innerJoin('student.classes', 'classStudent')
        .where('classStudent.classId IN (:...classIds)', { classIds })
        .getCount();
    }

    // Teacher payment info
    const paymentStats = await this.teacherPaymentRepository
      .createQueryBuilder('payment')
      .select('SUM(payment.totalAmount)', 'totalSalary')
      .addSelect('SUM(payment.paidAmount)', 'totalPaidAmount')
      .addSelect(
        'SUM(payment.totalAmount - payment.paidAmount)',
        'totalUnPaidAmount',
      )
      .where('payment.teacherId = :teacherId', { teacherId })
      .getRawOne();

    // Active classes details
    const activeClasses =
      teacher.classes
        ?.filter((cls) => cls.status === 'active')
        .map((cls) => ({
          name: cls.name,
          schedule: cls.schedule,
          room: cls.room,
        })) || [];

    // Recent salary info
    const recentTeacherPayment = await this.teacherPaymentRepository.findOne({
      where: { teacherId },
      order: { year: 'DESC', month: 'DESC' },
    });

    let recentlySalary = null;
    if (recentTeacherPayment) {
      const totalLessons =
        recentTeacherPayment.classes?.reduce(
          (sum, cls) => sum + (cls.totalLessons || 0),
          0,
        ) || 0;

      recentlySalary = {
        month: recentTeacherPayment.month,
        year: recentTeacherPayment.year,
        totalLessons,
        salaryPerLesson: teacher.salaryPerLesson || 0,
        paidAmount: recentTeacherPayment.paidAmount,
      };
    }

    return {
      totalStudent: totalStudents,
      teachingClasses,
      closedClasses,
      upcomingClasses,
      paymentInfo: {
        totalSalary: Number(paymentStats?.totalSalary) || 0,
        totalPaidAmount: Number(paymentStats?.totalPaidAmount) || 0,
        totalUnPaidAmount: Number(paymentStats?.totalUnPaidAmount) || 0,
      },
      activeClasses,
      recentlySalary,
    };
  }

  async getStudentDashboard(studentId: string) {
    // Get student with classes
    const student = await this.studentRepository.findOne({
      where: { id: studentId },
      relations: ['classes', 'classes.class', 'classes.class.teacher'],
    });

    if (!student) {
      throw new Error('Student not found');
    }

    // Count classes by status (based on class status, not class-student status)
    const activeClasses =
      student.classes?.filter(
        (classStudent) => classStudent.class?.status === 'active',
      ).length || 0;
    const completedClasses =
      student.classes?.filter(
        (classStudent) => classStudent.class?.status === 'closed',
      ).length || 0;

    // Class list with details
    const classList =
      student.classes?.map((classStudent) => ({
        className: classStudent.class?.name || 'Unknown',
        room: classStudent.class?.room || 'N/A',
        schedule: classStudent.class?.schedule || {},
        teacherName: classStudent.class?.teacher?.name || 'Chưa phân công',
        status: classStudent.class?.status || 'unknown',
      })) || [];

    // Calculate real attendance from attendance_sessions table
    const attendanceStats = await this.studentRepository.manager
      .createQueryBuilder()
      .select('COUNT(*)', 'totalSessions')
      .addSelect(`SUM(CASE WHEN "status" = 'present' THEN 1 ELSE 0 END)`, 'presentSessions')
      .addSelect(`SUM(CASE WHEN "status" = 'absent' THEN 1 ELSE 0 END)`, 'absentSessions')
      .addSelect(`SUM(CASE WHEN "status" = 'late' THEN 1 ELSE 0 END)`, 'lateSessions')
      .from('attendance_session', 'att')
      .where('"studentId" = :studentId', { studentId })
      .getRawOne();

    const totalSessions = parseInt(attendanceStats?.totalSessions) || 0;
    const presentSessions = parseInt(attendanceStats?.presentSessions) || 0;
    const absentSessions = parseInt(attendanceStats?.absentSessions) || 0;
    const lateSessions = parseInt(attendanceStats?.lateSessions) || 0;
    const attendanceRate = totalSessions > 0
      ? Math.round(((presentSessions + lateSessions) / totalSessions) * 100)
      : 0;

    return {
      totalClasses: student.classes?.length || 0,
      activeClasses,
      completedClasses,
      attendance: {
        totalSessions,
        presentSessions,
        absentSessions,
        lateSessions,
        attendanceRate,
      },
      classList,
    };
  }

  async getParentDashboard(parentId: string) {
    // Get parent with students and their classes
    const parent = await this.parentRepository.findOne({
      where: { id: parentId },
      relations: ['students', 'students.classes', 'students.classes.class', 'students.classes.class.teacher'],
    });

    if (!parent) {
      throw new Error('Parent not found');
    }

    const studentIds = parent.students?.map((student) => student.id) || [];

    // Tránh query nếu không có students
    if (studentIds.length === 0) {
      return {
        totalChildren: 0,
        paymentInfo: {
          totalRevenue: 0,
          totalPaidAmount: 0,
          totalUnPaidAmount: 0,
        },
        studentPayments: [],
      };
    }

    // Payment info for all children
    const paymentStats = await this.paymentRepository
      .createQueryBuilder('payment')
      .select('SUM(payment.totalAmount)', 'totalRevenue')
      .addSelect('SUM(payment.paidAmount)', 'totalPaidAmount')
      .addSelect(
        'SUM(payment.totalAmount - payment.paidAmount)',
        'totalUnPaidAmount',
      )
      .where('payment.studentId IN (:...studentIds)', { studentIds })
      .getRawOne();

    // Individual student payment info (LEFT JOIN to include students without payments)
    const paymentsByStudent = await this.paymentRepository
      .createQueryBuilder('payment')
      .select('payment.studentId', 'studentId')
      .addSelect('SUM(payment.totalAmount)', 'totalAmount')
      .addSelect('SUM(payment.paidAmount)', 'totalPaidAmount')
      .addSelect(
        'SUM(payment.totalAmount - payment.paidAmount)',
        'totalUnPaidAmount',
      )
      .where('payment.studentId IN (:...studentIds)', { studentIds })
      .groupBy('payment.studentId')
      .getRawMany();

    // Create a map of studentId -> payment info
    const paymentMap = new Map(
      paymentsByStudent.map((p) => [p.studentId, p]),
    );

    // Build studentPayments from ALL students (not just those with payments)
    const studentPayments = parent.students.map((student) => {
      const payment = paymentMap.get(student.id);
      const activeClasses = student.classes?.filter(
        (cs) => cs.class?.status === 'active',
      ) || [];

      // Build schedule info from classes
      const schedules = student.classes?.map((cs) => ({
        class: cs.class ? {
          name: cs.class.name,
          grade: cs.class.grade,
          year: cs.class.year,
          room: cs.class.room,
          schedule: cs.class.schedule,
          status: cs.class.status,
        } : null,
        teacher: cs.class?.teacher ? {
          name: cs.class.teacher.name,
        } : null,
        isActive: cs.class?.status === 'active',
      })) || [];

      return {
        studentId: student.id,
        studentName: student.name,
        studentEmail: student.email,
        totalAmount: Number(payment?.totalAmount) || 0,
        totalPaidAmount: Number(payment?.totalPaidAmount) || 0,
        totalUnPaidAmount: Number(payment?.totalUnPaidAmount) || 0,
        totalActiveClasses: activeClasses.length,
        schedules,
      };
    });

    return {
      totalChildren: parent.students?.length || 0,
      paymentInfo: {
        totalRevenue: Number(paymentStats?.totalRevenue) || 0,
        totalPaidAmount: Number(paymentStats?.totalPaidAmount) || 0,
        totalUnPaidAmount: Number(paymentStats?.totalUnPaidAmount) || 0,
      },
      studentPayments,
    };
  }

  async getAllPaymentsForDashboard(params: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
  }) {
    const page = params.page || 1;
    const limit = params.limit || 10;
    const skip = (page - 1) * limit;

    const qb = this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.student', 'student')
      .leftJoinAndSelect('student.parent', 'parent')
      .leftJoinAndSelect('payment.class', 'class');

    // Filter by status
    if (params.status && params.status !== 'all') {
      qb.andWhere('payment.status = :status', { status: params.status });
    }

    // Search by student name or parent name
    if (params.search && params.search.trim()) {
      qb.andWhere(
        '(LOWER(student.name) LIKE LOWER(:search) OR LOWER(parent.name) LIKE LOWER(:search))',
        { search: `%${params.search.trim()}%` },
      );
    }

    qb.orderBy('payment.year', 'DESC')
      .addOrderBy('payment.month', 'DESC')
      .addOrderBy('payment.status', 'ASC');

    const totalItems = await qb.getCount();
    const totalPages = Math.ceil(totalItems / limit);

    const payments = await qb.skip(skip).take(limit).getMany();

    const result = payments.map((payment) => ({
      id: payment.id,
      name: payment.student?.name || 'Unknown',
      paidAmount: payment.paidAmount,
      totalAmount: payment.totalAmount,
      discountPercent: payment.discountPercent,
      status: payment.status,
      month: payment.month,
      year: payment.year,
      totalLessons: payment.totalLessons,
      className: payment.class?.name || 'N/A',
      parentName: payment.student?.parent?.name || 'Chưa có',
      parentPhone: payment.student?.parent?.phone || 'N/A',
      parentEmail: payment.student?.parent?.email || 'N/A',
      studentEmail: payment.student?.email || 'N/A',
      studentPhone: payment.student?.phone || 'N/A',
    }));

    return {
      result,
      meta: {
        page,
        limit,
        totalItems,
        totalPages,
      },
    };
  }

  async getMonthlyRevenue(year: number) {
    // Doanh thu học phí theo tháng (đã thu được)
    const revenueRaw = await this.paymentRepository
      .createQueryBuilder('payment')
      .select('payment.month', 'month')
      .addSelect('SUM(payment.paidAmount)', 'revenue')
      .addSelect('SUM(payment.totalAmount)', 'totalRevenue')
      .where('payment.year = :year', { year })
      .groupBy('payment.month')
      .orderBy('payment.month', 'ASC')
      .getRawMany();

    // Chi phí lương giáo viên theo tháng (đã trả)
    const expenseRaw = await this.teacherPaymentRepository
      .createQueryBuilder('tp')
      .select('tp.month', 'month')
      .addSelect('SUM(tp.paidAmount)', 'expense')
      .addSelect('SUM(tp.totalAmount)', 'totalExpense')
      .where('tp.year = :year', { year })
      .groupBy('tp.month')
      .orderBy('tp.month', 'ASC')
      .getRawMany();

    // Thu/Chi khác từ bảng transaction (tiền điện nước, thuê phòng, phí thi thử...)
    const otherTransactions = await this.transactionRepository
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.category', 'cat')
      .where('EXTRACT(YEAR FROM t.transactionAt) = :year', { year })
      .andWhere('t.deletedAt IS NULL')
      .getMany();

    // Group other transactions by month & type
    const otherRevenueByMonth: Record<number, number> = {};
    const otherExpenseByMonth: Record<number, number> = {};
    for (const t of otherTransactions) {
      const m = new Date(t.transactionAt).getMonth() + 1;
      if (t.category?.type === 'revenue') {
        otherRevenueByMonth[m] = (otherRevenueByMonth[m] || 0) + (t.amount || 0);
      } else if (t.category?.type === 'expense') {
        otherExpenseByMonth[m] = (otherExpenseByMonth[m] || 0) + (t.amount || 0);
      }
    }

    // Map dữ liệu vào 12 tháng
    const monthlyData = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const rev = revenueRaw.find(r => Number(r.month) === month);
      const exp = expenseRaw.find(e => Number(e.month) === month);
      const tuitionRevenue = Number(rev?.revenue) || 0;
      const salaryExpense = Number(exp?.expense) || 0;
      const otherRev = otherRevenueByMonth[month] || 0;
      const otherExp = otherExpenseByMonth[month] || 0;
      const totalRev = tuitionRevenue + otherRev;
      const totalExp = salaryExpense + otherExp;
      return {
        month,
        monthName: `Th${month}`,
        revenue: totalRev,
        totalRevenue: (Number(rev?.totalRevenue) || 0) + otherRev,
        expense: totalExp,
        totalExpense: (Number(exp?.totalExpense) || 0) + otherExp,
        profit: totalRev - totalExp,
      };
    });

    const totalRevenue = monthlyData.reduce((s, m) => s + m.revenue, 0);
    const totalExpense = monthlyData.reduce((s, m) => s + m.expense, 0);

    return {
      year,
      monthlyData,
      summary: {
        totalRevenue,
        totalExpense,
        profit: totalRevenue - totalExpense,
      },
    };
  }

  /**
   * Learning Analytics: Test Performance by Skill + Class Ranking
   */
  async getLearningAnalytics(year?: number) {
    // ── 1. Test Performance by Skill Type ──
    const skillQb = this.testAttemptRepository
      .createQueryBuilder('ta')
      .innerJoin('ta.test', 't')
      .select('t.skillType', 'skillType')
      .addSelect('COUNT(ta.id)', 'totalAttempts')
      .addSelect('AVG(ta.percentage)', 'avgScore')
      .addSelect('SUM(CASE WHEN ta.passed = true THEN 1 ELSE 0 END)', 'passedCount')
      .addSelect('COUNT(DISTINCT ta.studentId)', 'uniqueStudents')
      .where('t.deletedAt IS NULL');

    if (year) {
      skillQb.andWhere('EXTRACT(YEAR FROM ta.submittedAt) = :year', { year });
    }

    const skillStats = await skillQb.groupBy('t.skillType').getRawMany();

    const testPerformance = skillStats.map(s => ({
      skillType: s.skillType || 'reading',
      totalAttempts: Number(s.totalAttempts) || 0,
      avgScore: Math.round((Number(s.avgScore) || 0) * 10) / 10,
      passRate: Number(s.totalAttempts) > 0
        ? Math.round((Number(s.passedCount) / Number(s.totalAttempts)) * 100)
        : 0,
      uniqueStudents: Number(s.uniqueStudents) || 0,
    }));

    // Overall summary
    const totalAttempts = testPerformance.reduce((s, p) => s + p.totalAttempts, 0);
    const totalPassed = skillStats.reduce((s, p) => s + (Number(p.passedCount) || 0), 0);
    const overallAvg = totalAttempts > 0
      ? Math.round(testPerformance.reduce((s, p) => s + p.avgScore * p.totalAttempts, 0) / totalAttempts * 10) / 10
      : 0;

    // ── 2. Class Ranking (test scores + attendance) ──
    // Test scores per class
    const classQb = this.testAttemptRepository
      .createQueryBuilder('ta')
      .innerJoin('ta.test', 't')
      .innerJoin('t.class', 'c')
      .select('t.classId', 'classId')
      .addSelect('c.name', 'className')
      .addSelect('AVG(ta.percentage)', 'avgTestScore')
      .addSelect('COUNT(ta.id)', 'totalAttempts')
      .addSelect('SUM(CASE WHEN ta.passed = true THEN 1 ELSE 0 END)', 'passedCount')
      .where('t.deletedAt IS NULL')
      .andWhere('c.status = :status', { status: 'active' });

    if (year) {
      classQb.andWhere('EXTRACT(YEAR FROM ta.submittedAt) = :year', { year });
    }

    const classTestStats = await classQb
      .groupBy('t.classId')
      .addGroupBy('c.name')
      .getRawMany();

    // Attendance per class
    const yearFilter = year ? `AND EXTRACT(YEAR FROM s.date) = ${year}` : '';
    const classAttendance: any[] = await this.studentRepository.manager.query(`
      SELECT s."classId",
        COUNT(*) as "totalRecords",
        SUM(CASE WHEN a.status = 'present' OR a.status = 'late' THEN 1 ELSE 0 END) as "presentCount"
      FROM attendance_session a
      JOIN sessions s ON a."sessionId" = s.id
      WHERE 1=1 ${yearFilter}
      GROUP BY s."classId"
    `);

    const attendanceMap = new Map<string, { total: number; present: number }>();
    for (const row of classAttendance) {
      attendanceMap.set(row.classId, {
        total: Number(row.totalRecords) || 0,
        present: Number(row.presentCount) || 0,
      });
    }

    const classRanking = classTestStats.map(cls => {
      const att = attendanceMap.get(cls.classId);
      const attendanceRate = att && att.total > 0
        ? Math.round((att.present / att.total) * 100)
        : 0;
      const avgTestScore = Math.round((Number(cls.avgTestScore) || 0) * 10) / 10;
      const passRate = Number(cls.totalAttempts) > 0
        ? Math.round((Number(cls.passedCount) / Number(cls.totalAttempts)) * 100)
        : 0;
      // Combined score: 60% test + 40% attendance
      const compositeScore = Math.round(avgTestScore * 0.6 + attendanceRate * 0.4);

      return {
        classId: cls.classId,
        className: cls.className,
        avgTestScore,
        passRate,
        totalAttempts: Number(cls.totalAttempts) || 0,
        attendanceRate,
        compositeScore,
      };
    }).sort((a, b) => b.compositeScore - a.compositeScore);

    return {
      testPerformance,
      summary: {
        totalAttempts,
        overallAvgScore: overallAvg,
        overallPassRate: totalAttempts > 0 ? Math.round((totalPassed / totalAttempts) * 100) : 0,
        totalStudentsTested: new Set(testPerformance.map(p => p.uniqueStudents)).size > 0
          ? testPerformance.reduce((s, p) => s + p.uniqueStudents, 0)
          : 0,
      },
      classRanking,
    };
  }
}
