import { Module, forwardRef } from '@nestjs/common';
import { KeycloakService } from './keycloak.service';
import { KeycloakController } from './keycloak.controller';
import { OrganizationModule } from '../organization/organization.module';
import { ConnectorModule } from '../connector/connector.module';
import { ServiceModule } from '../service/service.module';

@Module({
  imports: [OrganizationModule, forwardRef(() => ServiceModule), forwardRef(() => ConnectorModule)],
  providers: [KeycloakService],
  exports: [KeycloakService],
  controllers: [KeycloakController],
})
export class KeycloakModule {}
