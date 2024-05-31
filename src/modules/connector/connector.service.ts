import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConnectorStatus } from 'src/enums/connectorStatus';
import { GetCurrentDate } from 'src/helpers/getCurrentDate';
import {
  AddDateNow,
  ThrowDuplicateAttributeError,
} from 'src/helpers/mainHelper';
import { MongoRepository } from 'typeorm';
import { CreateConnectorDto } from './dto/create-connector.dto';
import { RunConnectorDto } from './dto/run-connector.dto';
import { UpdateConnectorDto } from './dto/update-connector.dto';
import { Connector, Organization } from './entities/connector.entity';
import { OrganizationService } from '../organization/organization.service';
import { LdapToKeycloakToMailserver } from './classes/LdapToKeycloakToMailserver';
import { AlertUsers } from './classes/AlertUsers';
import { ImportDocuments } from './classes/ImportDocuments';
import { Configuration } from 'src/config/Configuration';
import { setTimeout } from 'timers/promises';
import { ServiceService } from '../service/service.service';
import { SmsHeader } from 'src/enums/smsHeader';
import { RenewSSL } from './classes/RenewSSL';

@Injectable()
export class ConnectorService {
  constructor(
    @InjectRepository(Connector)
    private connectorRepository: MongoRepository<Connector>,
    private organizationService: OrganizationService,
    private ldapToKeycloak: LdapToKeycloakToMailserver,
    private alertUsers: AlertUsers,
    private importDocuments: ImportDocuments,
    private renewSSL: RenewSSL,
    private serviceServie: ServiceService,
  ) {}

  private async isOrganizationRoot(organization_id: string) {
    const organization = await this.organizationService.findOne(
      organization_id,
    );
    if (!organization.is_root) {
      throw new ForbiddenException(
        'Only root organization can create/get/update/delete organizations',
      );
    }
  }

  async create(
    organisation_id: string,
    createConnectorDto: CreateConnectorDto,
  ) {
    await this.isOrganizationRoot(organisation_id);

    try {
      const connector = new Connector();
      for (const key in createConnectorDto) {
        connector[key] = createConnectorDto[key];
      }
      connector.connector_id = createConnectorDto.name.toLowerCase();
      connector.organizations = [];
      return await this.connectorRepository.save(connector);
    } catch (error) {
      console.log(error);
      if (error.code == 11000) {
        throw new ConflictException(
          'Conflict name/connector_id (Pensez à changer le nom)',
        );
      } else {
        throw new InternalServerErrorException(error.message);
      }
    }
  }

  async findAll(organization_id: string, user?: any) {
    try {
      let dbConnectors = await this.connectorRepository.find({
        where: {
          organizations: { $elemMatch: { organization_id } },
        },
      });

      if (user) {
        if (!user.realm_access.roles.includes('admin')) {
          dbConnectors = dbConnectors.filter(
            (connector) => connector.connector_id !== Configuration.RenewSSLId,
          );
        }
      }

      const connectors = [];
      for (const connector of dbConnectors) {
        const connectorOrgIndex = this.getConnectorOrgIndex(
          connector,
          organization_id,
        );
        connectors.push({
          connector_id: connector.connector_id,
          name: connector.name,
          description: connector.description,
          is_running: connector.organizations[connectorOrgIndex].is_running,
          last_run_status:
            connector.organizations[connectorOrgIndex].last_run_status,
          last_run_datetime:
            connector.organizations[connectorOrgIndex].last_run_datetime,
          depends_on: connector.depends_on,
        });
      }

      return connectors;
    } catch (error) {
      console.log(error);
      throw new BadRequestException('Bad request');
    }
  }

  async findOne(id: string, organization_id: string) {
    try {
      const organization = await this.organizationService.findOne(
        organization_id,
      );
      if (organization.is_root) {
        const connector = await this.connectorRepository.findOneOrFail({
          where: {
            connector_id: id,
          },
        });
        // const connectorOrgIndex = this.getConnectorOrgIndex(
        //   connector,
        //   organization_id,
        // );
        // const clientConnector = {
        //   connector_id: connector.connector_id,
        //   name: connector.name,
        //   description: connector.description,
        //   is_running: connector.organizations[connectorOrgIndex].is_running,
        //   last_run_status:
        //     connector.organizations[connectorOrgIndex].last_run_status,
        //   last_run_datetime:
        //     connector.organizations[connectorOrgIndex].last_run_datetime,
        // };

        return { dbConnector: connector, clientConnector: null };
      } else {
        const connector = await this.connectorRepository.findOne({
          where: {
            $and: [
              { connector_id: id },
              {
                organizations: { $elemMatch: { organization_id } },
              },
            ],
          },
        });
        if (!connector) {
          throw new NotFoundException('Connector Not Found');
        }

        const connectorOrgIndex = this.getConnectorOrgIndex(
          connector,
          organization_id,
        );
        const clientConnector = {
          connector_id: connector.connector_id,
          name: connector.name,
          description: connector.description,
          is_running: connector.organizations[connectorOrgIndex].is_running,
          last_run_status:
            connector.organizations[connectorOrgIndex].last_run_status,
          last_run_datetime:
            connector.organizations[connectorOrgIndex].last_run_datetime,
          depends_on: connector.depends_on,
        };

        return { dbConnector: connector, clientConnector };
      }
    } catch (error) {
      console.log(error);
      throw new NotFoundException('Connector Not Found');
    }
  }

  async update(
    id: string,
    organisation_id: string,
    updateConnectorDto: UpdateConnectorDto,
  ) {
    await this.isOrganizationRoot(organisation_id);

    try {
      const temp = await this.findOne(id, organisation_id);
      const connector = temp.dbConnector;

      for (const key in updateConnectorDto) {
        connector[key] = updateConnectorDto[key];
      }

      return await this.connectorRepository.save(connector);
    } catch (error) {
      console.log(error);
      if (error.code == 11000) {
        throw new ConflictException(
          'Conflict name/organization_id (Pensez à changer le nom)',
        );
      } else if (error.status == 404) {
        throw new NotFoundException('Connector Not Found');
      } else {
        throw new InternalServerErrorException(error.message);
      }
    }
  }

  async remove(organization_id: string, id: string) {
    await this.isOrganizationRoot(organization_id);

    try {
      await this.connectorRepository.delete({ connector_id: id });
    } catch (error) {}
  }

  async runConnector(
    id: string,
    organization_id: string,
    runConnectorDto: RunConnectorDto,
  ) {
    const organization = await this.organizationService.findOne(
      organization_id,
    );

    const isAllServicesDown = await this.serviceServie.isAllServicesDown(
      organization.organization_id,
    );
    const isAllConnectorsNotRunning = await this.isAllConnectorsNotRunning(
      organization_id,
    );
    if (id != Configuration.alertUserId && !isAllServicesDown) {
      throw new BadRequestException(
        'All services must be down to run a connector.',
      );
    }
    if (!isAllConnectorsNotRunning) {
      throw new BadRequestException(
        'There is another connector running, please wait.',
      );
    }

    const tempConnector = await this.findOne(id, organization_id);
    const connector = tempConnector.dbConnector;
    const connectorOrgIndex = this.getConnectorOrgIndex(
      connector,
      organization_id,
    );
    try {
      // await this.update_last_run_date_time(organization_id, connector);

      connector.organizations[connectorOrgIndex].is_running = 1;
      await this.connectorRepository.save(connector);
      let alertUsersResult: {
        alertedUsers: number;
        alreadyEnabledUsers: number;
        failedUsers: number;
      };

      if (Configuration.useRealConnectors) {
        switch (connector.connector_id) {
          case Configuration.importLdapId:
            await this.ldapToKeycloak.run(
              organization_id,
              connector.depends_on,
              organization,
              runConnectorDto.services,
            );
            break;
          case Configuration.alertUserId:
            const dependsOnUp = await this.serviceServie.areServicesUp(
              organization.organization_id,
              connector.depends_on,
            );
            if (!dependsOnUp) {
              throw new BadRequestException(
                'Les services concernés doivent être lancés',
              );
            }
            alertUsersResult = await this.alertUsers.run(
              [runConnectorDto.alert_level],
              runConnectorDto.sms_header
                ? runConnectorDto.sms_header
                : SmsHeader.DEFAULT,
              organization,
            );
            break;
          case Configuration.importDocId:
            await this.importDocuments.run(
              connector.depends_on,
              organization,
              runConnectorDto.services,
            );
            break;
          case Configuration.RenewSSLId:
            await this.renewSSL.run(
              organization_id,
              connector.depends_on,
              runConnectorDto.services,
            );
            break;
        }
      }

      // await this.updateLast_run_status(organization_id, connector, 1);

      connector.organizations[connectorOrgIndex].is_running = 0;
      connector.organizations[connectorOrgIndex].last_run_status = 1;
      connector.organizations[connectorOrgIndex].last_run_datetime =
        GetCurrentDate(Date.now());
      await this.connectorRepository.save(connector);

      const response = {
        connector_id: connector.connector_id,
        name: connector.name,
        description: connector.description,
        is_running: connector.organizations[connectorOrgIndex].is_running,
        last_run_status:
          connector.organizations[connectorOrgIndex].last_run_status,
        last_run_datetime:
          connector.organizations[connectorOrgIndex].last_run_datetime,
        depends_on: connector.depends_on,
      };

      if (alertUsersResult) {
        return { ...response, ...alertUsersResult };
      } else {
        return response;
      }
    } catch (error) {
      console.log(error);
      connector.organizations[connectorOrgIndex].last_run_datetime =
        GetCurrentDate(Date.now());
      connector.organizations[connectorOrgIndex].is_running = 0;
      connector.organizations[connectorOrgIndex].last_run_status = 0;
      await this.connectorRepository.save(connector);
      // await this.updateLast_run_status(organization_id, connector, 0);
      throw new InternalServerErrorException(error.message);
    }
  }

  private getConnectorOrgIndex(connector: Connector, organization_id: string) {
    return connector.organizations.findIndex(
      (org) => org.organization_id === organization_id,
    );
  }

  private async isAllConnectorsNotRunning(organization_id: string) {
    const connectors = await this.findAll(organization_id);
    for (const connector of connectors) {
      if (connector.is_running) {
        return false;
      }
    }
    return true;
  }

  async addOrgToConnector(
    organisation_id: string,
    connector_id: string,
    org_id: string,
  ) {
    await this.isOrganizationRoot(organisation_id);

    const temp = await this.findOne(connector_id, organisation_id);
    const connector = temp.dbConnector;

    try {
      const connectorOrganization = new Organization();
      connectorOrganization.organization_id = org_id;
      connectorOrganization.status = ConnectorStatus.INACTIVE;
      connectorOrganization.last_run_status = null;
      connectorOrganization.is_running = 0;
      connectorOrganization.last_run_datetime = null;

      connector.organizations.push(connectorOrganization);
      return await this.connectorRepository.save(connector);
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException('Server Error');
    }
  }

  async removeOrgFromConnector(
    organisation_id: string,
    connector_id: string,
    org_id: string,
  ) {
    await this.isOrganizationRoot(organisation_id);

    const temp = await this.findOne(connector_id, organisation_id);
    const connector = temp.dbConnector;

    try {
      const newOrgs = connector.organizations.filter(
        (org) => org.organization_id !== org_id,
      );
      connector.organizations = newOrgs;
      return await this.connectorRepository.save(connector);
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException('Server Error');
    }
  }
}
