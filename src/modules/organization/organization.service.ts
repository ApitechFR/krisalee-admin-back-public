import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { MongoRepository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Organization } from './entities/organization.entity';
import {
  AddDateNow,
  ThrowDuplicateAttributeError,
} from '../../helpers/mainHelper';

@Injectable()
export class OrganizationService {
  constructor(
    @InjectRepository(Organization)
    private organizationRepository: MongoRepository<Organization>,
  ) {}

  async create(createOrganizationDto: CreateOrganizationDto) {
    if (createOrganizationDto.name.includes('_')) {
      throw new BadRequestException('Name cannot include underscores');
    }
    // Check if the organization mame/id already exist
    await this.isOrgAlreadyExist(createOrganizationDto.name);

    // Save in db
    try {
      const organization = new Organization();
      for (const key in createOrganizationDto) {
        organization[key] = createOrganizationDto[key];
      }
      organization.organization_id = createOrganizationDto.name
        .toLocaleLowerCase()
        .replace(/\s/g, '');
      return await this.organizationRepository.save(organization);
    } catch (error) {
      console.log(error);
      if (error.code == 11000) {
        throw new ConflictException(
          'Conflict name/organization_id (Pensez à changer le nom)',
        );
      } else {
        throw new InternalServerErrorException(error.message);
      }
    }
  }

  async findAll() {
    return await this.organizationRepository.find();
  }

  async findOne(id: string) {
    try {
      const organization = await this.organizationRepository.findOneByOrFail({
        organization_id: id,
      });
      return organization;
    } catch (error) {
      console.log(error);
      throw new NotFoundException('Organization Not Found');
    }
  }

  async update(id: string, updateOrganizationDto: UpdateOrganizationDto) {
    if (updateOrganizationDto.name.includes('_')) {
      throw new BadRequestException('Name cannot include underscores');
    }
    try {
      const organization = await this.findOne(id);
      for (const key in updateOrganizationDto) {
        organization[key] = updateOrganizationDto[key];
      }
      return await this.organizationRepository.save(organization);
    } catch (error) {
      console.log(error);
      if (error.code == 11000) {
        throw new ConflictException(
          'Conflict name/organization_id (Pensez à changer le nom)',
        );
      } else if (error.status == 404) {
        throw new NotFoundException('Organization Not Found');
      } else {
        throw new InternalServerErrorException(error.message);
      }
    }
  }

  async remove(id: string) {
    try {
      await this.organizationRepository.delete({ organization_id: id });
    } catch (error) {}
  }

  async findByIds(ids: any) {
    ids = ids.split(',');
    return await this.organizationRepository.find({
      where: {
        organization_id: { $in: ids },
      },
    });
  }

  private async isOrgAlreadyExist(name: string) {
    const organization_id = name.toLocaleLowerCase().replace(/\s/g, '');
    const existOrgId = await this.organizationRepository.findOne({
      where: {
        organization_id: organization_id,
      },
    });
    const existOrgName = await this.organizationRepository.findOne({
      where: { name: name },
    });
    if (existOrgId || existOrgName) {
      throw new ConflictException('Organization name or Id already exist');
    }
  }
}
