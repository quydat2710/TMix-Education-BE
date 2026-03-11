import { TransactionEntity } from "@/modules/transactions/entities/transaction.entity";
import { TransactionCategoryEntity } from "@/modules/transactions/entities/transaction-category.entity";
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TransactionSeedService } from "./transaction-seed.service";

@Module({
    imports: [TypeOrmModule.forFeature([TransactionEntity, TransactionCategoryEntity])],
    providers: [TransactionSeedService],
    exports: [TransactionSeedService]
})

export class TransactionSeedModule { }
