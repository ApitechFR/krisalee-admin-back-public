import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  Inject,
  forwardRef,
  ForbiddenException,
  ConflictException,
  BadRequestException, HttpStatus, HttpException
} from '@nestjs/common';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { Service } from './entities/service.entity';
import { ThrowDuplicateAttributeError } from 'src/helpers/mainHelper';
import { GetCurrentDate } from 'src/helpers/getCurrentDate';
import { ServicesUpDTO } from './dto/services-up.dto';
import { ModeService } from '../mode/mode.service';
import { ServiceStatus } from 'src/enums/serviceStatus';
import { OrganizationService } from '../organization/organization.service';
import { KubernetesService } from '../kubernetes/kubernetes.service';
import { ProductService } from '../product/product.service';
import { Configuration } from 'src/config/Configuration';
import { Snapshot } from '../snapshot/entities/snapshot.entity';
import { SnapshotService } from '../snapshot/snapshot.service';
import { Product } from '../product/entities/product.entity';
import { ServicesDownDTO, serviceType } from './dto/service-down.dto';
import { WinstonService } from '../winston/winston.service';
import { readdirSync, statSync } from 'fs';
import { ServiceWithStatus } from './dto/service-with-status';
import { ModeType } from 'src/enums/modeType';
import { Mode } from '../mode/entities/mode.entity';
import { AlertUsers } from '../connector/classes/AlertUsers';
import { AlertLevelEnum } from '../connector/enums/ldapToKeycloak.enum';
import { SmsHeader } from 'src/enums/smsHeader';
import { setTimeout } from 'timers/promises';
import { Organization } from '../organization/entities/organization.entity';
import { MailingService } from "../mailing/mailing.service";

import { promisify } from 'util';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';


@Injectable()
export class ServiceService {
  /** The current organization representation */
  private organization: Organization;

  /** An attribute for telling whether an organization has sufficient permissions to perform an operation or not */
  private organization_id: string;

  private service_id: string;

  private ServiceUpDto: ServicesUpDTO;
  private ServiceDownDto: ServicesDownDTO;
  private serviceType: serviceType;

  /** the version used to start services */
  private version: string;

  private timestamp: number;

  constructor(
    @InjectRepository(Service)
    private readonly serviceRepository: MongoRepository<Service>,
    @Inject(forwardRef(() => KubernetesService))
    private readonly kubernetesService: KubernetesService,
    private readonly modeService: ModeService,
    private readonly organizationService: OrganizationService,
    private readonly productService: ProductService,
    @Inject(forwardRef(() => SnapshotService))
    private readonly snapshotService: SnapshotService,
    private readonly logService: WinstonService,
    private readonly alertUsers: AlertUsers,
    private readonly mailingService: MailingService
  ) {}

  private async isOrganizationRoot() {
    const organization = await this.organizationService.findOne(
      this.organization_id,
    );
    if (!organization.is_root) {
      throw new ForbiddenException(
        'Only root organization can create/update/delete services',
      );
    }
  }

  async create(organization_id: string, createServiceDto: CreateServiceDto) {
    if (createServiceDto.name.includes('_')) {
      throw new BadRequestException("Service name can't contain underscores");
    }

    try {
      const timestamp = Date.now();
      const service = new Service();
      for (const key in createServiceDto) {
        service[key] = createServiceDto[key];
      }
      service['service_id'] = createServiceDto['name'].toLowerCase();
      service['create_date'] = GetCurrentDate(timestamp);
      service['update_date'] = null;
      return await this.serviceRepository.save(service);
    } catch (error) {
      console.log(error);
      if (error.code == 11000) {
        throw new ConflictException('Service name already exist');
      } else {
        throw new InternalServerErrorException(error.message);
      }
    }
  }

  async update(
    organization_id: string,
    id: string,
    updateServiceDto: UpdateServiceDto,
  ) {
    this.organization_id = organization_id;
    await this.isOrganizationRoot();
    if (updateServiceDto.name.includes('_')) {
      throw new BadRequestException("Service name can't contain underscores");
    }

    try {
      const timestamp = Date.now();
      const service = await this.findOne(organization_id, id);
      for (const key in updateServiceDto) {
        service[key] = updateServiceDto[key];
      }
      service['update_date'] = GetCurrentDate(timestamp);
      return await this.serviceRepository.save(service);
    } catch (error) {
      console.log(error);
      if (error.code == 11000) {
        throw new ConflictException('Service name already exist');
      } else if (error.status == 404) {
        throw new NotFoundException('Service Not Found');
      } else {
        throw new InternalServerErrorException(error.message);
      }
    }
  }

  async delete(organizatio_id: string, id: string) {
    try {
      await this.serviceRepository.delete({ service_id: id });
    } catch (error) {}
  }

  /**
   * Get all services of a specific organization
   * @param organization_id The organization wich the service belongs to
   * @returns list of services, blank list if no services available
   */
  async findAll(organization_id: string, user?: any) {
    this.organization = await this.organizationService.findOne(organization_id);
    this.organization_id = this.organization.organization_id;

    try {
      if (user) {
        if (user.realm_access.roles.includes('admin')) {
          return await this.serviceRepository.find();
        }
      }
      const products = await this.productService.findAll();

      const servicesIds: string[] = [];

      for (const product of products) {
        for (const org_v of product.organizations_versions) {
          if (org_v.organization_id === this.organization_id) {
            if (!servicesIds.includes(product.service_id)) {
              servicesIds.push(product.service_id);
            }
          }
        }
      }

      const services = await this.findManyByIds(servicesIds);

      return services;
    } catch (error) {
      await this.logService.create({
        level: 'error',
        message: `${error.message}`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
          admin: true,
        },
      });
      console.log(error);
      throw new NotFoundException('No services for this organization');
    }
  }
  /**
   * Get a specific service
   * @param organization_id
   * @param id
   * @returns Service, throws not found ecxception otherwise
   */
  async findOne(organization_id: string, id: string) {
    this.organization = await this.organizationService.findOne(organization_id);

    this.organization_id = this.organization.organization_id;

    try {
      const organization = await this.organizationService.findOne(
        this.organization_id,
      );
      if (organization.is_root) {
        return await this.serviceRepository.findOneOrFail({
          where: {
            service_id: id,
          },
        });
      } else {
        const products = await this.productService.findAll(id);

        for (const product of products) {
          for (const org_v of product.organizations_versions) {
            if (org_v.organization_id === this.organization_id) {
              const service = await this.serviceRepository.findOneOrFail({
                where: {
                  service_id: id,
                },
              });

              return (await this.appendStatusToServices([service]))[0];
            }
          }
        }

        throw new NotFoundException('Service Not Found');
      }
    } catch (error) {
      throw new NotFoundException('Service Not Found');
    }
  }

  /**
   * this function is a recursive function that returns a sorted list the services ids to run,
   * starting with the services that have no dependencies then going up
   * @param servicesIds The liste of the services ids
   * @returns a sorted list of services ids with their depends on
   */
  async sortServices(servicesIds: string[]) {
    let servicesDependsOnIds: string[] = [];

    const recursiveFunc = async (ids: string[]) => {
      for (const serviceId of ids) {
        let temp = await this.getProductAndOrgVersion(serviceId);
        let depends_on = temp.organization_version.depends_on;

        await recursiveFunc(depends_on);

        if (!servicesDependsOnIds.includes(serviceId)) {
          servicesDependsOnIds.push(serviceId);
        }
      }
    };

    await recursiveFunc(servicesIds);

    console.log(servicesDependsOnIds);

    return servicesDependsOnIds;
  }

  async servicesHaveTaggedSnapshot(
    services: Service[],
    tag_id: string,
  ) {
    for (const service of services) {
      const temp = await this.getProductAndOrgVersion(service.service_id);
      const temp2 = await this.snapshotService.serviceHasTaggednapshot(
        this.organization_id,
        temp.organization_version.version_id,
        tag_id,
      );
      // if one of ther services doesn't have a production snapshot throw an error
      if (service.service_id !== 'frontal') {
        if (!temp2.hasTaggedSnapshot) {
          throw new BadRequestException(
            `Le service ${service.name} n'a pas de sauvegarde ${temp2.tagName}\nVérifiez le service`,
          );
        }
      }
      // otherwise load the services up dto by adding the service id and the id of the production snapshot
      this.ServiceUpDto.services.push({
        service_id: service.service_id,
        snapshot_id: temp2.snapshot_id,
      });
    }
  }

  /**
   * Start services
   * @param organization_id The organization which the services belong to
   * @param servicesUpDto A list with the services to start and the mode with which we want to start(ex: 'Notify all users', 'notify only admins'..)
   * @returns A list of the started services
   */
  async servicesUp(organization_id: string, servicesUpDto: ServicesUpDTO, user?: any,connectorSource?: boolean) {
    let services: Service[];
    let servicesIds: string[];
    let servicesDependsOnIds: string[] = [];
    let launchedServices: string[] = [];
    let nonLaunchedServices: string[] = [];

    this.organization = await this.organizationService.findOne(organization_id);

    this.organization_id = this.organization.organization_id;
    this.ServiceUpDto = servicesUpDto;

    if (this.ServiceUpDto.mode_id) {
      await this.modeService.findOne(this.ServiceUpDto.mode_id);

      this.ServiceUpDto.services = [];
      const services = await this.findAll(organization_id);
      // Check if all the services has the tagged snapshot, if they are add them to the dto
      // with the id of the tagged snapshot
      await this.servicesHaveTaggedSnapshot(services, process.env.PROD_TAG_ID);
    }

    try {
      [services, servicesIds] = await this.getServices(this.ServiceUpDto);

      // Reset the progress
      await this.productService.updateProgress(
        this.organization_id,
        servicesIds,
        10,
      );

      servicesDependsOnIds = await this.sortServices(servicesIds);

      // set all specified services is_creating to true
      for (const serviceId of servicesDependsOnIds) {
        await this.productService.updateIsCreating(
          this.organization_id,
          serviceId,
          true,
        );
      }

      // get the services ids
      const allServices = await this.findManyByIds(servicesDependsOnIds);
      services = [];
      for (const serviceId of servicesDependsOnIds) {
        for (const service of allServices) {
          if (serviceId === service.service_id) {
            services.push(service);
          }
        }
      }

      this.timestamp = Date.now();

      // Initiate the progress
      await this.productService.updateProgress(
        this.organization_id,
        servicesIds,
        10,
      );

      // Create Nodes for all the services to gain time, re-do it 3 times before throwing the error
      if (JSON.parse(process.env.USE_INFRA.toLowerCase())) {
        for (let i = 1; i <= 3; i++) {
          try {
            await this.logService.create({
              level: 'info',
              message: `Creating nodes ${i} try:`,
              data: {
                organization_id: this.organization_id,
                context: 'services',
                admin: true,
              },
            });
            console.log('---------------------');
            console.log(`Creating nodes ${i} try:`);
            console.log('---------------------');
            await this.kubernetesService.createNodes(
              this.organization_id,
              services,
            );
            break;
          } catch (error) {
            if (i == 3) {
              await this.logService.create({
                level: 'error',
                message: `${error.message}`,
                data: {
                  organization_id: this.organization_id,
                  context: 'services',
                  admin: true,
                },
              });
              throw new HttpException(error.message, 504);
            }
            await this.logService.create({
              level: 'info',
              message: `Waiting ${process.env.TIME_BETWEEN_CREATE_NODES_TRIES} 
                        seconds before the ${i + 1} try.`,
              data: {
                organization_id: this.organization_id,
                context: 'services',
                admin: true,
              },
            });
            console.log(
              '--------------------------------------------------------------',
            );
            console.log(
              `Waiting ${
                process.env.TIME_BETWEEN_CREATE_NODES_TRIES
              } seconds before the ${i + 1} try...`,
            );
            console.log(
              '--------------------------------------------------------------',
            );
            await setTimeout(
              parseInt(process.env.TIME_BETWEEN_CREATE_NODES_TRIES) * 1000,
            );
          }
        }
      }

      // Set progress after the nodes creation
      await this.productService.updateProgress(
        this.organization_id,
        servicesIds,
        50,
      );

      for (const service of services) {
        // The dependencies don't have a dto because they are added by the backend
        // that's why we need to add them to the dto so we can for example check the dto to choose a snapshot
        const temp = this.ServiceUpDto.services.find(
          (ser) => ser.service_id === service.service_id,
        );
        if (!temp) {
          this.ServiceUpDto.services.push({
            service_id: service.service_id,
            snapshot_id: null,
          });
        }
        this.service_id = service.service_id;
        try {
          // launch the service
          await this.launchService();
          // push launched services to the list for mailing
          launchedServices.push(service.name);

          // set service is_creating to false
          await this.productService.updateIsCreating(
            this.organization_id,
            this.service_id,
            false,
          );

          // Reset the progress
          await this.productService.updateProgress(
            this.organization_id,
            [this.service_id],
            10,
          );
        } catch (error) {
          // push non launched services to the list for mailing
          nonLaunchedServices.push(service.name);
          await this.logService.create({
            level: 'error',
            message: `${error.message}`,
            data: {
              organization_id: this.organization_id,
              context: 'services',
              admin: true,
            },
          });
          // if an error occures set the service is_creating to false
          await this.productService.updateIsCreating(
            this.organization_id,
            this.service_id,
            false,
          );
          console.log(error);
          if (error.status == 409) {
            continue;
          } else {
            throw new InternalServerErrorException(error.message);
          }
        }
      }

      // if the mode is production launch the alert users connector with level 1
      if (servicesUpDto.mode_id) {
        // await this.alertUsers.run(
        //   AlertLevelEnum.ALERT_LEVEL_0,
        //   SmsHeader.DEFAULT,
        //   this.organization,
        // );

        switch (servicesUpDto.mode_id) {
          case 'survie':
            await this.alertUsers.run(
              [],
              SmsHeader.DEFAULT,
              this.organization,
              this.ServiceUpDto.mode_id
            );
            break;
          case 'exercice':
            // Alert only level 0 users
            await this.alertUsers.run(
              [AlertLevelEnum.ALERT_LEVEL_1],
              SmsHeader.DEFAULT,
              this.organization,
              this.ServiceUpDto.mode_id
            );
            break;
          case 'prechauffe':
            break;
        }
      }
      //send an email if no error occured
      if (!connectorSource)
        this.mailingService.servicesUpEmail(launchedServices,nonLaunchedServices,user,this.organization.name);
      // add the status to the response
      return await this.appendStatusToServices(services);
    } catch (error) {
      const httpException = error as HttpException;
      console.log(error);
      await this.logService.create({
        level: 'error',
        message: `error starting services, Error: ${error.message}`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
        },
      });
      for (const serviceId of servicesDependsOnIds) {
        await this.productService.updateIsCreating(
          this.organization_id,
          serviceId,
          false,
        );
      }
      if (!connectorSource)
        this.mailingService.servicesUpErrorEmail(user,this.organization.name,httpException.getStatus());
      throw new InternalServerErrorException(error.message);
    }
  }

  /**
   * Stop services
   * @param organization_id
   * @param servicesUpDto
   * @returns A list of the stopped services
   */
  async servicesDown(
    organization_id: string,
    servicesDownDto: ServicesDownDTO,
    connectorSource?:boolean,
    deleteNode?: boolean
  ) {
    let services: Service[];
    let servicesIds: string[];

    try {
      // get the services ids and set is deleting to true
      this.organization = await this.organizationService.findOne(
        organization_id,
      );
      this.organization_id = this.organization.organization_id;
      this.ServiceDownDto = servicesDownDto;

      [services, servicesIds] = await this.getServices(this.ServiceDownDto);

      // Reset the progress
      await this.productService.updateProgress(
        this.organization_id,
        servicesIds,
        10,
      );

      for (const serviceId of servicesIds) {
        await this.productService.updateIsDeleting(
          this.organization_id,
          serviceId,
          true,
        );
      }

      // Initiate the progress
      await this.productService.updateProgress(
        this.organization_id,
        servicesIds,
        10,
      );

      // the timestamp to use for new snapshot
      this.timestamp = Date.now();

      for (const service of services) {
        this.service_id = service.service_id;
        try {
          // delete the service
          await this.stopService([service],connectorSource);
        } catch (error) {
          console.log(error);
          console.log(`service ${service.name} could not be deleted`);
          await this.logService.create({
            level: 'error',
            message: `service ${service.name} could not be deleted: ${error.message}`,
            data: {
              organization_id: this.organization_id,
              context: 'services',
              admin: true,
            },
          });
          await this.productService.updateIsDeleting(
            this.organization_id,
            this.service_id,
            false,
          );
          throw new InternalServerErrorException(error.message);
        }
      }

      // Check if wa can delete frontal or not
      if (!servicesIds.includes('frontal'))
        await this.deleteFrontal(this.organization_id);

      // delete all the specified services nodes to optimize time
      if (JSON.parse(process.env.USE_INFRA.toLowerCase())) {
        if (deleteNode || JSON.parse(process.env.DELETE_NODES.toLowerCase())){
          await this.kubernetesService.deleteNodes(organization_id, services);
        }
      }

      // Set the progress after deleting the nodes
      await this.productService.updateProgress(
        this.organization_id,
        !servicesIds.includes('frontal')
          ? [...servicesIds, 'frontal']
          : servicesIds,
        99,
      );

      // set is Deleting to false
      for (const service of services) {
        await this.productService.updateIsDeleting(
          this.organization_id,
          service.service_id,
          false,
        );
      }

      // Reset the progress
      await this.productService.updateProgress(
        this.organization_id,
        !servicesIds.includes('frontal')
          ? [...servicesIds, 'frontal']
          : servicesIds,
        10,
      );

      // add service status to the response
      return await this.appendStatusToServices(services);
    } catch (error) {
      console.log(error);
      await this.logService.create({
        level: 'error',
        message: `error deleting services, Error: ${error.message}`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
          admin: true,
        },
      });
      for (const serviceId of servicesIds) {
        await this.productService.updateIsDeleting(
          this.organization_id,
          serviceId,
          false,
        );
      }
      throw new InternalServerErrorException(error.message);
    }
  }

  /**
   * This function applies the "servicesDown" method to stop the services of all organizations.
   */
  async handleCron() {

    console.log("-----------------------------------------\nCron service executed\n-----------------------------------------");

    let organizations: Organization[];
    let services: Service[];
    let serviceDownDto: ServicesDownDTO = { services : []};

    organizations = await this.organizationService.findAll();

    for (let organization of organizations) {
      let serviceTypes: serviceType[] = [];
      services = await this.findAll(organization.organization_id);
      const servicesWithStatus = await this.appendStatusToServices(services);
      if (servicesWithStatus.length > 0) {
        for(let serviceWithStatus of servicesWithStatus){
          //condition pour arreter juste les services déjà démarrer
          if (serviceWithStatus.status === ServiceStatus.ACTIVE){
            let serviceType : serviceType = {comment:"",save_snapshot:true,service_id:""}; // Initialize serviceType object
            serviceType.comment = "Service arrêté automatiquement";
            serviceType.save_snapshot = true;
            serviceType.service_id = serviceWithStatus.service_id
            serviceTypes.push(serviceType);
          }
        }
        if(serviceTypes.length != 0) {
          serviceDownDto.services = serviceTypes;
          await this.servicesDown(organization.organization_id, serviceDownDto, false, true);
          console.log(`-----------------------------------------\nDeleting ${organization.name}'s services\n-----------------------------------------`);
        }
      }
    }
  }

  async updateServiceStatus(
    organization_id: string,
    service_id: string,
    status: number,
  ) {
    await this.productService.updateStatus(organization_id, service_id, status);
  }

  async updateServicesProgress(
    organizatio_id: string,
    servicesIds: string[],
    progress: number,
  ) {
    await this.productService.updateProgress(
      organizatio_id,
      servicesIds,
      progress,
    );
  }

  private async findManyByIds(ids: string[]) {
    return await this.serviceRepository.find({
      where: {
        service_id: { $in: ids },
      },
    });
  }
  /**
   * A function returning the list of services to launch or to stop
   * @returns services
   */
  async getServices(
    servicesDto: ServicesUpDTO | ServicesDownDTO,
  ): Promise<[Service[], string[]]> {
    //first we verify that the specified mode exist
    if (servicesDto['mode_id']) {
      await this.modeService.findOne(
        servicesDto['mode_id'],
        // this.organization_id,
      );
    }

    const orgServices = await this.findAll(this.organization_id);

    let servicesIds: string[] = [];

    for (const service of servicesDto.services) {
      servicesIds.push(service.service_id);
    }

    let services = orgServices.filter((service) =>
      servicesIds.includes(service.service_id),
    );

    servicesIds = [];

    for (const service of services) {
      servicesIds.push(service.service_id);
    }

    services = await this.appendStatusToServices(services);

    return [services, servicesIds];
  }
  /**
   * Launch service
   */
  async launchService() {
    // get the product, organization_version, and version
    const temp = await this.getProductAndOrgVersion(this.service_id);
    const product = temp.product;
    const organization_version = temp.organization_version;
    this.version = temp.version;

    // if the user specifies the snapshot id, we use this snapshot for kubernetes
    // otherwise we send the default one (either the last one or the snapshot tagged prod)
    let snapshot: Snapshot;
    for (const serviceDto of this.ServiceUpDto.services) {
      if (serviceDto.service_id === this.service_id) {
        if (serviceDto.snapshot_id) {
          snapshot = await this.snapshotService.findOne(serviceDto.snapshot_id);
        } else {
          snapshot = await this.snapshotService.getLastSnapshot(
            this.organization_id,
            organization_version.version_id,
          );
        }
      }
    }

    // up the services from kubernetes service
    if (JSON.parse(process.env.USE_INFRA.toLowerCase())) {
      await this.kubernetesService.upService(
        this.service_id,
        product.product_id,
        this.version,
        snapshot ? snapshot.timestamp : undefined,
        this.timestamp,
        this.organization,
      );
    }

    // if a snapshot is selected we make it active
    if (snapshot) {
      await this.snapshotService.update(
        snapshot.snapshot_id,
        true,
        this.timestamp,
      );
    }

    // if everyting works file change service status to active
    await this.updateServiceStatus(
      this.organization_id,
      this.service_id,
      ServiceStatus.ACTIVE,
    );
  }

  /**
   * A function that stops each service separately
   */
  async stopService(services?:Service[],connectorSource?:boolean) {
    // set the service product, version ...
    const temp = await this.getProductAndOrgVersion(this.service_id);
    const product = temp.product;
    const organization_version = temp.organization_version;
    this.version = temp.version;

    // get the active snapshot (the used snapshot for launch)
    const activeSnapshot : Snapshot = await this.snapshotService.getActiveSnapshot(
      this.organization_id,
      organization_version.version_id,
    );

    // delete the service from the cluster
    let saveSnapshot: boolean = true;
    let comment: string = "";
    // if the down service throws an error save the snapshot with the tag failed
    let alreadyDeleted : boolean;
    let saveSnapshotWithFailed = false;
    if (JSON.parse(process.env.USE_INFRA.toLowerCase())) {
      // get the service save snapshot value
      for (const serviceDto of this.ServiceDownDto.services) {
        if (
          serviceDto.service_id === this.service_id &&
          serviceDto.save_snapshot != undefined &&
          serviceDto.save_snapshot != null
        ) {
          saveSnapshot = serviceDto.save_snapshot;
        }
        if(serviceDto.service_id === this.service_id) {
          comment = serviceDto.comment
        }
      }



      try {
        alreadyDeleted = await this.kubernetesService.downService(
          this.service_id,
          product.product_id,
          this.version,
          `${this.timestamp}`,
          activeSnapshot ? activeSnapshot.timestamp : undefined,
          saveSnapshot,
          this.organization,
        );
      } catch (e) {
        saveSnapshotWithFailed = true;
      }

      if(alreadyDeleted) {
        throw new BadRequestException('The service is already Deleted');
      }
    }

    // change the active snapshot to an inactive snapshot
    if (activeSnapshot) {
      await this.snapshotService.update(
        activeSnapshot.snapshot_id,
        false,
        this.timestamp,
      );
    }

    // make valid tag as default,
    let tag_id = Configuration.validTagId

    // If the source of down is a connector then check the used snapshot has prod tag
    if(connectorSource){
      if(activeSnapshot){
        if(activeSnapshot.tags.includes(Configuration.prodTagId)){
          tag_id = Configuration.prodTagId;
        }
      }
    }

    if(saveSnapshotWithFailed) {
      tag_id = Configuration.failedTagId;
    }

    //generate new snapshot
    if (saveSnapshot != false) {
      await this.snapshotService.create(
        this.organization_id,
        `${this.timestamp}`,
        organization_version.version_id,
        comment,
        tag_id,
      );
    }

    // if everything was ok set the service status to inactive
    await this.updateServiceStatus(
      this.organization_id,
      this.service_id,
      ServiceStatus.INACTIVE,
    );
  }

  async getServiceSnapshots(organization_id: string, service_id: string) {
    let product: Product;
    try {
      product = await this.productService.getOrgProduct(
        organization_id,
        service_id,
      );
    } catch (error) {
      await this.logService.create({
        level: 'error',
        message: `${error.message}`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
          admin: true,
        },
      });
      throw new NotFoundException(error.message);
    }

    const version_id = product.organizations_versions.find(
      (org_v) => org_v.organization_id === organization_id,
    ).version_id;

    const snapshots = await this.snapshotService.getVersionSnapshots(
      organization_id,
      version_id,
    );

    // const orderedSnapshots = snapshots.reverse();
    const orderedSnapshots = this.sortSnapshotsByDate(snapshots);

    return orderedSnapshots;
  }

  sortSnapshotsByDate(snapshots: any[]) {
    return snapshots.sort((snap1, snap2) => snap2.timestamp - snap1.timestamp);
  }

  async getProductAndOrgVersion(service_id: string) {
    let product: Product;
    try {
      product = await this.productService.getOrgProduct(
        this.organization_id,
        service_id,
      );
    } catch (error) {
      await this.logService.create({
        level: 'error',
        message: `${error.message}`,
        data: {
          organization_id: this.organization_id,
          context: 'services',
          admin: true,
        },
      });
      throw new NotFoundException(error.message);
    }
    if (product) {
      const organization_version = product.organizations_versions.find(
        (org_v) => org_v.organization_id === this.organization_id,
      );

      const version = organization_version.version_id.split('_').slice(-1)[0];

      return { product, organization_version, version };
    }
  }

  async appendStatusToServices(services: Service[]) {
    let servicesWithStatus = [];
    for (const service of services) {
      const nodePool = await this.getServiceNodePool(service.service_id);
      let product: Product;
      try {
        product = await this.productService.getOrgProduct(
          this.organization_id,
          service.service_id,
        );
      } catch (error) {
        console.log(error);
        await this.logService.create({
          level: 'error',
          message: `${error.message}`,
          data: {
            organization_id: this.organization_id,
            context: 'services',
            admin: true,
          },
        });
        throw new NotFoundException(error.message);
      }
      if (!product) {
        servicesWithStatus.push({
          service_id: service.service_id,
          name: service.name,
          description: service.description,
          productEmpty: true,
        });
      } else {
        for (const org_v of product.organizations_versions) {
          if (org_v.organization_id === this.organization_id) {
            servicesWithStatus.push({
              service_id: service.service_id,
              name: service.name,
              description: service.description,
              status: org_v.status,
              is_creating: org_v.is_creating,
              is_deleting: org_v.is_deleting,
              progress: org_v.progress,
              depends_on: org_v.depends_on,
              node_pool: nodePool,
              last_run_datetime: org_v.last_run_datetime,
              service_url:
                this.organization.organization_env.services_url[
                  service.service_id
                ],
            });
          }
        }
      }
    }

    return servicesWithStatus;
  }

  async fromFSToDB(organization_id: string) {
    const services = await this.findAll(organization_id);

    for (const service of services) {
      const { product, organization_version, version } =
        await this.getProductAndOrgVersion(service.service_id);

      const path = `${process.env.DATA_PATH}/${organization_id}/service/${service.service_id}/${product.product_id}/${version}`;

      try {
        const stats = statSync(path);

        if (stats.isDirectory()) {
          const result = readdirSync(path);
          for (const timestamp of result) {
            if (timestamp !== 'active') {
              const version_id = organization_version.version_id;
              const snapshot_id = `${version_id}_${timestamp}`;
              try {
                await this.snapshotService.findOne(snapshot_id);
              } catch (error) {
                await this.snapshotService.create(
                  organization_id,
                  timestamp,
                  version_id,
                  ""
                );
              }
            }
          }
        }
      } catch (error) {
        await this.logService.create({
          level: 'error',
          message: `${error.message}`,
          data: {
            organization_id: this.organization_id,
            context: 'services',
            admin: true,
          },
        });
        if (error.code === 'ENOENT') {
          continue;
        } else {
          console.log(error);
        }
      }
    }
  }

  /**
   * This function check if all organization's services is down.
   * @param organization_id
   * @returns boolean
   */
  async isAllServicesDown(organization_id: string) {
    this.organization = await this.organizationService.findOne(organization_id);
    const services = await this.findAll(this.organization.organization_id);
    const servicesWithStatus = await this.appendStatusToServices(services);
    for (const service of servicesWithStatus) {
      if (service.status === ServiceStatus.ACTIVE) {
        return false;
      }
    }
    return true;
  }

  /**
   * This function check if some organization's services is down.
   * @param organization_id
   * @param servicesIds The liste of the services ids
   * @returns boolean
   */
  async areServicesUp(organization_id: string, servicesIds: string[]) {
    this.organization = await this.organizationService.findOne(organization_id);
    const services = await this.findManyByIds(servicesIds);
    const servicesWithStatus = await this.appendStatusToServices(services);
    for (const service of servicesWithStatus) {
      if (service.status === ServiceStatus.INACTIVE) {
        return false;
      }
    }
    return true;
  }

  private async deleteFrontal(organizatio_id: string) {
    let canDeleteFrontal = true;
    const services = await this.findAll(organizatio_id);
    const servicesWithoutFrontal = services.filter(
      (service) => service.service_id != 'frontal',
    );
    const servicesWithStatus = await this.appendStatusToServices(
      servicesWithoutFrontal,
    );
    for (const service of servicesWithStatus) {
      if (service.status === ServiceStatus.ACTIVE) {
        canDeleteFrontal = false;
      }
    }

    if (canDeleteFrontal) {
      try {
        // delete the frontal
        this.service_id = 'frontal';
        await this.stopService();
        await this.productService.updateIsDeleting(
          this.organization_id,
          this.service_id,
          false,
        );
      } catch (error) {
        console.log(error);
        console.log(`service Frontal could not be deleted`);
        await this.logService.create({
          level: 'error',
          message: `service Frontal could not be deleted ${error.message}`,
          data: {
            organization_id: this.organization_id,
            context: 'services',
            admin: true,
          },
        });
        await this.productService.updateIsDeleting(
          this.organization_id,
          this.service_id,
          false,
        );
        throw new InternalServerErrorException(error.message);
      }
    }
  }

  async getServiceNodePool(service_id: string) {
    let nodePool: string;
    const temp = await this.getProductAndOrgVersion(service_id);

    if (temp) {
      const product = temp.product;
      const organization_version = temp.organization_version;

      for (const version of product.versions) {
        if (version.version_id === organization_version.version_id) {
          nodePool = version.node_pool;
        }
      }

      return nodePool;
    }
  }

  async canDeleteNode(organizatio_id: string, service_id: string) {
    const nodePool = await this.getServiceNodePool(service_id);

    const services = await this.findAll(organizatio_id);
    const filtredServices = services.filter(
      (service) => service.service_id != service_id,
    );
    const servicesWithStatus = await this.appendStatusToServices(
      filtredServices,
    );

    for (const service of servicesWithStatus) {
      if (
        service.node_pool === nodePool &&
        service.status === ServiceStatus.ACTIVE
      ) {
        return false;
      }
    }

    return true;
  }

  /**
   * This function find the last directory added in a folder.
   * @param folderPath
   * @returns lastFolder
   */
  async findLatestFolder(folderPath: string) {
    const readdirAsync = promisify(fs.readdir);

    try {
      let folders = await readdirAsync(folderPath, { withFileTypes: true });

        folders = folders.filter(folder => folder.name !== "active");

      folders.sort();
        const latestFolder = folders.length > 0 ? folders[folders.length - 1].name : null;

      return latestFolder;

    } catch (error) {
      console.error('Error latest folder not found:', error);
      return null;
    }
  }

  /**
   * This function check if the SSL is valid for more than 30 days.
   * @param organization_id
   * @returns boolean
   */
  async checkSSLValidation(organization_id: string) {

    this.organization_id = organization_id;

    const execAsync = promisify(exec);

    // const mode = 'dev';
    // const Path = `/var/lib/docker/volumes/krisalee-admin-back_data-${mode}/_data/service/frontal/nginx/v1/`;
    const Path = `${process.env.DATA_PATH}/${this.organization_id}/service/frontal/nginx/v1/`;

    if (this.isAllServicesDown(organization_id)){
      try {
        
        const dernierDossier = await this.findLatestFolder(Path);

        let organisation = await this.organizationService.findOne(organization_id);
        let service_url = organisation.organization_env.services_url;

        if (!dernierDossier) {
          throw new Error('No folders found in the specified directory.');
        }

        const urls = Object.values(service_url);

        for (let url of urls){
          const jsUrl = new URL(url);
          const pathWithServiceURL = `data/letsencrypt/live/${jsUrl.hostname}/fullchain.pem`;

          const fullPath = path.join(Path, dernierDossier, pathWithServiceURL);

          const { stdout } = await execAsync(`openssl x509 -enddate -noout -in ${fullPath}`);
          //const stdout = "notAfter=Feb 19 23:59:59 2024 GMT";

          const [, dateString] = stdout.split('=');
          const finDate = new Date(dateString.trim());

          const Milliseconds_30 = 30 * 24 * 60 * 60 * 1000; //trente jours on Milliseconds
          const ExpirationDuree = finDate.getTime() - Date.now(); // en Milliseconds

          if (ExpirationDuree <= Milliseconds_30) {
            // If less than 30 days
            return true;
          } else {
            // If more than 30 days
            return false;
          }

        }

       } 
      catch (error) {
        console.error('Error checking SSL validation:', error);
        throw new Error('Error checking SSL validation');
      }
    }
    else {
      console.error("Les services sont démarrés ! Essayez de les arrêter");
    }
 
  }

  /**
   * This function applies the "checkSSLValidation" method to all organizations.
   */
  async allOrgsRenewSSL() {

    let organizations: Organization[];
    let orgsSucces: string[] = [];
    let orgsFailed: string[] = [];

    organizations = await this.organizationService.findAll();

    for (let organization of organizations) {
      try {
        const currentDate = new Date();
        console.log("-----------------------------------------");
        console.log(`Date and time of execution: ${currentDate}`);
        console.log(`Renewing SSL certification for the organization ${organization.name} ...`);
        console.log("-----------------------------------------");
        await this.renewSSL(organization.organization_id);
        orgsSucces.push(organization.name);
      } catch (error) {
        console.error(`Error can't renew SSL certification for the organization ${organization.name}`, error);
        orgsFailed.push(organization.name);
      }
    }
    //sendEmail
    this.mailingService.sendSSLRenewalEmail(orgsSucces, orgsFailed);
    
  }

  /**
   * This function will renew the SSL certificate
   * @param organization_id
   */
  async renewSSL(organization_id: string) {
    try {
      this.organization_id = organization_id;

      const renewNeeded = await this.checkSSLValidation(organization_id);

      if (renewNeeded) {
        await this.kubernetesService.launchSSLJobs(this.organization_id);
      }
      else {
        console.log("-----------------------------------------");
        console.log("The expiration date is more than 30 days ! So we do not need to renew the SSL certificat");
        console.log("-----------------------------------------");
      }

    } catch (error) {
      await this.logService.create({
        level: 'error',
        message: `${error.message}`,
        data: {
          organization_id: this.organization_id,
          connector_id: Configuration.RenewSSLId,
          admin: true,
        },
      });
      console.log(error);
      if (error.message) {
        throw new InternalServerErrorException(error.message);
      } else {
        throw new InternalServerErrorException(
          "Couldn't renew the ssl certificates !",
        );
      }
    }
  }
}
