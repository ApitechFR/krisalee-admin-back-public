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
} from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { Roles } from 'nest-keycloak-connect/keycloak-connect.module';

@UseInterceptors(ClassSerializerInterceptor)
@Roles({ roles: ['realm:admin'] })
@Controller()
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Post()
  async create(@Body() createOrganizationDto: CreateOrganizationDto) {
    return await this.organizationService.create(createOrganizationDto);
  }

  @Get()
  async findAll() {
    return await this.organizationService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.organizationService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateOrganizationDto: UpdateOrganizationDto,
  ) {
    return this.organizationService.update(id, updateOrganizationDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.organizationService.remove(id);
  }

  @Get('many/:ids')
  findByIds(@Param('ids') ids: string[]) {
    return this.organizationService.findByIds(ids);
  }
}
