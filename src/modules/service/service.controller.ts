import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseInterceptors,
  ClassSerializerInterceptor,
  InternalServerErrorException,
} from '@nestjs/common';
import { ServiceService } from './service.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { ServicesUpDTO } from './dto/services-up.dto';
import { ServicesDownDTO } from './dto/service-down.dto';
import { AuthenticatedUser, Roles } from 'nest-keycloak-connect';

@UseInterceptors(ClassSerializerInterceptor)
@Controller(':organization_id/service')
export class ServiceController {
  constructor(private readonly serviceService: ServiceService) {}

  @Roles({ roles: ['realm:admin'] })
  @Post()
  async create(
    @Param('organization_id') organization_id: string,
    @Body() createServiceDto: CreateServiceDto,
  ) {
    return await this.serviceService.create(organization_id, createServiceDto);
  }

  @Patch(':id')
  async update(
    @Param('organization_id') organization_id: string,
    @Param('id') id: string,
    @Body() createServiceDto: CreateServiceDto,
  ) {
    return await this.serviceService.update(
      organization_id,
      id,
      createServiceDto,
    );
  }

  @Roles({ roles: ['realm:admin'] })
  @Delete(':id')
  async delete(
    @Param('organization_id') organization_id: string,
    @Param('id') id: string,
  ) {
    await this.serviceService.delete(organization_id, id);
  }

  @Get()
  async findAll(
    @Param('organization_id') organization_id: string,
    @AuthenticatedUser() user: any,
  ) {
    const services = await this.serviceService.findAll(organization_id, user);
    return await this.serviceService.appendStatusToServices(services);
  }

  @Get(':id')
  async findOne(
    @Param('organization_id') organization_id: string,
    @Param('id') id: string,
  ) {
    return await this.serviceService.findOne(organization_id, id);
  }

  @Post('up')
  async servicesUp(
    @Param('organization_id') organization_id: string,
    @Body() servicesUpDto: ServicesUpDTO,
    @AuthenticatedUser() user:any
  ) {
    try {
      return await this.serviceService.servicesUp(
        organization_id,
        servicesUpDto,
          user
      );
    } catch (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  @Post('down')
  async servicesDown(
    @Param('organization_id') organization_id: string,
    @Body() servicesDownDto: ServicesDownDTO,
  ) {
    try {
      return await this.serviceService.servicesDown(
        organization_id,
        servicesDownDto,
      );
    } catch (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  @Get(':id/snapshot')
  async getSnapshots(
    @Param('organization_id') organization_id: string,
    @Param('id') id: string,
  ) {
    return await this.serviceService.getServiceSnapshots(organization_id, id);
  }
  
  @Roles({ roles: ['realm:admin'] })
  @Post('reviveSnapshots')
  async revive(@Param('organization_id') organization_id: string) {
    await this.serviceService.fromFSToDB(organization_id);
  }

  @Post('renewSSL')
  async renewSSL(@Param('organization_id') organization_id: string) {
    await this.serviceService.renewSSL(organization_id);
  }
}
