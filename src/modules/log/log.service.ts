import { Injectable, Inject, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { Log } from './entities/log.entity';
import { OrganizationService } from '../organization/organization.service';
import { isUserAdmin } from 'src/helpers/mainHelper';
@Injectable()
export class LogService {

    constructor(

        @InjectRepository(Log) private readonly logRepository: MongoRepository<Log>,
        private readonly organizationService: OrganizationService
        ){}

    async findAll(organization_id: string) {
        try {
            const organization = await this.organizationService.findOne(organization_id);
            if(organization.is_root){
                return await this.logRepository.find();
            }
            else {
                return await this.logRepository.find({
                    where: {
                        'meta.organization_id': organization_id,
                    },
                    order: {
                        timestamp: 'DESC',
                    },
                });
                return true;
            }
        } catch (error) {
            console.log(error);
            throw new BadRequestException('Bad request');
        }
    }

    async findConnectorLogs(organization_id: string, connector_id: string, user?: any) {
        try {
            // const organization = await this.organizationService.findOne(organization_id);
            // if(organization.is_root){
            //     return await this.logRepository.find({
            //         where: {
            //             'meta.connector_id': connector_id,
            //         },
            //         order: {
            //             timestamp: 'DESC',
            //         },
            //     });
            // }
            if(user && user.realm_access.roles.includes('admin')) {
                return await this.logRepository.find({
                    where: {
                        'meta.connector_id': connector_id,
                    },
                    order: {
                        timestamp: 'DESC',
                    },
                });           
            }
            else {
                return await this.logRepository.find({
                    where: {
                        'meta.organization_id': organization_id,
                        'meta.connector_id': connector_id,
                    },
                    order: {
                        timestamp: 'DESC',
                    },
                });
                return true;
            }
        } catch (error) {
            console.log(error);
            throw new BadRequestException('Bad request');
        }
    }

    async findServiceLogs(organization_id: string, service_id: string) {
        try {
            const organization = await this.organizationService.findOne(organization_id);
            if(organization.is_root){
                return await this.logRepository.find({
                    where: {
                        'meta.service_id': service_id,
                    },
                    order: {
                        timestamp: 'DESC',
                    },
                });
            }
            else {
                return await this.logRepository.find({
                    where: {
                        'meta.organization_id': organization_id,
                        'meta.service_id': service_id,
                    },
                    order: {
                        timestamp: 'DESC',
                    },
                });
                return true;
            }
        } catch (error) {
            console.log(error);
            throw new BadRequestException('Bad request');
        }
    }

    async findServicesLogs(organization_id: string, user?: any){
        try {
            // const organization = await this.organizationService.findOne(organization_id);
            // if(organization.is_root){
            //     return await this.logRepository.find({
            //         where: {
            //             'meta.context': 'services',
            //         },
            //         order: {
            //             timestamp: 'DESC',
            //         },
            //     });
            // }
            if(user && isUserAdmin(user)) {
                return await this.logRepository.find({
                    where: {
                        'meta.context': 'services',
                    },
                    order: {
                        timestamp: 'DESC',
                    },
                });            
            }
            else {
                return await this.logRepository.find({
                    where: {
                        'meta.organization_id': organization_id,
                        'meta.context': 'services',
                        'meta.admin': false,
                    },
                    order: {
                        timestamp: 'DESC',
                    },
                });
                return true;
            }
        } catch (error) {
            console.log(error);
            throw new BadRequestException('Bad request');
        }
    }
}
