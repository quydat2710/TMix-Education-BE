import { PaymentEntity } from "@/modules/payments/entities/payment.entity";
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PaymentSeedService } from "./payment-seed.service";
import { ClassEntity } from "modules/classes/entities/class.entity";
import { SessionEntity } from "modules/sessions/entities/session.entity";

@Module({
    imports: [TypeOrmModule.forFeature([PaymentEntity, ClassEntity, SessionEntity])],
    providers: [PaymentSeedService],
    exports: [PaymentSeedService]
})

export class PaymentSeedModule { }
