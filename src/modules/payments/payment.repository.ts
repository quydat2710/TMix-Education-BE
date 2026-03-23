import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { PaymentEntity } from "./entities/payment.entity";
import { Between, FindOptionsWhere, In, MoreThan, Repository } from "typeorm";
import dayjs from "@/utils/dayjs.config";
import { FilterPaymentDto, SortPaymentDto } from "./dto/query-payment.dto";
import { IPaginationOptions } from "utils/types/pagination-options";
import { PaginationResponseDto } from "utils/types/pagination-response.dto";
import { Payment } from "./payment.domain";
import { PaymentMapper } from "./payment.mapper";
import { PayStudentDto } from "./dto/pay-student.dto";
import { I18nService } from "nestjs-i18n";
import { I18nTranslations } from "@/generated/i18n.generated";
import { SessionEntity } from "modules//sessions/entities/session.entity";
import { GetQRDto } from "./dto/get-QR.dto";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { AllConfigType } from "config/config.type";
import { catchError, firstValueFrom, Observable } from "rxjs";
import { ConfirmDto } from "./dto/confirm.dto";
import { PAYMENT_METHOD } from "utils/payments/constant";

@Injectable()
export class PaymentRepository {
    constructor(
        @InjectRepository(PaymentEntity) private paymentsRepository: Repository<PaymentEntity>,
        private i18nService: I18nService<I18nTranslations>,
        private readonly httpService: HttpService,
        private readonly configService: ConfigService<AllConfigType>,
    ) { }

    async autoUpdatePaymentRecord(session: SessionEntity) {
        const month = dayjs(session.date).month() + 1;
        const year = dayjs(session.date).year();
        const classId = session.class.id
        const paymentEntities = await this.paymentsRepository.find({
            where: { month, year, classId },
            relations: ['class']
        })

        if (paymentEntities.length <= 0) {
            const paymentRecords = [];
            session.attendances.filter(student => {
                let totalLessons = 0;
                let discountPercent = 0;
                let totalAmount = 0;
                if (student.status === 'present' || student.status === 'late') totalLessons++;
                session.class.students.map(item => {
                    if (item.studentId === student.student.id) {
                        discountPercent = item.discountPercent;
                        totalAmount = totalLessons * session.class.feePerLesson
                    }
                })
                if (totalLessons <= 0) return false;
                paymentRecords.push(this.paymentsRepository.create({
                    month,
                    year,
                    totalLessons,
                    totalAmount,
                    discountPercent,
                    studentId: student.studentId.toString(),
                    classId: classId.toString()
                }))
            })
            return await this.paymentsRepository.save(paymentRecords)
        }
        else if (paymentEntities.length > 0) {
            for (const student of session.attendances) {
                paymentEntities.map(item => {
                    if (item.studentId === student.student.id && student.isModified === true) {
                        item.totalLessons =
                            student.status === 'present' || student.status === 'late' ? item.totalLessons + 1 : item.totalLessons;
                        item.totalLessons =
                            student.status === 'absent' && item.totalLessons > 0 ? item.totalLessons - 1 : item.totalLessons;
                    }
                })
            }
            return await this.paymentsRepository.save(paymentEntities)
        }
    }

    async getAllPayments(
        { filterOptions, sortOptions, paginationOptions }
            : { filterOptions: FilterPaymentDto, sortOptions: SortPaymentDto[], paginationOptions: IPaginationOptions })
        : Promise<PaginationResponseDto<Payment>> {
        const where: FindOptionsWhere<PaymentEntity> = {};

        if (filterOptions?.studentId) where.studentId = filterOptions.studentId;

        if (filterOptions?.classId) where.classId = filterOptions.classId;

        if (filterOptions?.status) where.status = filterOptions.status;

        if (filterOptions?.month) where.month = filterOptions.month;

        if (filterOptions?.year) where.year = filterOptions.year;

        if (filterOptions?.startMonth && filterOptions?.endMonth) {
            where.month = Between(filterOptions.startMonth, filterOptions.endMonth);
            where.year = filterOptions.year;
        }

        const [entities, total] = await this.paymentsRepository.findAndCount({
            where: { ...where, totalAmount: MoreThan(0) },
            relations: ['class', 'student.classes'],
            skip: (paginationOptions.page - 1) * paginationOptions.limit || 0,
            take: paginationOptions.limit,
            order: sortOptions.length > 0
                ? sortOptions.reduce((acc, sort) => {
                    acc[sort.orderBy] = sort.order;
                    return acc;
                }, {})
                : { year: 'DESC', month: 'DESC' },
        })

        const totalItems = total;
        const totalPages = Math.ceil(totalItems / paginationOptions.limit) || 1

        return {
            meta: {
                limit: paginationOptions.limit || null,
                page: paginationOptions.page || null,
                totalPages,
                totalItems
            },
            result: entities ? entities.map(item => PaymentMapper.toDomain(item)) : null
        }
    }

    handleProcessPayment(entity: PaymentEntity, payStudentDto: PayStudentDto) {
        if (entity.totalLessons === 0) throw new BadRequestException('No lessons');
        if (entity.status === 'paid') throw new BadRequestException('Fully paid');
        if (entity.paidAmount + +payStudentDto.amount > entity.totalAmount) throw new BadRequestException('Exceeds remaning balance')
        if (Array.isArray(entity.histories)) {
            entity.histories.push({
                amount: payStudentDto.amount,
                method: payStudentDto.method,
                note: payStudentDto.note,
                date: new Date()
            })
        }
    }

    async payStudent(paymentId: Payment['id'], payStudentDto: PayStudentDto) {
        const entity = await this.paymentsRepository.findOne({
            where: { id: paymentId }
        })
        this.handleProcessPayment(entity, payStudentDto);
        await this.paymentsRepository.save(entity)
        return PaymentMapper.toDomain(entity)
    }

    async getQR(getQrDto: GetQRDto): Promise<any> {
        const bank = this.configService.get('payment.bank', { infer: true });
        const acc = this.configService.get('payment.acc', { infer: true });
        const paymentEntity = await this.paymentsRepository.findOne({
            where: { id: getQrDto.paymentId },
            relations: { student: true, class: true }
        })

        if (!paymentEntity) throw new NotFoundException('Payment not found');

        const content = `${paymentEntity.student.name} ${paymentEntity.class.name} ${paymentEntity.referenceCode}`

        if (getQrDto && (!getQrDto.amount || getQrDto.amount <= 0)) {
            throw new BadRequestException('Số tiền phải là số nguyên lớn hơn 0')
        }

        const encodedContent = encodeURIComponent(content);
        const qrDataURL = `https://qr.sepay.vn/img?acc=${acc}&bank=${bank}&amount=${getQrDto.amount}&des=${encodedContent}&template=compact`;

        return {
            qrDataURL,
            qrUrl: qrDataURL,
            amount: getQrDto.amount,
            description: content,
            studentName: paymentEntity.student.name,
            referenceCode: paymentEntity.referenceCode,
            class: {
                name: paymentEntity.class.name,
                grade: paymentEntity.class.grade,
                section: paymentEntity.class.section,
                year: paymentEntity.class.year
            }
        }
    }



    async confirmPayment(confirmDto: ConfirmDto, apiKey: string) {
        const systemApiKey = this.configService.get('payment.apiKey', { infer: true })

        if (apiKey !== `Apikey ${systemApiKey}`) throw new UnauthorizedException('Please authenticate')

        let payment: PaymentEntity | null = null;

        // Strategy 1: Use SePay's auto-detected code field
        if (confirmDto.code) {
            payment = await this.paymentsRepository.findOne({
                where: { referenceCode: confirmDto.code }
            });
        }

        // Strategy 2: Try last word of content (original approach)
        if (!payment && confirmDto.content) {
            const splitedContent = confirmDto.content.split(' ');
            const lastWord = splitedContent.at(splitedContent.length - 1);
            if (lastWord) {
                payment = await this.paymentsRepository.findOne({
                    where: { referenceCode: lastWord }
                });
            }
        }

        // Strategy 3: Search all pending payments and check if their referenceCode appears in the content/description
        if (!payment) {
            const fullText = `${confirmDto.content || ''} ${confirmDto.description || ''}`.toUpperCase();
            const pendingPayments = await this.paymentsRepository.find({
                where: [
                    { status: 'pending' },
                    { status: 'partial' }
                ]
            });

            for (const p of pendingPayments) {
                if (p.referenceCode && fullText.includes(p.referenceCode.toUpperCase())) {
                    payment = p;
                    break;
                }
            }
        }

        // Strategy 4: Match by student name + class name in content (banks often reformat QR content)
        if (!payment) {
            const fullText = `${confirmDto.content || ''} ${confirmDto.description || ''}`.toUpperCase();
            const pendingPayments = await this.paymentsRepository.find({
                where: [
                    { status: 'pending' },
                    { status: 'partial' }
                ],
                relations: ['student', 'class']
            });

            for (const p of pendingPayments) {
                const studentName = p.student?.name?.toUpperCase() || '';
                const className = p.class?.name?.toUpperCase() || '';
                // Check if both student name and class name appear in the transfer content
                if (studentName && className && fullText.includes(studentName) && fullText.includes(className)) {
                    payment = p;
                    console.log('[Webhook] Strategy 4 matched by student+class name:', studentName, className);
                    break;
                }
            }
        }

        if (!payment) {
            console.log('[Webhook] Payment not found. Content:', confirmDto.content, '| Code:', confirmDto.code, '| Description:', confirmDto.description);
            return { success: false, message: 'Payment not found for reference code' }
        }

        if (confirmDto && confirmDto.transferType === 'in' && confirmDto.transferAmount > 0) {
            this.handleProcessPayment(payment, {
                amount: confirmDto.transferAmount,
                method: PAYMENT_METHOD.BANK_TRANSFER,
                note: confirmDto.content
            })

            await this.paymentsRepository.save(payment);
            console.log('[Webhook] Payment confirmed! ID:', payment.id, 'Amount:', confirmDto.transferAmount);
        }
        return { success: true }
    }

    /**
     * Generate payment invoices for all active students in a given month
     */
    async generateInvoicesForMonth(month: number, year: number): Promise<any> {
        // Find all classes that have students and are active
        const existingPayments = await this.paymentsRepository.find({
            where: { month, year }
        });

        // Get unique student-class combos that already have invoices
        const existingCombos = new Set(
            existingPayments.map(p => `${p.studentId}-${p.classId}`)
        );

        // Find all active class-student enrollments
        const { EntityManager } = require('typeorm');
        const classStudentRepo = this.paymentsRepository.manager.getRepository('student_class');
        const enrollments = await classStudentRepo.find({
            where: { isActive: true },
            relations: ['class']
        });

        const newPayments: PaymentEntity[] = [];

        for (const enrollment of enrollments) {
            const combo = `${enrollment.studentId}-${enrollment.classId}`;
            if (existingCombos.has(combo)) continue;

            const classEntity = enrollment.class;
            if (!classEntity || classEntity.status !== 'active') continue;

            // Estimate lessons in month based on days_of_week
            const daysPerWeek = classEntity.schedule?.days_of_week?.length || 0;
            const estimatedLessons = daysPerWeek * 4;
            const totalAmount = estimatedLessons * classEntity.feePerLesson;

            if (totalAmount <= 0) continue;

            const payment = this.paymentsRepository.create({
                month,
                year,
                totalLessons: estimatedLessons,
                totalAmount,
                discountPercent: enrollment.discountPercent || 0,
                studentId: enrollment.studentId,
                classId: enrollment.classId
            });

            newPayments.push(payment);
        }

        if (newPayments.length > 0) {
            await this.paymentsRepository.save(newPayments);
        }

        return {
            generated: newPayments.length,
            month,
            year,
            message: `Generated ${newPayments.length} new invoices for ${month}/${year}`
        };
    }
}