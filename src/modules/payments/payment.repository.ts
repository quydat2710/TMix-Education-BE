import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { PaymentEntity } from "./entities/payment.entity";
import { Between, FindOptionsWhere, In, MoreThan, Repository } from "typeorm";
import { FilterPaymentDto, SortPaymentDto } from "./dto/query-payment.dto";
import { IPaginationOptions } from "utils/types/pagination-options";
import { PaginationResponseDto } from "utils/types/pagination-response.dto";
import { Payment } from "./payment.domain";
import { PaymentMapper } from "./payment.mapper";
import { PayStudentDto } from "./dto/pay-student.dto";
import { I18nService } from "nestjs-i18n";
import { I18nTranslations } from "@/generated/i18n.generated";
import { ClassStudentEntity } from "modules/classes/entities/class-student.entity";
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
        
        // Net amount after discount is what the student actually owes
        const netTotal = entity.totalAmount - (entity.discountPercent * entity.totalAmount / 100);
        const remaining = netTotal - entity.paidAmount;
        const actualAmount = Math.min(+payStudentDto.amount, remaining);
        
        if (actualAmount <= 0) throw new BadRequestException('Payment already completed');
        
        if (Array.isArray(entity.histories)) {
            entity.histories.push({
                amount: actualAmount,
                method: payStudentDto.method,
                note: payStudentDto.note,
                date: new Date()
            })
        }
        payStudentDto.amount = actualAmount;
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

        const refPart = paymentEntity.referenceCode ? ` ${paymentEntity.referenceCode}` : '';
        const content = `${paymentEntity.student.name} ${paymentEntity.class.name}${refPart}`

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
        const logger = new Logger('PaymentWebhook');
        const systemApiKey = this.configService.get('payment.apiKey', { infer: true })

        if (apiKey !== `Apikey ${systemApiKey}`) throw new UnauthorizedException('Please authenticate')

        logger.log(`Webhook: amount=${confirmDto.transferAmount}, type=${confirmDto.transferType}`);

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

        // Strategy 3+4: Single query for all pending/partial payments, then check referenceCode and name
        if (!payment) {
            const removeDiacritics = (str: string) =>
                str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');

            const rawText = `${confirmDto.content || ''} ${confirmDto.description || ''}`;
            const fullTextUpper = rawText.toUpperCase();
            const fullTextNormalized = removeDiacritics(rawText).toUpperCase();

            const pendingPayments = await this.paymentsRepository.find({
                where: [
                    { status: 'pending' },
                    { status: 'partial' }
                ],
                relations: ['student', 'class'],
                order: {
                    year: 'ASC',
                    month: 'ASC'
                }
            });



            const candidatesByName: PaymentEntity[] = [];

            for (const p of pendingPayments) {
                // Strategy 3: Check referenceCode in content
                if (p.referenceCode && fullTextUpper.includes(p.referenceCode.toUpperCase())) {
                    payment = p;

                    break;
                }

                // Strategy 4: Collect all candidates matching student name + class name
                const studentName = removeDiacritics(p.student?.name || '').toUpperCase();
                const className = removeDiacritics(p.class?.name || '').toUpperCase();
                const classNameNoDots = className.replace(/\./g, '');

                if (studentName && className) {
                    const nameMatch = fullTextNormalized.includes(studentName);
                    const classMatch = fullTextNormalized.includes(className) || fullTextNormalized.includes(classNameNoDots);
                    if (nameMatch && classMatch) {
                        candidatesByName.push(p);

                    }
                }
            }

            // Strategy 4: Among candidates, pick the one whose net amount best matches transferAmount
            if (!payment && candidatesByName.length > 0) {
                const transferAmount = confirmDto.transferAmount || 0;
                candidatesByName.sort((a, b) => {
                    const netA = a.totalAmount - (a.discountPercent * a.totalAmount / 100) - a.paidAmount;
                    const netB = b.totalAmount - (b.discountPercent * b.totalAmount / 100) - b.paidAmount;
                    return Math.abs(netA - transferAmount) - Math.abs(netB - transferAmount);
                });
                payment = candidatesByName[0];

            }
        }

        if (!payment) {
            logger.warn(`No payment matched for content="${confirmDto.content}"`);
            return { success: false, message: 'Payment not found for reference code' }
        }

        logger.log(`Payment matched: id=${payment.id}, student=${payment.student?.name}`);

        if (confirmDto && confirmDto.transferType === 'in' && confirmDto.transferAmount > 0) {
            this.handleProcessPayment(payment, {
                amount: confirmDto.transferAmount,
                method: PAYMENT_METHOD.BANK_TRANSFER,
                note: confirmDto.content
            })

            await this.paymentsRepository.save(payment);
            logger.log(`Payment saved successfully: id=${payment.id}`);
        }
        return { success: true, payment }
    }


    /**
     * Generate payment invoices for all active students in a given month.
     * Applies carry-over (bù trừ) from previous month's absences.
     * Called on the 5th of each month via cron or admin trigger.
     */
    async generateInvoicesForMonth(month: number, year: number): Promise<any> {
        // Find existing invoices so we don't create duplicates
        const existingPayments = await this.paymentsRepository.find({
            where: { month, year }
        });
        const existingCombos = new Set(
            existingPayments.map(p => `${p.studentId}-${p.classId}`)
        );

        // Find all active class-student enrollments
        const classStudentRepo = this.paymentsRepository.manager.getRepository(ClassStudentEntity);
        const enrollments: any[] = await classStudentRepo.find({
            where: { isActive: true },
            relations: ['class']
        });

        // ─── Calculate carry-over from previous month ───
        const prevMonth = month === 1 ? 12 : month - 1;
        const prevYear = month === 1 ? year - 1 : year;
        const prevMonthStart = new Date(prevYear, prevMonth - 1, 1);
        const prevMonthEnd = new Date(prevYear, prevMonth, 0, 23, 59, 59, 999);

        // Get all sessions from previous month (for all classes)
        const prevSessions = await this.paymentsRepository.manager
            .getRepository('session')
            .find({
                where: { date: Between(prevMonthStart, prevMonthEnd) },
                select: ['id', 'classId'],
            });

        // Build map: classId -> sessionIds
        const classSessionMap = new Map<string, string[]>();
        for (const s of prevSessions as any[]) {
            const list = classSessionMap.get(s.classId) || [];
            list.push(s.id);
            classSessionMap.set(s.classId, list);
        }

        // Count absences per student per class in previous month
        // carryOverMap: "studentId-classId" -> number of absent sessions
        const carryOverMap = new Map<string, number>();
        for (const [classId, sessionIds] of classSessionMap) {
            if (sessionIds.length === 0) continue;

            const totalSessionCount = sessionIds.length;

            // Count present/late per student
            const presentCounts: any[] = await this.paymentsRepository.manager.query(
                `SELECT "studentId", COUNT(*) as "presentCount"
                 FROM attendance_session
                 WHERE "sessionId" = ANY($1)
                   AND (status = 'present' OR status = 'late')
                 GROUP BY "studentId"`,
                [sessionIds],
            );

            const presentMap = new Map<string, number>();
            for (const row of presentCounts) {
                presentMap.set(row.studentId.toString(), Number(row.presentCount));
            }

            // Get all students who had attendance in these sessions
            const allStudents: any[] = await this.paymentsRepository.manager.query(
                `SELECT DISTINCT "studentId" FROM attendance_session WHERE "sessionId" = ANY($1)`,
                [sessionIds],
            );

            for (const { studentId } of allStudents) {
                const present = presentMap.get(studentId.toString()) || 0;
                const absent = totalSessionCount - present;
                if (absent > 0) {
                    carryOverMap.set(`${studentId}-${classId}`, absent);
                }
            }
        }

        // ─── Generate invoices ───
        const newPayments: PaymentEntity[] = [];

        for (const enrollment of enrollments) {
            const combo = `${enrollment.studentId}-${enrollment.classId}`;
            if (existingCombos.has(combo)) continue;

            const classEntity = enrollment.class;
            if (!classEntity || classEntity.status !== 'active') continue;

            // Estimate lessons in month based on days_of_week
            const daysPerWeek = classEntity.schedule?.days_of_week?.length || 0;
            const estimatedLessons = daysPerWeek * 4;
            const feePerLesson = classEntity.feePerLesson;

            // Calculate carry-over credit from previous month absences
            const absentLastMonth = carryOverMap.get(combo) || 0;
            const carryOverCredit = absentLastMonth * feePerLesson;

            const totalAmount = Math.max(0, (estimatedLessons * feePerLesson) - carryOverCredit);

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
            payments: newPayments,
            message: `Generated ${newPayments.length} new invoices for ${month}/${year}`
        };
    }
}