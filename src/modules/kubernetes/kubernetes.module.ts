import { forwardRef, Module } from '@nestjs/common';
import { KubernetesService } from './kubernetes.service';
import { KubernetesController } from './kubernetes.controller';
import { ServiceModule } from '../service/service.module';
import { winstonModule } from '../winston/winston.module';
import { WinstonService } from '../winston/winston.service';

@Module({
  imports: [forwardRef(() => ServiceModule), winstonModule],
  controllers: [KubernetesController],
  providers: [KubernetesService, WinstonService],
  exports: [KubernetesService],
})
export class KubernetesModule {}
