import { PaymentEntity } from "@/modules/payments/entities/payment.entity";
import { ClassEntity } from "modules/classes/entities/class.entity";
import { SessionEntity } from "modules/sessions/entities/session.entity";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

@Injectable()
export class PaymentSeedService {
    constructor(
        @InjectRepository(PaymentEntity) private paymentRepository: Repository<PaymentEntity>,
        @InjectRepository(ClassEntity) private classRepository: Repository<ClassEntity>,
        @InjectRepository(SessionEntity) private sessionRepository: Repository<SessionEntity>
    ) { }

    async run() {
        const payments = await this.paymentRepository.find();
        if (payments.length > 0) return;

        const classes = await this.classRepository.find({
            where: [{ status: 'closed' }, { status: 'active' }],
            relations: ['students', 'students.student']
        });

        const paymentMethods = ['cash', 'bank_transfer'];

        for (const aclass of classes) {
            if (!aclass.students || aclass.students.length === 0) continue;

            const schedule = aclass.schedule;
            if (!schedule) continue;

            const startDate = new Date(schedule.start_date);
            const endDate = aclass.status === 'active' ? new Date('2026-03-10') : new Date(schedule.end_date);

            // Determine which months need payments
            const months: { month: number; year: number }[] = [];
            const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
            while (current <= endDate) {
                months.push({ month: current.getMonth() + 1, year: current.getFullYear() });
                current.setMonth(current.getMonth() + 1);
            }

            for (const classStudent of aclass.students) {
                if (!classStudent.student) continue;

                for (const { month, year } of months) {
                    // Count sessions in this month
                    const sessionsInMonth = await this.sessionRepository.count({
                        where: { classId: aclass.id }
                    });

                    // Approximate sessions per month
                    const totalMonths = months.length || 1;
                    const totalLessons = Math.max(1, Math.round(sessionsInMonth / totalMonths));
                    const totalAmount = totalLessons * aclass.feePerLesson;
                    const discountPercent = classStudent.discountPercent || 0;
                    const discountedAmount = totalAmount - (totalAmount * discountPercent / 100);

                    // Determine payment status
                    let status: string;
                    let paidAmount: number;
                    const histories: any[] = [];

                    if (aclass.status === 'closed') {
                        // Closed classes: fully paid
                        status = 'paid';
                        paidAmount = discountedAmount;
                        histories.push({
                            method: paymentMethods[Math.floor(Math.random() * 2)],
                            amount: discountedAmount,
                            note: 'Thanh toán đầy đủ',
                            date: new Date(year, month - 1, Math.floor(Math.random() * 10) + 5)
                        });
                    } else {
                        // Active classes: mix of statuses
                        const today = new Date('2026-03-10');
                        const paymentMonth = new Date(year, month - 1, 1);
                        const monthsDiff = (today.getFullYear() - paymentMonth.getFullYear()) * 12 +
                            (today.getMonth() - paymentMonth.getMonth());

                        if (monthsDiff >= 2) {
                            // Months 2+ ago: mostly paid
                            status = 'paid';
                            paidAmount = discountedAmount;
                            histories.push({
                                method: paymentMethods[Math.floor(Math.random() * 2)],
                                amount: discountedAmount,
                                note: 'Thanh toán đầy đủ',
                                date: new Date(year, month - 1, Math.floor(Math.random() * 15) + 5)
                            });
                        } else if (monthsDiff === 1) {
                            // Last month: some paid, some partial
                            const rand = Math.random();
                            if (rand < 0.6) {
                                status = 'paid';
                                paidAmount = discountedAmount;
                                histories.push({
                                    method: paymentMethods[Math.floor(Math.random() * 2)],
                                    amount: discountedAmount,
                                    note: 'Thanh toán đầy đủ',
                                    date: new Date(year, month, Math.floor(Math.random() * 10) + 1)
                                });
                            } else {
                                status = 'partial';
                                paidAmount = Math.round(discountedAmount * 0.5);
                                histories.push({
                                    method: 'cash',
                                    amount: paidAmount,
                                    note: 'Đóng trước một phần',
                                    date: new Date(year, month, Math.floor(Math.random() * 5) + 1)
                                });
                            }
                        } else {
                            // Current month: mostly pending
                            const rand = Math.random();
                            if (rand < 0.3) {
                                status = 'paid';
                                paidAmount = discountedAmount;
                                histories.push({
                                    method: 'bank_transfer',
                                    amount: discountedAmount,
                                    note: 'Thanh toán qua chuyển khoản',
                                    date: new Date(year, month - 1, Math.floor(Math.random() * 5) + 1)
                                });
                            } else {
                                status = 'pending';
                                paidAmount = 0;
                            }
                        }
                    }

                    await this.paymentRepository.save(
                        this.paymentRepository.create({
                            month,
                            year,
                            totalLessons,
                            totalAmount,
                            paidAmount,
                            discountPercent,
                            status,
                            studentId: classStudent.studentId as string,
                            classId: aclass.id,
                            histories
                        }),
                        { listeners: false }
                    );
                }
            }
        }
    }
}
