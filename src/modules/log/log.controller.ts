import { Controller, Get, Param,} from '@nestjs/common';
import { LogService } from './log.service';
import { AuthenticatedUser } from 'nest-keycloak-connect';


@Controller(':organization_id/log')
export class LogController {
    constructor(private logService: LogService){}

    @Get()
    async findAll(
          @Param('organization_id') organization_id: string,
          
    ) {
        return await this.logService.findAll(organization_id);
    }

    @Get('connector/:id')
    async findConnectorLogs(
      @Param('organization_id') organization_id: string,
      @Param('id') id: string,
      @AuthenticatedUser() user: any,
    ) {
      return await this.logService.findConnectorLogs(organization_id, id, user);
    }

    @Get('service/:id')
    async findServiceLogs(
      @Param('organization_id') organization_id: string,
      @Param('id') id: string,
    ) {
      return await this.logService.findServiceLogs(organization_id, id);
    }

    @Get('service')
    async findServicesLogs(
      @Param('organization_id') organization_id: string,
      @AuthenticatedUser() user: any,
    ){
      return await this.logService.findServicesLogs(organization_id, user);
    }

}
