import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { ConnectorService } from './connector.service';
import { ConnectorController } from './connector.controller';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Connector } from './entities/connector.entity';
import { OrganizationModule } from '../organization/organization.module';
import { LdapToKeycloakToMailserver } from './classes/LdapToKeycloakToMailserver';
import { AlertUsers } from './classes/AlertUsers';
import { ImportDocuments } from './classes/ImportDocuments';
import { KeycloakModule } from '../keycloak/keycloak.module';
import { ServiceModule } from '../service/service.module';
import { KubernetesModule } from '../kubernetes/kubernetes.module';
import { MongoRepository } from 'typeorm';
import { Organization } from './entities/connector.entity';
import { winstonModule } from '../winston/winston.module';
import { WinstonService } from '../winston/winston.service';
import { RenewSSL } from './classes/RenewSSL';

@Module({
  imports: [
    TypeOrmModule.forFeature([Connector]),
    forwardRef(() => ServiceModule),
    forwardRef(() => KubernetesModule),
    OrganizationModule,
    forwardRef(() => KeycloakModule),
    winstonModule,
  ],
  controllers: [ConnectorController],
  providers: [
    ConnectorService,
    LdapToKeycloakToMailserver,
    AlertUsers,
    ImportDocuments,
    RenewSSL,
    WinstonService,
  ],
  exports: [ConnectorService, AlertUsers],
})
export class ConnectorModule implements OnModuleInit {
  constructor(
    @InjectRepository(Connector)
    private connectorRepository: MongoRepository<Connector>,
  ) {}

  // Reset connectors is_running attribute
  async onModuleInit() {
    const connectors = await this.connectorRepository.find();
    for (const connector of connectors) {
      const newOrganizations: Organization[] = [];
      for (const orgConnector of connector.organizations) {
        orgConnector.is_running = 0;
        newOrganizations.push(orgConnector);
      }
      connector.organizations = newOrganizations;
      await this.connectorRepository.save(connector);
    }
  }
}
