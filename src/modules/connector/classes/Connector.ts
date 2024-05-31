import {
  Injectable,
  InternalServerErrorException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { KeycloakService } from 'src/modules/keycloak/keycloak.service';
import { KubernetesService } from 'src/modules/kubernetes/kubernetes.service';
import { serviceType } from 'src/modules/service/dto/service-down.dto';
import { ServiceService } from 'src/modules/service/service.service';
import { WinstonService } from 'src/modules/winston/winston.service';
import { ServiceType } from '../dto/run-connector.dto';

@Injectable()
export abstract class ConnectorInterface {
  protected organization_id: string;

  constructor(
    protected readonly keycloakService: KeycloakService,
    @Inject(forwardRef(() => ServiceService))
    protected readonly serviceService: ServiceService,
    @Inject(forwardRef(() => KubernetesService))
    protected readonly kubernetesService: KubernetesService,
    protected readonly logService: WinstonService,
  ) {}

  protected getOrganizationId() {
    return this.organization_id;
  }

  protected setOrganizationId(organization_id: string) {
    this.organization_id = organization_id;
  }

  private async appendServicesDown(
    servicesIds: string[],
    saveSnapshot: boolean,
  ) {
    const servicesDependsOnIds = await this.serviceService.sortServices(
      servicesIds,
    );

    const services: serviceType[] = [];
    for (const serviceId of servicesDependsOnIds) {
      // I added a check here to prevent saving snapshots for services that are not concerned for the connector (e.g auth for import documents)
      services.push({ service_id: serviceId, save_snapshot: servicesIds.includes(serviceId) ? saveSnapshot : false, comment: "" });
    }

    return services;
  }

  private appendServicesUpIds(servicesIds: string[]) {
    const services = [];
    for (const serviceId of servicesIds) {
      services.push({ service_id: serviceId });
    }

    return services;
  }

  protected async upConnectorServices(services: ServiceType[],connectorSource: boolean=true) {
    console.log('----------------------------------------------');
    console.log('Starting the connector depends on services ...');
    console.log('----------------------------------------------');

    try {
      await this.serviceService.servicesUp(this.organization_id, { services }, undefined,connectorSource);
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException(error.message);
    }
  }
  protected async downConnectorServices(
    servicesIds: string[],
    saveSnapshot: boolean,
  ) {
    console.log('----------------------------------------------');
    console.log('Deleting the connector depends on services ...');
    console.log('----------------------------------------------');
    try {
      const connectorSource = true;
      const services = await this.appendServicesDown(servicesIds, saveSnapshot);

      await this.serviceService.servicesDown(this.organization_id, {
        services,
      }, connectorSource);
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException(error.message);
    }
  }

  // abstract run(
  //   organization_id: string,
  //   depends_on: string[],
  //   alert_level?: number,
  //   services?: ServiceType[],
  //   sms_header?: string
  // ): Promise<void>;
}
