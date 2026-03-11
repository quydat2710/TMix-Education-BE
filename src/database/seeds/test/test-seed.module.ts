import { TestEntity } from "@/modules/tests/entities/test.entity";
import { TestAttemptEntity } from "@/modules/tests/entities/test-attempt.entity";
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TestSeedService } from "./test-seed.service";
import { ClassEntity } from "modules/classes/entities/class.entity";

@Module({
    imports: [TypeOrmModule.forFeature([TestEntity, TestAttemptEntity, ClassEntity])],
    providers: [TestSeedService],
    exports: [TestSeedService]
})

export class TestSeedModule { }
