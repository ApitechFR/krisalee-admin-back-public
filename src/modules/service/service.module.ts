import { forwardRef, Module, OnModuleInit } from '@nestjs/common';
import { ServiceService } from './service.service';
import { ServiceController } from './service.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Service } from './entities/service.entity';
import { ModeModule } from '../mode/mode.module';
import { OrganizationModule } from '../organization/organization.module';
import { KubernetesModule } from '../kubernetes/kubernetes.module';
import { ProductModule } from '../product/product.module';
import { SnapshotModule } from '../snapshot/snapshot.module';
import { KubernetesService } from '../kubernetes/kubernetes.service';
import { ProductService } from '../product/product.service';
import { winstonModule } from '../winston/winston.module';
import { WinstonService } from '../winston/winston.service';
import { ConnectorModule } from '../connector/connector.module';
import { ServiceAdminController } from './service-admin/service-admin.controller';
import { MailingModule } from "../mailing/mailing.module";

@Module({
  imports: [ 
    TypeOrmModule.forFeature([Service]),
    forwardRef(() => KubernetesModule),
    forwardRef(() => ConnectorModule),
    ModeModule,
    OrganizationModule,
    ProductModule,
    SnapshotModule,
    winstonModule,
      MailingModule
  ],
  controllers: [ServiceController,ServiceAdminController],
  providers: [ServiceService, KubernetesService, WinstonService],
  exports: [ServiceService],
})
export class ServiceModule implements OnModuleInit {
  constructor(
    private readonly serviceService: ServiceService,
    private readonly productService: ProductService,
  ) {}

  async onModuleInit() {
    await this.productService.initiateCreatindDeleting()
  }
}
