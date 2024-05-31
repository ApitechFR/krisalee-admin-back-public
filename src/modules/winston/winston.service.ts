import { Injectable, Inject, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { CreateLogDto } from '../log/dto/create-log.dto';

@Injectable()
export class WinstonService {

    constructor(
        @Inject(WINSTON_MODULE_PROVIDER) 
        protected readonly logger: Logger,
        ){}

    async create(createLogDto: CreateLogDto){
        try {
            switch (createLogDto.level){
                case 'info':
                    await this.logger.info(createLogDto.message, createLogDto.data);
                    break;
                case 'warn':
                    await this.logger.warn(createLogDto.message, createLogDto.data);
                    break;
                case 'error':
                    await this.logger.error(createLogDto.message, createLogDto.data);
                    break;
            }

        } catch (error) {
            throw new InternalServerErrorException(error);
        }
    }
}
