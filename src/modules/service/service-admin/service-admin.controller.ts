import { Controller, Post } from '@nestjs/common';
import { ServiceService } from '../service.service';
import { Public } from 'nest-keycloak-connect';

@Controller('cron')

export class ServiceAdminController {
    constructor(private readonly serviceService: ServiceService) {}
    
    @Post('downAll')
    @Public()
    async servicesDownAllOrgs(){
        await this.serviceService.handleCron();
    }

    @Post('renewSSL')
    @Public()
    async renewSSL(){
        await this.serviceService.allOrgsRenewSSL();
    }
}
