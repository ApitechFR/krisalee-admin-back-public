import {
  Controller,
  Patch,
  Param,
  Delete,
  Body,
  UseInterceptors,
  ClassSerializerInterceptor,
} from '@nestjs/common';
import { SnapshotService } from './snapshot.service';
import { CreateSnapshotDto } from './dto/create-snapshot.dto';
import { UpdateSnapshotDto } from './dto/update-snapshot.dto';
import { AssignTagDto } from './dto/assign-tag.dto';
import { AuthenticatedUser, Roles } from 'nest-keycloak-connect';

@UseInterceptors(ClassSerializerInterceptor)
@Controller(':organization_id/snapshot')
export class SnapshotController {
  constructor(private readonly snapshotService: SnapshotService) {}

  @Delete(':id')
  async delete(
    @Param('organization_id') organization_id: string,
    @Param('id') id: string,
  ) {
    return await this.snapshotService.delete(organization_id, id);
  }

  @Patch(":id")
  async update(@Param('id') id: string, @Body() updateSnapshotDTO: UpdateSnapshotDto) {
    return await this.snapshotService.patch(id, updateSnapshotDTO)
  }

  @Roles({ roles: ['realm:admin'] })
  @Delete('purge/AllSnapshots')
  async purge(
    @Param('organization_id') organization_id: string,
  ) {
    return await this.snapshotService.purge(
      organization_id,
    );
  }

  @Patch(':id/addtag/:tag_id')
  async assignTag(
    @Param('organization_id') organization_id: string,
    @Param('id') id: string,
    @Param('tag_id') tag_id: string,
    @Body() assignTagDto: AssignTagDto,
    @AuthenticatedUser() user: any,
  ) {
    return await this.snapshotService.assignTag(
      organization_id,
      id,
      tag_id,
      user,
      assignTagDto.force,
    );
  }

  //TODO: implement delete tag
  @Patch(':id/deletetag/:tag_id')
  async deleteTag(
    @Param('organization_id') organization_id: string,
    @Param('id') id: string,
    @Param('tag_id') tag_id: string,
  ) {
    return await this.snapshotService.UnassignTag(organization_id, id, tag_id);
  }
}
