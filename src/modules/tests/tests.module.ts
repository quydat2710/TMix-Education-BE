import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TestsController } from './tests.controller';
import { TestsService } from './tests.service';
import { TestEntity } from './entities/test.entity';
import { TestAttemptEntity } from './entities/test-attempt.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([TestEntity, TestAttemptEntity]),
    ],
    controllers: [TestsController],
    providers: [TestsService],
    exports: [TestsService],
})
export class TestsModule { }
