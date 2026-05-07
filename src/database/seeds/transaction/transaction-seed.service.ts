import { TransactionEntity } from "@/modules/transactions/entities/transaction.entity";
import { TransactionCategoryEntity } from "@/modules/transactions/entities/transaction-category.entity";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

@Injectable()
export class TransactionSeedService {
    constructor(
        @InjectRepository(TransactionEntity) private transactionRepository: Repository<TransactionEntity>,
        @InjectRepository(TransactionCategoryEntity) private categoryRepository: Repository<TransactionCategoryEntity>
    ) { }

    async run() {
        // Seed categories first
        let categories = await this.categoryRepository.find();
        if (categories.length === 0) {
            const categoryData = [
                { type: 'revenue', name: 'Học phí' },
                { type: 'revenue', name: 'Phí thi thử' },
                { type: 'revenue', name: 'Bán tài liệu' },
                { type: 'expense', name: 'Lương giáo viên' },
                { type: 'expense', name: 'Thuê phòng học' },
                { type: 'expense', name: 'Điện nước' },
                { type: 'expense', name: 'Mua sách giáo khoa' },
                { type: 'expense', name: 'Văn phòng phẩm' },
                { type: 'expense', name: 'Bảo trì thiết bị' },
            ];

            for (const cat of categoryData) {
                await this.categoryRepository.save(
                    this.categoryRepository.create(cat)
                );
            }
            categories = await this.categoryRepository.find();
        }

        // Seed transactions
        const transactions = await this.transactionRepository.find();
        if (transactions.length > 0) return;

        const revenueCategories = categories.filter(c => c.type === 'revenue');
        const expenseCategories = categories.filter(c => c.type === 'expense');

        const transactionData = [
            // March 2026
            { amount: 45000000, description: 'Thu học phí tháng 3/2026 - các lớp active', date: '2026-03-10', categoryType: 'revenue', categoryName: 'Học phí' },
            { amount: 12000000, description: 'Thanh toán lương GV tháng 2/2026', date: '2026-03-05', categoryType: 'expense', categoryName: 'Lương giáo viên' },
            { amount: 8000000, description: 'Thuê phòng học tháng 3/2026', date: '2026-03-02', categoryType: 'expense', categoryName: 'Thuê phòng học' },
            { amount: 2500000, description: 'Tiền điện nước tháng 2/2026', date: '2026-03-08', categoryType: 'expense', categoryName: 'Điện nước' },
            { amount: 3500000, description: 'Mua sách giáo trình Oxford cho lớp 6, 7', date: '2026-03-15', categoryType: 'expense', categoryName: 'Mua sách giáo khoa' },
            { amount: 1500000, description: 'Phí thi thử IELTS Mock Test tháng 3', date: '2026-03-20', categoryType: 'revenue', categoryName: 'Phí thi thử' },
            { amount: 800000, description: 'Mua giấy in, bút, phấn', date: '2026-03-12', categoryType: 'expense', categoryName: 'Văn phòng phẩm' },

            // April 2026
            { amount: 48000000, description: 'Thu học phí tháng 4/2026 - các lớp active', date: '2026-04-05', categoryType: 'revenue', categoryName: 'Học phí' },
            { amount: 15000000, description: 'Thanh toán lương GV tháng 3/2026', date: '2026-04-03', categoryType: 'expense', categoryName: 'Lương giáo viên' },
            { amount: 8000000, description: 'Thuê phòng học tháng 4/2026', date: '2026-04-01', categoryType: 'expense', categoryName: 'Thuê phòng học' },
            { amount: 2800000, description: 'Tiền điện nước tháng 3/2026', date: '2026-04-10', categoryType: 'expense', categoryName: 'Điện nước' },
            { amount: 2000000, description: 'Bán tài liệu ôn thi cho học sinh lớp 9, 12', date: '2026-04-15', categoryType: 'revenue', categoryName: 'Bán tài liệu' },
            { amount: 1200000, description: 'Sửa máy chiếu phòng C303', date: '2026-04-20', categoryType: 'expense', categoryName: 'Bảo trì thiết bị' },

            // May 2026
            { amount: 42000000, description: 'Thu học phí tháng 5/2026 - các lớp active (chưa đủ)', date: '2026-05-05', categoryType: 'revenue', categoryName: 'Học phí' },
            { amount: 15500000, description: 'Thanh toán lương GV tháng 4/2026', date: '2026-05-02', categoryType: 'expense', categoryName: 'Lương giáo viên' },
            { amount: 8000000, description: 'Thuê phòng học tháng 5/2026', date: '2026-05-01', categoryType: 'expense', categoryName: 'Thuê phòng học' },
            { amount: 2600000, description: 'Tiền điện nước tháng 4/2026', date: '2026-05-08', categoryType: 'expense', categoryName: 'Điện nước' },
            { amount: 4200000, description: 'Mua sách Cambridge IELTS 18, 19 cho lớp luyện thi', date: '2026-05-06', categoryType: 'expense', categoryName: 'Mua sách giáo khoa' },
            { amount: 1800000, description: 'Phí thi thử IELTS Mock Test tháng 5', date: '2026-05-09', categoryType: 'revenue', categoryName: 'Phí thi thử' },
            { amount: 950000, description: 'Mua mực in, giấy A4', date: '2026-05-04', categoryType: 'expense', categoryName: 'Văn phòng phẩm' },

            // June 2026 (partial - up to demo date)
            { amount: 50000000, description: 'Thu học phí tháng 6/2026 - các lớp active', date: '2026-06-05', categoryType: 'revenue', categoryName: 'Học phí' },
            { amount: 16000000, description: 'Thanh toán lương GV tháng 5/2026', date: '2026-06-03', categoryType: 'expense', categoryName: 'Lương giáo viên' },
            { amount: 8000000, description: 'Thuê phòng học tháng 6/2026', date: '2026-06-01', categoryType: 'expense', categoryName: 'Thuê phòng học' },
            { amount: 3000000, description: 'Tiền điện nước tháng 5/2026', date: '2026-06-08', categoryType: 'expense', categoryName: 'Điện nước' },
        ];

        for (const tx of transactionData) {
            const category = categories.find(c => c.name === tx.categoryName);
            if (!category) continue;

            await this.transactionRepository.save(
                this.transactionRepository.create({
                    amount: tx.amount,
                    description: tx.description,
                    transactionAt: new Date(tx.date),
                    category
                })
            );
        }
    }
}
