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
import { ConnectorService } from './connector.service';
import { CreateConnectorDto } from './dto/create-connector.dto';
import { RunConnectorDto } from './dto/run-connector.dto';
import { UpdateConnectorDto } from './dto/update-connector.dto';
import { AuthenticatedUser } from 'nest-keycloak-connect';

@UseInterceptors(ClassSerializerInterceptor)
@Controller(':organization_id/connector')
export class ConnectorController {
  constructor(private readonly connectorService: ConnectorService) {}

  @Post()
  async create(
    @Param('organization_id') organization_id: string,
    @Body() createConnectorDto: CreateConnectorDto,
  ) {
    return await this.connectorService.create(
      organization_id,
      createConnectorDto,
    );
  }

  @Get()
  async findAll(
    @Param('organization_id') organization_id: string,
    @AuthenticatedUser() user: any,
  ) {
    return await this.connectorService.findAll(organization_id, user);
  }

  @Get(':id')
  async findOne(
    @Param('organization_id') organization_id: string,
    @Param('id') id: string,
  ) {
    return (await this.connectorService.findOne(id, organization_id))
      .clientConnector;
  }

  @Patch(':id')
  async update(
    @Param('organization_id') organization_id: string,
    @Param('id') id: string,
    @Body() updateConnectorDto: UpdateConnectorDto,
  ) {
    return await this.connectorService.update(
      id,
      organization_id,
      updateConnectorDto,
    );
  }

  @Delete(':id')
  async remove(
    @Param('organization_id') organization_id: string,
    @Param('id') id: string,
  ) {
    await this.connectorService.remove(organization_id, id);
  }

  @Post(':id/up')
  async runConnector(
    @Param('id') id: string,
    @Param('organization_id') organization_id: string,
    @Body() runConnectorDto: RunConnectorDto,
  ) {
    return await this.connectorService.runConnector(
      id,
      organization_id,
      runConnectorDto,
    );
  }

  @Post(':id/organization/:org_id')
  async addOrgToConnector(
    @Param('organization_id') organization_id: string,
    @Param('id') id: string,
    @Param('org_id') org_id: string,
  ) {
    return await this.connectorService.addOrgToConnector(
      organization_id,
      id,
      org_id,
    );
  }

  @Delete(':id/organization/:org_id')
  async removeOrgFromConnector(
    @Param('organization_id') organization_id: string,
    @Param('id') id: string,
    @Param('org_id') org_id: string,
  ) {
    return await this.connectorService.removeOrgFromConnector(
      organization_id,
      id,
      org_id,
    );
  }
}
