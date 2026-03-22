import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AllConfigType } from 'config/config.type';
import { User } from 'modules/users/user.domain';
import { authenticator } from 'otplib';

@Injectable()
export class OtpService {
    constructor(
        private configService: ConfigService<AllConfigType>,
    ) {
        const period = this.configService.get('otp.period', { infer: true }) || 300;
        authenticator.options = {
            digits: 6,
            step: period,  // Time period in seconds (default 300 = 5 minutes)
            window: 1,     // Allow 1 window tolerance (code valid for ~2x period)
        };
    }

    async generateOtp(userId: User['id']): Promise<string> {
        const otp = authenticator.generate(this.configService.get('otp.secret', { infer: true }));
        return otp;
    }

    // Verify OTP code
    verifyOtp(token: string): boolean {
        try {
            const secret = this.configService.get('otp.secret', { infer: true });
            const isValid = authenticator.verify({ token, secret });
            return isValid;
        } catch (error) {
            throw new BadRequestException(error.message);
        }
    }
}
