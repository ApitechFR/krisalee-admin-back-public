import {Body, Controller, Get, Post} from '@nestjs/common';
import { MailingService } from './mailing.service';
import {AuthenticatedUser} from "nest-keycloak-connect";

@Controller('mailing')
export class MailingController {

  constructor(private readonly mailingService: MailingService) {}

  @Post('authentication')
  sendMail(@AuthenticatedUser() user:any,@Body() body){
    return this.mailingService.sendAuthenticationEmail(user,body);
  }
}
