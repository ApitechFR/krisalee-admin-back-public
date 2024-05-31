import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  forwardRef,
} from '@nestjs/common';
import { KeycloakAdminClient } from '@s3pweb/keycloak-admin-client-cjs';
import UserRepresentation from '@keycloak/keycloak-admin-client/lib/defs/userRepresentation';
import { Organization } from '../organization/entities/organization.entity';
import { OrganizationService } from '../organization/organization.service';
import { User } from './entities/user.entity';
import { AlertUsers } from '../connector/classes/AlertUsers';
import { SmsHeader } from 'src/enums/smsHeader';
import { ServiceService } from '../service/service.service';
import { ServiceStatus } from 'src/enums/serviceStatus';

@Injectable()
export class KeycloakService {
  constructor(
    @Inject(forwardRef(() => ServiceService))
    private serviceService: ServiceService,
    private organizationService: OrganizationService,
    @Inject(forwardRef(() => AlertUsers))
    private alertUsers: AlertUsers,
  ) {}

  private realmName: string;

  setRealmName(realmName: string) {
    this.realmName = realmName;
  }

  getRealmName() {
    return this.realmName;
  }

  async keycloakAuthenticate(
    kcAdminClient: KeycloakAdminClient,
    organization: Organization,
  ) {
    // Authorize with username / password
    try {
      await kcAdminClient.auth({
        username:
          organization.organization_env.services_credentials
            .KC_SERVICE_ADMIN_USERNAME,
        password:
          organization.organization_env.services_credentials
            .KC_SERVICE_ADMIN_PASSWORD,
        grantType: 'password',
        clientId: organization.organization_env.KC_SERVICE_ADMIN_CLIENT_ID,
      });
    } catch (error) {
      console.log('keycloak authinticate error:');
      console.log(error);
      throw new BadRequestException('Keycloak authentication failed');
    }
  }

  async getUsersForRealm(
    client: KeycloakAdminClient,
  ): Promise<UserRepresentation[]> {
    // List all users from realm
    const users = await client.users.find({
      realm: process.env.KC_SERVICE_REALM,
      max: 1000,
    });

    console.log(
      `Found ${users.length} users in Realm "${process.env.KC_SERVICE_REALM}"`,
    );
    console.table(
      users.map((u) => {
        return {
          username: u.username,
          firstname: u.firstName,
          lastname: u.lastName,
          email: u.email,
          enabled: u.enabled,
          emailVerified: u.emailVerified,
        };
      }),
    );

    return users;
  }

  async keycloakExample(client: KeycloakAdminClient) {
    // List all users
    const users = await client.users.find();

    // Override client configuration for all further requests:
    client.setConfig({
      realmName: 'another-realm',
    });

    // This operation will now be performed in 'another-realm' if the user has access.
    const groups = await client.groups.find();

    // Set a `realm` property to override the realm for only a single operation.
    // For example, creating a user in another realm:
    await client.users.create({
      realm: 'a-third-realm',
      username: 'username',
      email: 'user@example.com',
    });
  }

  async getUsersGlobal(client: KeycloakAdminClient) {
    const realms = await client.realms.find();
    const allUsers = [];

    realms.forEach(async (r) => {
      // console.log('Found realm', r.realm, r.id, r.displayName);

      const realmName = r.realm;
      if (realmName) {
        allUsers.push(await this.getUsersForRealm(client));
      }
    });
  }

  async getUsers(organization_id: string) {
    const organization = await this.organizationService.findOne(
      organization_id,
    );
    
    let auth = await this.serviceService.findOne(organization_id, "auth");
    let authWithStatus = await this.serviceService.appendStatusToServices([auth]);
    //Si Auth service éteint
    if (authWithStatus[0].status === ServiceStatus.INACTIVE){
      throw new InternalServerErrorException("Aucune données à afficher.\nLe service Authentification doit être démarré");
    }
    
    try {
      const keycloakAdminClient = new KeycloakAdminClient({
        baseUrl: organization.organization_env.KC_SERVICE_URL,
      });

      await this.keycloakAuthenticate(keycloakAdminClient, organization);

      let kcUsers = await keycloakAdminClient.users.find({
        realm: process.env.KC_SERVICE_REALM,
        max: 1000,
      });

      kcUsers = kcUsers.filter(
        (kcUser) => kcUser.username !== 'postmaster@krisalee.com',
      );

      const users: User[] = [];

      for (const kcUser of kcUsers) {
        const user = new User(kcUser);
        users.push(user);
      }

      return users;
    } catch (error) {
        console.log("-----------------------------------------------");
        console.log(error.message);
        console.log("-----------------------------------------------");
      throw new InternalServerErrorException("Problème de connexion au service 'Authentification'.\n Relancez vos services sinon contactez notre support");
    }
  }

  async alertUser(organization_id: string, id: string) {
    const organization = await this.organizationService.findOne(
      organization_id,
    );
    this.alertUsers.organization = organization;

    const kc = new KeycloakAdminClient({
      baseUrl: organization.organization_env.KC_SERVICE_URL,
    });

    await this.keycloakAuthenticate(kc, organization);

    const user = await kc.users.findOne({
      id,
      realm: process.env.KC_SERVICE_REALM,
    });

    if (!user) {
      throw new InternalServerErrorException('User id not found');
    }

    try {
      if (user.id && user.attributes && user.attributes.alerted) {
        const sentSmsResult = await this.alertUsers.alertOneUser(
          user,
          kc,
          SmsHeader.DEFAULT,
          undefined,
          organization_id,
        );
        if (!sentSmsResult.sent) {
          //Unset the alerted attribute
          await kc.users.update(
            { id: user.id, realm: process.env.KC_SERVICE_REALM },
            {
              attributes: {
                ...user.attributes,
                alerted: 0,
              },
            },
          );
          console.log(`Error: User ${user.username} n'a pas reçu le sms`);
          throw new InternalServerErrorException(
            `Error: User ${user.username} n'a pas reçu le sms`,
          );
        } else {
          return new User(user);
        }
      } else {
        console.log(
          `Error: User ${user.username} without id/attributes/alerted`,
        );
        throw new InternalServerErrorException(
          `Error: User ${user.username} without id/attributes/alerted`,
        );
      }
    } catch (error) {
      await kc.users.update(
        { id: user.id, realm: process.env.KC_SERVICE_REALM },
        {
          attributes: {
            ...user.attributes,
            alerted: 0,
          },
        },
      );
      console.error(error);
      throw new InternalServerErrorException(error.message);
    }
  }
}
