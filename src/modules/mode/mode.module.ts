import { Module } from '@nestjs/common';
import { ModeService } from './mode.service';
import { ModeController } from './mode.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Mode } from './entities/mode.entity';
import { OrganizationModule } from '../organization/organization.module';

@Module({
  imports: [TypeOrmModule.forFeature([Mode]), OrganizationModule],
  controllers: [ModeController],
  providers: [ModeService],
  exports: [ModeService],
})
export class ModeModule {}
