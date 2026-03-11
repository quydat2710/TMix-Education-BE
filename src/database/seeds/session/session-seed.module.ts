import { SessionEntity } from "@/modules/sessions/entities/session.entity";
import { AttendanceSessionEntity } from "@/modules/sessions/entities/attendance-session.entity";
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SessionSeedService } from "./session-seed.service";
import { ClassEntity } from "modules/classes/entities/class.entity";

@Module({
    imports: [TypeOrmModule.forFeature([SessionEntity, AttendanceSessionEntity, ClassEntity])],
    providers: [SessionSeedService],
    exports: [SessionSeedService]
})

export class SessionSeedModule { }
