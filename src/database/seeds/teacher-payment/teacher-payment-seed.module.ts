import { TeacherPaymentEntity } from "@/modules/teacher-payments/entities/teacher-payment.entity";
import { ClassEntity } from "modules/classes/entities/class.entity";
import { SessionEntity } from "modules/sessions/entities/session.entity";
import { TeacherEntity } from "modules/teachers/entities/teacher.entity";
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TeacherPaymentSeedService } from "./teacher-payment-seed.service";

@Module({
    imports: [TypeOrmModule.forFeature([TeacherPaymentEntity, ClassEntity, SessionEntity, TeacherEntity])],
    providers: [TeacherPaymentSeedService],
    exports: [TeacherPaymentSeedService]
})
export class TeacherPaymentSeedModule { }
