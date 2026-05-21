import { StudentEntity } from "modules/students/entities/student.entity";
import { Column, CreateDateColumn, DeleteDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from "typeorm";
import { ClassEntity } from "modules/classes/entities/class.entity";
import { Exclude } from "class-transformer";

@Entity('class_student')
export class ClassStudentEntity {
    @PrimaryColumn()
    @Exclude({ toPlainOnly: true })
    studentId: string;

    @PrimaryColumn()
    @Exclude({ toPlainOnly: true })
    classId: string;

    @Column()
    discountPercent: number

    @Column({ default: true })
    isActive: boolean;

    @ManyToOne(() => StudentEntity, (student) => student.classes)
    @JoinColumn({ name: 'studentId' })
    student?: StudentEntity

    @ManyToOne(() => ClassEntity, (aclass) => aclass.students, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn({ name: 'classId' })
    class?: ClassEntity

    @CreateDateColumn({ type: "timestamp" })
    createdAt: Date;

    @UpdateDateColumn({ type: "timestamp" })
    updatedAt: Date;

    @DeleteDateColumn()
    deletedAt?: Date;
}