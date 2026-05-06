import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ClassesService } from 'modules/classes/classes.service';
import { PaymentsService } from 'modules/payments/payments.service';
import { AuditSubscriber } from 'subscribers/audit-log.subscriber';
@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly classesService: ClassesService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async updateClassStatusCron() {
    AuditSubscriber.skipAuditLog = true;
    this.logger.log('Automatically updating class status...');
    await this.classesService.updateClassStatus();
     AuditSubscriber.skipAuditLog = false;
    return 'Class status updated successfully.';
  }

  /**
   * Generate monthly invoices on the 5th of each month at 8:00 AM.
   * - Calculates estimated lessons based on class schedule
   * - Applies carry-over credit from previous month absences
   * - Sends notification to each parent with invoice details
   */
  @Cron('0 8 5 * *')
  async generateMonthlyInvoicesCron() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    this.logger.log(`[Cron] Generating invoices for ${month}/${year}...`);

    try {
      const result = await this.paymentsService.generateInvoices(month, year);
      this.logger.log(`[Cron] Invoice generation complete: ${result.generated} invoices created for ${month}/${year}`);
      return result;
    } catch (error) {
      this.logger.error(`[Cron] Invoice generation failed for ${month}/${year}: ${error.message}`);
    }
  }

  async updateClassStatusManual() {
    this.logger.log('Manually updating class status...');
    await this.classesService.updateClassStatus();
    return 'Class status updated successfully.';
  }
}
