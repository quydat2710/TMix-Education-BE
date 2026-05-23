import { Injectable } from '@nestjs/common';
import { PaymentRepository } from './payment.repository';
import { FilterPaymentDto, SortPaymentDto } from './dto/query-payment.dto';
import { IPaginationOptions } from 'utils/types/pagination-options';
import { PaginationResponseDto } from 'utils/types/pagination-response.dto';
import { Payment } from './payment.domain';
import { PayStudentDto } from './dto/pay-student.dto';
import { GetQRDto } from './dto/get-QR.dto';
import { ConfirmDto } from './dto/confirm.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { Logger } from '@nestjs/common';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private paymentRepository: PaymentRepository,
    private notificationsService: NotificationsService,
  ) { }

  getAllPayments(
    { filterOptions, sortOptions, paginationOptions }
      : { filterOptions: FilterPaymentDto, sortOptions: SortPaymentDto[], paginationOptions: IPaginationOptions })
    : Promise<PaginationResponseDto<Payment>> {
    return this.paymentRepository.getAllPayments({ filterOptions, sortOptions, paginationOptions })
  }

  async payStudent(paymentId: Payment['id'], payStudentDto: PayStudentDto) {
    const result = await this.paymentRepository.payStudent(paymentId, payStudentDto);

    // Notify admins about manual payment
    try {
      await this.notificationsService.sendToRole('admin', {
        type: NotificationType.PAYMENT_SUCCESS,
        title: 'Thanh toán thủ công',
        message: `Một khoản học phí đã được ghi nhận thanh toán thủ công.`,
        link: '/admin/statistics/financial',
      });

      // Notify parent about successful payment
      if (result?.student?.id) {
        const amount = payStudentDto.amount?.toLocaleString('vi-VN') || '0';
        await this.notificationsService.sendToParentOfStudent(result.student.id.toString(), {
          type: NotificationType.PAYMENT_SUCCESS,
          title: 'Thanh toán thành công',
          message: `Đã nhận thanh toán ${amount}đ cho con bạn. Cảm ơn quý phụ huynh!`,
          link: '/parent/payments',
        });
      }
    } catch (e) {
      this.logger.warn(`Failed to send payment notification: ${e.message}`);
    }

    return result;
  }

  getQR(getQRDto: GetQRDto) {
    return this.paymentRepository.getQR(getQRDto)
  }

  async confirmPayment(confirmDto: ConfirmDto, apiKey: string) {
    const result = await this.paymentRepository.confirmPayment(confirmDto, apiKey);

    // Notify admins and parent about payment confirmation
    try {
      await this.notificationsService.sendToRole('admin', {
        type: NotificationType.PAYMENT_SUCCESS,
        title: 'Xác nhận thanh toán',
        message: `Một giao dịch thanh toán đã được xác nhận qua ngân hàng.`,
        link: '/admin/statistics/financial',
      });

      // Notify parent about successful bank transfer
      if (result?.success && result?.payment?.studentId) {
        const amount = confirmDto.transferAmount?.toLocaleString('vi-VN') || '0';
        await this.notificationsService.sendToParentOfStudent(result.payment.studentId, {
          type: NotificationType.PAYMENT_SUCCESS,
          title: 'Thanh toán thành công',
          message: `Đã nhận thanh toán ${amount}đ qua chuyển khoản cho con bạn. Cảm ơn quý phụ huynh!`,
          link: '/parent/payments',
        });
      }
    } catch (e) {
      this.logger.warn(`Failed to send confirm notification: ${e.message}`);
    }

    return result;
  }

  async generateInvoices(month: number, year: number) {
    const result = await this.paymentRepository.generateInvoicesForMonth(month, year);

    // Notify parents about new invoices
    if (result?.payments?.length > 0) {
      for (const payment of result.payments) {
        try {
          const amount = payment.totalAmount?.toLocaleString('vi-VN') || '0';
          await this.notificationsService.sendToParentOfStudent(payment.studentId, {
            type: NotificationType.NEW_INVOICE,
            title: `Học phí tháng ${month}/${year}`,
            message: `Học phí tháng ${month} của con bạn là ${amount}đ. Vui lòng thanh toán trước ngày 10.`,
            link: '/parent/payments',
          });
        } catch (e) {
          this.logger.warn(`Failed to send invoice notification for student ${payment.studentId}: ${e.message}`);
        }
      }
    }

    return result;
  }

  async generateInvoiceForNewStudents(
    classId: string,
    students: { studentId: string; discountPercent: number }[],
  ) {
    const result = await this.paymentRepository.generateInvoiceForNewStudents(classId, students);

    // Notify parents about new pro-rata invoices
    if (result?.payments?.length > 0) {
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      for (const payment of result.payments) {
        try {
          const amount = payment.totalAmount?.toLocaleString('vi-VN') || '0';
          await this.notificationsService.sendToParentOfStudent(payment.studentId, {
            type: NotificationType.NEW_INVOICE,
            title: `Học phí lớp ${result.className}`,
            message: `Con bạn vừa được thêm vào lớp ${result.className}. Học phí tháng ${currentMonth}/${currentYear} là ${amount}đ (${payment.totalLessons} buổi còn lại). Vui lòng thanh toán sớm.`,
            link: '/parent/payments',
          });
        } catch (e) {
          this.logger.warn(`Failed to send new-student invoice notification for student ${payment.studentId}: ${e.message}`);
        }
      }

      this.logger.log(`Sent ${result.payments.length} invoice notifications for new students in class ${classId}`);
    }

    return result;
  }
}
