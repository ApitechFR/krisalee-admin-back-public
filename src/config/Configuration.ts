import { KeycloakConnectOptions } from 'nest-keycloak-connect';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConnectOptions } from 'ssh2-sftp-client';
import { Service } from '../modules/service/entities/service.entity';
import {LoggerOptions, transports} from 'winston';
import { MongoDB } from 'winston-mongodb';
import * as winston from 'winston';
import { format } from 'winston';
import { Organization } from 'src/modules/organization/entities/organization.entity';
import { HandlebarsAdapter } from "@nestjs-modules/mailer/dist/adapters/handlebars.adapter";

export class Configuration {
  private constructor() {}

  /** How much time you want to keep creating/checking a node in seconds */
  static nodeCreateTimeout = 600;

  /** The time between node creation check in seconds*/
  static nodeCreateWaitTime = 15;

  /** The time between node delete check in seconds*/
  static nodeDeleteWaitTime = 10;

  /** How much time you want to keep creating/checking a service in seconds*/
  static serviceCreateTimeout = 300;

  /** the time between service/pod checking in seconds*/
  static serviceWaitTime = 5;

  /** The timeout for rsync execution in seconds*/
  static rsyncTimeout = 300;

  /** true if you want to delete nodes after stoping the services, otherwise false */
  static deleteNodes = false;

  /** use Infra if true, don't otherwise */
  static useInfra = false;

  /** use Rsync to save/resotre data if true, otherwise false */
  static useRsync = false;

  /** use real connectors launching operation if true, false otherwise*/
  static useRealConnectors = true;

  /** Ldap to keycloak connector id */
  static importLdapId = 'import ldap';

  /** Alert Users connector id */
  static alertUserId = 'alert user';

  /** Import Documents connector id */
  static importDocId = 'fichier de synchronisation';

  /** Renew SSL connector id */
  static RenewSSLId = 'renouveler ssl';

  /** Valid Tag id */
  static validTagId = "valid_1690553345912";

  /** Prod Tag id */
  static prodTagId = "prod_1690553289436";

  /** Failed Tag id */
  static failedTagId = "failed_1716386348417";

  /** returns keycloak configuration object */
  static getKeyclaokConfiguration(): KeycloakConnectOptions {
    return {
      authServerUrl: process.env.KC_URL,
      realm: process.env.KC_REALM,
      clientId: process.env.KC_CLIENT_ID,
      secret: process.env.KC_SECRET,
    };
  }

  /** returns database configuration object */
  static getDbConfiguration(): TypeOrmModuleOptions {
    return {
      type: 'mongodb',
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      // synchronize: true,
      autoLoadEntities: true,
      authSource: 'admin',
      useUnifiedTopology: true,
    };
  }

  /** return sftp configuration object */
  static getSftpConfiguration(organization:Organization): ConnectOptions {
    const organization_env = organization.organization_env
    return {
      host: organization_env.SFTP_HOST,
      port: organization_env.SFTP_PORT,
      username: organization_env.SFTP_USERNAME,
      password: organization_env.SFTP_PASSWORD,
    };
  }

  static getWinstonConfig(): LoggerOptions {
    return {
      transports: [
        new MongoDB({
          format: format.combine(
            format.metadata(),
          ),
          db: `mongodb://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${parseInt(process.env.DB_PORT)}/${process.env.DB_NAME}?authSource=admin`,
          level: 'info',
          options: {
            useNewUrlParser: true,
            useUnifiedTopology: true,
          },
          tryReconnect: true,
          collection: 'log'
        }),
      ],
    }
  }

  static getSmtpConfiguration(): any {
    return {
      transport: {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        secure: false, // Use SSL/TLS if required
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        }
      },
      defaults: {
        from: process.env.SMTP_USER,
      },
      template: {
        dir: process.cwd() + '/templates/',
        adapter: new HandlebarsAdapter(),
        options: {
          strict: true,
        },
      },
    }
  }
}
