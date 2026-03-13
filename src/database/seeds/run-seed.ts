import { NestFactory } from '@nestjs/core';
import { RoleSeedService } from './role/role-seed.service';
import { AdminUserSeedService } from './admin/admin-user-seed.service';
import { SeedModule } from './seed.module';
import { ClassSeedService } from './class/class-seed.service';
import { StudentSeedService } from './student/student-seed.service';
import { TeacherSeedService } from './teacher/teacher-seed.service';
import { ParentSeedService } from './parent/parent-seed.service';
import { MenuSeedService } from './menu/menu-seed.service';
import { PermissionSeedService } from './permission/permission-seed.service';
import { SessionSeedService } from './session/session-seed.service';
import { PaymentSeedService } from './payment/payment-seed.service';
import { TestSeedService } from './test/test-seed.service';
import { TransactionSeedService } from './transaction/transaction-seed.service';
import { TeacherPaymentSeedService } from './teacher-payment/teacher-payment-seed.service';
import { AuditSubscriber } from 'subscribers/audit-log.subscriber';

const runSeed = async () => {
    const app = await NestFactory.create(SeedModule);
    AuditSubscriber.skipAuditLog = true;

    // run seeds in order (respecting dependencies)
    console.log('Seeding roles...');
    await app.get(RoleSeedService).run();

    console.log('Seeding admin user...');
    await app.get(AdminUserSeedService).run();

    console.log('Seeding students...')
    await app.get(StudentSeedService).run();

    console.log('Seeding teachers...')
    await app.get(TeacherSeedService).run();

    console.log('Seeding classes...');
    await app.get(ClassSeedService).run();

    console.log('Seeding parents...')
    await app.get(ParentSeedService).run();

    console.log('Seeding menus...')
    await app.get(MenuSeedService).run();

    console.log('Seeding permissions...')
    await app.get(PermissionSeedService).run();

    console.log('Seeding sessions & attendance...')
    await app.get(SessionSeedService).run();

    console.log('Seeding payments...')
    await app.get(PaymentSeedService).run();

    console.log('Seeding teacher payments...')
    await app.get(TeacherPaymentSeedService).run();

    console.log('Seeding tests & attempts...')
    await app.get(TestSeedService).run();

    console.log('Seeding transactions...')
    await app.get(TransactionSeedService).run();

    console.log('Seeding completed successfully!');
    await app.close();
};

void runSeed();
