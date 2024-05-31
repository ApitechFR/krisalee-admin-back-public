import { ServiceType } from '../dto/run-connector.dto';
import { ConnectorInterface } from './Connector';
import { Injectable, InternalServerErrorException } from '@nestjs/common';

@Injectable()
export class RenewSSL extends ConnectorInterface {
  async run(
    organization_id: string,
    depends_on: string[],
    services?: ServiceType[],
  ) {
    try {
      this.setOrganizationId(organization_id);
      await this.upConnectorServices(services);

      await this.serviceService.renewSSL(organization_id);

      await this.downConnectorServices(depends_on, true);
    } catch (error) {
      await this.downConnectorServices(depends_on, false);
      if (error) {
        console.error(error.message);
      } else {
        console.error(error);
        throw new InternalServerErrorException(error);
      }
    }
  }
}
