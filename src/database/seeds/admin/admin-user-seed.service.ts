import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '@/modules/users/entities/user.entity';
import { RoleEntity } from '@/modules/roles/entities/role.entity';
import { RoleEnum } from '@/modules/roles/roles.enum';

const adminUsers = [
    {
        name: 'System Administrator',
        email: 'admin@gmail.com',
        password: 'password123',
        gender: 'Male',
        dayOfBirth: '1990-01-01',
        address: '123 Nguyễn Huệ, Quận 1, TP.HCM',
        phone: '0901000001',
    },
    {
        name: 'Quý Đạt',
        email: 'quydat2710@gmail.com',
        password: 'password123',
        gender: 'Male',
        dayOfBirth: '2003-10-27',
        address: 'Hà Nội',
        phone: '0346857241',
    },
];

@Injectable()
export class AdminUserSeedService {
    constructor(
        @InjectRepository(UserEntity)
        private readonly userRepository: Repository<UserEntity>,
        @InjectRepository(RoleEntity)
        private readonly roleRepository: Repository<RoleEntity>,
    ) { }

    async run() {
        const adminRole = await this.roleRepository.findOne({
            where: { id: RoleEnum.admin }
        });

        if (!adminRole) {
            throw new Error('Admin role not found. Please ensure roles are seeded first.');
        }

        for (const adminData of adminUsers) {
            const existing = await this.userRepository.findOne({
                where: { email: adminData.email }
            });

            if (!existing) {
                const admin = this.userRepository.create({
                    name: adminData.name,
                    email: adminData.email,
                    password: adminData.password,
                    gender: adminData.gender,
                    dayOfBirth: new Date(adminData.dayOfBirth),
                    address: adminData.address,
                    phone: adminData.phone,
                    role: adminRole,
                });

                await this.userRepository.save(admin);
                console.log(`Admin user created: ${adminData.email}`);
            } else {
                console.log(`Admin user already exists: ${adminData.email}`);
            }
        }
    }
}
