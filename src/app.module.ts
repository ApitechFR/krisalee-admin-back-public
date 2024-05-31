import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ApikeyMiddleware } from './middlewares/apikey/apikey.middleware';

import { TypeOrmModule } from '@nestjs/typeorm';
import { KubernetesModule } from './modules/kubernetes/kubernetes.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { ModeModule } from './modules/mode/mode.module';
import { UserModule } from './modules/user/user.module';
import { ServiceModule } from './modules/service/service.module';
import { ConnectorModule } from './modules/connector/connector.module';
import {
  KeycloakConnectModule,
  AuthGuard,
  // ResourceGuard,
  RoleGuard,
} from 'nest-keycloak-connect';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ProductModule } from './modules/product/product.module';
import { Configuration } from './config/Configuration';
import { SnapshotModule } from './modules/snapshot/snapshot.module';
import { KeycloakModule } from './modules/keycloak/keycloak.module';
import {
  utilities as nestWinstonModuleUtilities,
  WinstonModule,
} from 'nest-winston';
import { winstonModule } from './modules/winston/winston.module';
import { LogModule } from './modules/log/log.module';
import { TagModule } from './modules/tag/tag.module';
import { ServiceAdminController } from './modules/service/service-admin/service-admin.controller';
import { MailingModule } from "./modules/mailing/mailing.module";
@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRoot(Configuration.getDbConfiguration()),
    KeycloakConnectModule.register(Configuration.getKeyclaokConfiguration()),
    WinstonModule.forRoot(Configuration.getWinstonConfig()),
    LogModule,
    KubernetesModule,
    OrganizationModule,
    ModeModule,
    UserModule,
    ServiceModule,
    ConnectorModule,
    ProductModule,
    SnapshotModule,
    KeycloakModule,
    winstonModule,
    TagModule,
      MailingModule
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    // { provide: APP_GUARD, useClass: ResourceGuard },
    { provide: APP_GUARD, useClass: RoleGuard },
  ],
})
export class AppModule{
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(ApikeyMiddleware)
      .exclude({ path: 'api/organization/cron', method: RequestMethod.POST })
      .forRoutes(ServiceAdminController);
  }
}
