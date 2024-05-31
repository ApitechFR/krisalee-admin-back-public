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
import { ModeService } from './mode.service';
import { CreateModeDto } from './dto/create-mode.dto';
import { UpdateModeDto } from './dto/update-mode.dto';
import { Roles } from 'nest-keycloak-connect';

@UseInterceptors(ClassSerializerInterceptor)
@Controller('mode')
export class ModeController {
  constructor(private readonly modeService: ModeService) {}

  @Post()
  @Roles({ roles: ['realm:admin'] })
  async create(@Body() createModeDto: CreateModeDto) {
    return await this.modeService.create(createModeDto);
  }

  @Get('/getAll')
  async findAll() {
    return await this.modeService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.modeService.findOne(id);
  }

  // @Patch(':id')
  // async update(
  //   @Param('organization_id') organization_id: string,
  //   @Param('id') id: string,
  //   @Body() updateModeDto: UpdateModeDto,
  // ) {
  //   return await this.modeService.update(id, updateModeDto, organization_id);
  // }

  // @Delete(':id')
  // async remove(
  //   @Param('organization_id') organization_id: string,
  //   @Param('id') id: string,
  // ) {
  //   return await this.modeService.remove(id, organization_id);
  // }
}
