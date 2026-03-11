import { SessionEntity } from "@/modules/sessions/entities/session.entity";
import { AttendanceSessionEntity } from "@/modules/sessions/entities/attendance-session.entity";
import { ClassEntity } from "modules/classes/entities/class.entity";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

@Injectable()
export class SessionSeedService {
    constructor(
        @InjectRepository(SessionEntity) private sessionRepository: Repository<SessionEntity>,
        @InjectRepository(AttendanceSessionEntity) private attendanceRepository: Repository<AttendanceSessionEntity>,
        @InjectRepository(ClassEntity) private classRepository: Repository<ClassEntity>
    ) { }

    async run() {
        const sessions = await this.sessionRepository.find();
        if (sessions.length > 0) return;

        // Get classes with students (only closed and active classes have sessions)
        const classes = await this.classRepository.find({
            where: [{ status: 'closed' }, { status: 'active' }],
            relations: ['students', 'students.student']
        });

        const statuses: ('present' | 'absent' | 'late')[] = ['present', 'absent', 'late'];
        const notes = [
            null, null, null, null, null, null, null, null,
            'Đến muộn 5 phút', 'Nghỉ có phép', 'Bị ốm', 'Gia đình có việc',
            'Quên sách vở', 'Đến muộn 10 phút'
        ];

        for (const aclass of classes) {
            if (!aclass.students || aclass.students.length === 0) continue;

            const schedule = aclass.schedule;
            if (!schedule) continue;

            const startDate = new Date(schedule.start_date);
            const endDate = new Date(schedule.end_date);
            const daysOfWeek = schedule.days_of_week.map(d => parseInt(d));

            // For active classes, only create sessions up to "today" (2026-03-10)
            const today = new Date('2026-03-10');
            const sessionEndDate = aclass.status === 'active'
                ? (endDate < today ? endDate : today)
                : endDate;

            // Generate session dates based on schedule
            const sessionDates: Date[] = [];
            const currentDate = new Date(startDate);

            while (currentDate <= sessionEndDate) {
                const dayOfWeek = currentDate.getDay();
                if (daysOfWeek.includes(dayOfWeek)) {
                    sessionDates.push(new Date(currentDate));
                }
                currentDate.setDate(currentDate.getDate() + 1);
            }

            // Create sessions and attendance records
            for (const sessionDate of sessionDates) {
                const session = await this.sessionRepository.save(
                    this.sessionRepository.create({
                        classId: aclass.id,
                        date: sessionDate
                    })
                );

                // Create attendance for each student in the class
                for (const classStudent of aclass.students) {
                    if (!classStudent.student) continue;

                    // 80% present, 10% late, 10% absent
                    const rand = Math.random();
                    let status: 'present' | 'absent' | 'late';
                    if (rand < 0.80) status = 'present';
                    else if (rand < 0.90) status = 'late';
                    else status = 'absent';

                    const note = status !== 'present'
                        ? notes[Math.floor(Math.random() * notes.length)]
                        : null;

                    await this.attendanceRepository.save(
                        this.attendanceRepository.create({
                            sessionId: session.id,
                            studentId: classStudent.studentId as string,
                            status,
                            note
                        })
                    );
                }
            }
        }
    }
}
