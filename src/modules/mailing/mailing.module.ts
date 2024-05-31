import { Module } from '@nestjs/common';
import { MailingService } from './mailing.service';
import { MailingController } from './mailing.controller';
import {MailerModule} from "@nestjs-modules/mailer";
import { OrganizationModule } from '../organization/organization.module';
import {Configuration} from "../../config/Configuration";


@Module({
  imports:[MailerModule.forRoot(Configuration.getSmtpConfiguration()),
           OrganizationModule],
  controllers: [MailingController],
  providers: [MailingService],
  exports:[MailingService]
})
export class MailingModule {}
