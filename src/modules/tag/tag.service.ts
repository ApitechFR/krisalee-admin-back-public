import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Tag } from './entities/tag.entity';
import { MongoRepository } from 'typeorm';
import { OrganizationService } from '../organization/organization.service';
import { TagType } from 'src/enums/tagType';
import {Configuration} from "../../config/Configuration";

@Injectable()
export class TagService {
  constructor(
    @InjectRepository(Tag) private readonly tagRepository: MongoRepository<Tag>,
    private readonly organizationService: OrganizationService,
  ) {}

  async create(organization_id: string, createTagDto: CreateTagDto) {
    const organization = await this.organizationService.findOne(
      organization_id,
    );

    if (createTagDto.system)
      if (!organization.is_root)
        throw new ForbiddenException(
          'Only root organization can add system tags',
        );

    const tags = await this.findAll(organization_id);
    for (const tag of tags) {
      if (tag.system) {
        if (tag.type === createTagDto.type) {
          throw new BadRequestException(
            'There is already a tag system with this type',
          );
        }
      }
    }

    try {
      const tag = this.tagRepository.create({
        tag_id: `${createTagDto.name.toLowerCase()}_${Date.now()}`,
        name: createTagDto.name,
        description: createTagDto.description,
        system: createTagDto.system,
        unique: createTagDto.system ? createTagDto.unique : false,
        organization_id: organization.is_root ? null : organization_id,
        type: createTagDto.system ? createTagDto.type : TagType.CUSTOM,
      });
      return await this.tagRepository.save(tag);
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException('Cannot create Tag');
    }
  }

  async findAll(organization_id: string) {
    const organization = await this.organizationService.findOne(
      organization_id,
    );

    if (organization.is_root) {
      return await this.tagRepository.find();
    } else {
      let tags = await this.tagRepository.find({
        where: {
          organization_id: { $in: [null, organization_id] },
        },
      });

      return tags;
    }
  }

  async findManyByIds(ids: string[]) {
    return await this.tagRepository.find({
      where: {
        tag_id: { $in: ids },
      },
    });
  }

  async findOne(organization_id: string, id: string) {
    try {
      const tag = await this.tagRepository.findOneOrFail({
        where: { tag_id: id },
      });

      if (tag.system) {
        return tag;
      } else {
        if (tag.organization_id === organization_id) {
          return tag;
        } else {
          throw new NotFoundException('Tag not found');
        }
      }
    } catch (error) {
      console.log(error);
      throw new NotFoundException('Tag not found');
    }
  }

  update(id: number, updateTagDto: UpdateTagDto) {
    return `This action updates a #${id} tag`;
  }

  async remove(organization_id: string, id: string) {
    const tag = await this.findOne(organization_id, id);

    if (tag.system) {
      throw new ForbiddenException("You can't delete system tags");
    } else {
      await this.tagRepository.remove(tag);
    }
  }
}
