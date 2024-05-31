import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateModeDto } from './dto/create-mode.dto';
import { UpdateModeDto } from './dto/update-mode.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { Mode } from './entities/mode.entity';
import {
  AddDateNow,
  ThrowDuplicateAttributeError,
} from '../../helpers/mainHelper';
import { OrganizationService } from '../organization/organization.service';

@Injectable()
export class ModeService {
  constructor(
    @InjectRepository(Mode) private modeRepository: MongoRepository<Mode>,
    private readonly organizationService: OrganizationService,
  ) {}

  async create(createModeDto: CreateModeDto) {
    // check if there is no mode with the specified type
    const existModeType = await this.modeRepository.findOne({
      where: { type: createModeDto.type },
    });
    if (existModeType) {
      throw new BadRequestException('A mode with this type is already exist');
    }

    const mode = new Mode();
    for (const key in createModeDto) {
      mode[key] = createModeDto[key];
    }
    mode['mode_id'] = AddDateNow(createModeDto['name']);
    try {
      return await this.modeRepository.save(mode);
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException('Cannot create mode !');
    }
  }

  async findAll() {
    try {
      const modes = await this.modeRepository.find();
      return modes;
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException('Cannot get modes !');
    }
  }

  async findOne(id: string) {
    const mode = await this.modeRepository.findOne({
      where: {
        mode_id: id,
      },
    });
    if (!mode) {
      throw new NotFoundException('Mode Not Found');
    }
    return mode;
  }

  // async update(
  //   id: string,
  //   updateModeDto: UpdateModeDto,
  //   organization_id: string,
  // ) {
  //   const mode = await this.findOne(id, organization_id);
  //   for (const key in updateModeDto) {
  //     mode[key] = updateModeDto[key];
  //   }
  //   await this.modeRepository.update({ mode_id: id }, mode);
  //   return mode;
  // }

  // async remove(id: string, organization_id: string) {
  //   const mode = await this.findOne(id, organization_id);
  //   await this.modeRepository.remove(mode);
  // }
}
