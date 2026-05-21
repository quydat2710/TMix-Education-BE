import { Module } from "@nestjs/common";
import { MailService } from "./mail.service";
import { MailTransportService } from "./mail-transport.service";

@Module({
    providers: [MailService, MailTransportService],
    exports: [MailService]
})

export class MailModule { };