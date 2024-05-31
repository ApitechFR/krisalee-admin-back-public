import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ClassSerializerInterceptor,
  UseInterceptors,
} from '@nestjs/common';
import { TagService } from './tag.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';

@UseInterceptors(ClassSerializerInterceptor)
@Controller(':organization_id/tag')
export class TagController {
  constructor(private readonly tagService: TagService) {}

  // @Post()
  // async create(
  //   @Param('organization_id') organization_id: string,
  //   @Body() createTagDto: CreateTagDto,
  // ) {
  //   return await this.tagService.create(organization_id, createTagDto);
  // }

  @Get()
  async findAll(@Param('organization_id') organization_id: string) {
    return await this.tagService.findAll(organization_id);
  }

  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.tagService.findOne(+id);
  // }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTagDto: UpdateTagDto) {
    return this.tagService.update(+id, updateTagDto);
  }

  @Delete(':id')
  async remove(
    @Param('organization_id') organization_id: string,
    @Param('id') id: string,
  ) {
    return await this.tagService.remove(organization_id, id);
  }
}
