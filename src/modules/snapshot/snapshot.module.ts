import { forwardRef, Module } from '@nestjs/common';
import { SnapshotService } from './snapshot.service';
import { SnapshotController } from './snapshot.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Snapshot } from './entities/snapshot.entity';
import { OrganizationModule } from '../organization/organization.module';
import { TagModule } from '../tag/tag.module';
import {ServiceModule} from "../service/service.module";

@Module({
  imports: [TypeOrmModule.forFeature([Snapshot]), forwardRef(() => ServiceModule), OrganizationModule, TagModule],
  controllers: [SnapshotController],
  providers: [SnapshotService],
  exports: [SnapshotService]
})
export class SnapshotModule {}
