import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import {
  AddDateNow,
  ThrowDuplicateAttributeError,
} from '../../helpers/mainHelper';
import { OrganizationService } from '../organization/organization.service';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User) private userRepository: Repository<User>,
    private readonly organizationService: OrganizationService,
  ) {}

  async create(createUserDto: CreateUserDto, organization_id: string) {
    const organization = await this.organizationService.findOne(
      organization_id,
    );

    const user = new User();
    for (const key in createUserDto) {
      user[key] = createUserDto[key];
    }
    user['user_id'] = AddDateNow(createUserDto['name']);

    if (organization.is_root) {
      if (!createUserDto.organization_id) {
        return new BadRequestException('You need to specify the organization');
      }
      user['organization_id'] = createUserDto.organization_id;
    } else {
      user['organization_id'] = organization_id;
    }
    try {
      return await this.userRepository.save(user);
    } catch (error) {
      ThrowDuplicateAttributeError(error, 'email');
    }
  }

  async findAll(organization_id: string) {
    const organization = await this.organizationService.findOne(
      organization_id,
    );
    if (organization.is_root) {
      return await this.userRepository.find();
    } else {
      return await this.userRepository.find({ where: { organization_id } });
    }
  }

  async findOne(id: string, organization_id: string) {
    const organization = await this.organizationService.findOne(
      organization_id,
    );
    try {
      const user = await this.userRepository.findOneByOrFail({
        user_id: id,
      });
      if (user.organization_id !== organization_id && !organization.is_root) {
        return new UnauthorizedException(
          "You can't see users outside your organization",
        );
      }
      return user;
    } catch (error) {
      throw new NotFoundException('User Not Found');
    }
  }

  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    organization_id: string,
  ) {
    const user = await this.findOne(id, organization_id);
    for (const key in updateUserDto) {
      user[key] = updateUserDto[key];
    }
    await this.userRepository.update({ user_id: id }, user);
    return user;
  }

  async remove(id: string, organization_id: string) {
    const user = await this.findOne(id, organization_id);
    await this.userRepository.delete(user);
  }
}
