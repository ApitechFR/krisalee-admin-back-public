import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseInterceptors,
  ClassSerializerInterceptor,
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@UseInterceptors(ClassSerializerInterceptor)
@Controller(':organization_id/user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  async create(
    @Param('organization_id') organization_id: string,
    @Body() createUserDto: CreateUserDto,
  ) {
    return await this.userService.create(createUserDto, organization_id);
  }

  @Get()
  async findAll(@Param('organization_id') organization_id: string) {
    return await this.userService.findAll(organization_id);
  }

  @Get(':id')
  async findOne(
    @Param('organization_id') organization_id: string,
    @Param('id') id: string,
  ) {
    return await this.userService.findOne(id, organization_id);
  }

  @Patch(':id')
  async update(
    @Param('organization_id') organization_id: string,
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return await this.userService.update(id, updateUserDto, organization_id);
  }

  @Delete(':id')
  async remove(
    @Param('organization_id') organization_id: string,
    @Param('id') id: string,
  ) {
    return await this.userService.remove(id, organization_id);
  }
}
