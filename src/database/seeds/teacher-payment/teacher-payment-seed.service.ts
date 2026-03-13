import { TeacherPaymentEntity } from "@/modules/teacher-payments/entities/teacher-payment.entity";
import { ClassEntity } from "modules/classes/entities/class.entity";
import { SessionEntity } from "modules/sessions/entities/session.entity";
import { TeacherEntity } from "modules/teachers/entities/teacher.entity";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

@Injectable()
export class TeacherPaymentSeedService {
    constructor(
        @InjectRepository(TeacherPaymentEntity) private teacherPaymentRepository: Repository<TeacherPaymentEntity>,
        @InjectRepository(ClassEntity) private classRepository: Repository<ClassEntity>,
        @InjectRepository(SessionEntity) private sessionRepository: Repository<SessionEntity>,
        @InjectRepository(TeacherEntity) private teacherRepository: Repository<TeacherEntity>,
    ) { }

    async run() {
        const existing = await this.teacherPaymentRepository.find();
        if (existing.length > 0) return;

        const classes = await this.classRepository.find({
            where: [{ status: 'closed' }, { status: 'active' }],
            relations: ['teacher'],
        });

        const paymentMethods = ['cash', 'bank_transfer'];

        // Nhóm classes theo teacher
        const teacherClassesMap = new Map<string, ClassEntity[]>();
        for (const aclass of classes) {
            if (!aclass.teacher) continue;
            const teacherId = aclass.teacher.id;
            if (!teacherClassesMap.has(teacherId)) {
                teacherClassesMap.set(teacherId, []);
            }
            teacherClassesMap.get(teacherId)!.push(aclass);
        }

        for (const [teacherId, teacherClasses] of teacherClassesMap) {
            const teacher = teacherClasses[0].teacher;
            const salaryPerLesson = teacher.salaryPerLesson || 180000;

            // Tìm tất cả tháng cần tạo payment
            const monthlyClassesMap = new Map<string, { classId: string; className: string; totalLessons: number }[]>();

            for (const aclass of teacherClasses) {
                const schedule = aclass.schedule;
                if (!schedule) continue;

                const startDate = new Date(schedule.start_date);
                const endDate = aclass.status === 'active' ? new Date('2026-03-10') : new Date(schedule.end_date);

                // Sessions trong lớp này
                const totalSessions = await this.sessionRepository.count({
                    where: { classId: aclass.id },
                });

                // Tháng hoạt động
                const months: { month: number; year: number }[] = [];
                const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
                while (current <= endDate) {
                    months.push({ month: current.getMonth() + 1, year: current.getFullYear() });
                    current.setMonth(current.getMonth() + 1);
                }

                const lessonsPerMonth = Math.max(1, Math.round(totalSessions / (months.length || 1)));

                for (const { month, year } of months) {
                    const key = `${year}-${month}`;
                    if (!monthlyClassesMap.has(key)) {
                        monthlyClassesMap.set(key, []);
                    }
                    monthlyClassesMap.get(key)!.push({
                        classId: aclass.id,
                        className: aclass.name,
                        totalLessons: lessonsPerMonth,
                    });
                }
            }

            // Tạo teacher payment cho mỗi tháng
            for (const [key, classesData] of monthlyClassesMap) {
                const [yearStr, monthStr] = key.split('-');
                const year = parseInt(yearStr);
                const month = parseInt(monthStr);

                const totalLessons = classesData.reduce((sum, c) => sum + c.totalLessons, 0);
                const totalAmount = totalLessons * salaryPerLesson;

                // Xác định trạng thái thanh toán
                const today = new Date('2026-03-10');
                const paymentMonth = new Date(year, month - 1, 1);
                const monthsDiff = (today.getFullYear() - paymentMonth.getFullYear()) * 12 +
                    (today.getMonth() - paymentMonth.getMonth());

                let status: string;
                let paidAmount: number;
                const histories: any[] = [];

                if (monthsDiff >= 2) {
                    // Tháng cũ: đã trả đủ
                    status = 'paid';
                    paidAmount = totalAmount;
                    histories.push({
                        method: paymentMethods[Math.floor(Math.random() * 2)],
                        amount: totalAmount,
                        note: 'Thanh toán lương đầy đủ',
                        date: new Date(year, month, Math.floor(Math.random() * 10) + 1),
                    });
                } else if (monthsDiff === 1) {
                    // Tháng trước: 80% đã trả
                    const rand = Math.random();
                    if (rand < 0.8) {
                        status = 'paid';
                        paidAmount = totalAmount;
                        histories.push({
                            method: paymentMethods[Math.floor(Math.random() * 2)],
                            amount: totalAmount,
                            note: 'Thanh toán lương đầy đủ',
                            date: new Date(year, month, Math.floor(Math.random() * 10) + 1),
                        });
                    } else {
                        status = 'partial';
                        paidAmount = Math.round(totalAmount * 0.6);
                        histories.push({
                            method: 'cash',
                            amount: paidAmount,
                            note: 'Tạm ứng lương',
                            date: new Date(year, month, Math.floor(Math.random() * 5) + 1),
                        });
                    }
                } else {
                    // Tháng hiện tại: chờ thanh toán
                    status = 'pending';
                    paidAmount = 0;
                }

                await this.teacherPaymentRepository.save(
                    this.teacherPaymentRepository.create({
                        month,
                        year,
                        totalAmount,
                        paidAmount,
                        status,
                        teacherId,
                        classes: classesData.map(c => ({
                            classId: c.classId,
                            totalLessons: c.totalLessons,
                        })) as any,
                        histories,
                    }),
                    { listeners: false }
                );
            }
        }
    }
}
