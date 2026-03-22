import { Injectable } from '@nestjs/common';
import { PaymentRepository } from './payment.repository';
import { FilterPaymentDto, SortPaymentDto } from './dto/query-payment.dto';
import { IPaginationOptions } from 'utils/types/pagination-options';
import { PaginationResponseDto } from 'utils/types/pagination-response.dto';
import { Payment } from './payment.domain';
import { PayStudentDto } from './dto/pay-student.dto';
import { SessionEntity } from 'modules/sessions/entities/session.entity';
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

  autoUpdatePaymentRecord(session: SessionEntity) {
    return this.paymentRepository.autoUpdatePaymentRecord(session)
  }

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

    // Notify admins about payment confirmation
    try {
      await this.notificationsService.sendToRole('admin', {
        type: NotificationType.PAYMENT_SUCCESS,
        title: 'Xác nhận thanh toán',
        message: `Một giao dịch thanh toán đã được xác nhận qua ngân hàng.`,
        link: '/admin/statistics/financial',
      });
    } catch (e) {
      this.logger.warn(`Failed to send confirm notification: ${e.message}`);
    }

    return result;
  }

  generateInvoices(month: number, year: number) {
    return this.paymentRepository.generateInvoicesForMonth(month, year)
  }

}
