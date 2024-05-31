import { Module } from '@nestjs/common';
import { LogController } from './log.controller';
import { LogService } from './log.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationModule } from '../organization/organization.module';
import { Log } from './entities/log.entity';


@Module({
  imports: [
    TypeOrmModule.forFeature([Log]),
    OrganizationModule,
  ],
  providers: [LogService],
  controllers: [LogController]
})
export class LogModule {}
