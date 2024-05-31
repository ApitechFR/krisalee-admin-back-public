import { KeycloakAdminClient } from '@s3pweb/keycloak-admin-client-cjs';
import { AlertLevelEnum } from '../enums/ldapToKeycloak.enum';
import { ConnectorInterface } from './Connector';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
// import { KeycloakService } from 'src/modules/keycloak/keycloak.service';
// import { ServiceService } from 'src/modules/service/service.service';
import axios from 'axios';
import { FakePhoneMessageProvider } from '../providers/sms/fake.provider';
import { OvhPhoneMessageProvider } from '../providers/sms/ovh.provider';
import {
  MessageContentData,
  MessageProviderTypeEnum,
} from '../providers/message.dto';
import { MessageProvider } from '../providers/message.provider';
import { FakeMailMessageProvider } from '../providers/email/fake.provider';
import { PhenixMailMessageProvider } from '../providers/email/phenix.provider';
import { passwordGenerator } from 'src/helpers/passwordGenerator';
import { Configuration } from 'src/config/Configuration';
import { Organization } from 'src/modules/organization/entities/organization.entity';
import UserRepresentation from '@keycloak/keycloak-admin-client/lib/defs/userRepresentation';

@Injectable()
export class AlertUsers extends ConnectorInterface {
  private fakePhoneMessageProvider = new FakePhoneMessageProvider();
  private ovhPhoneMessageProvider = new OvhPhoneMessageProvider();
  private fakeMailMessageProvider = new FakeMailMessageProvider();
  private phenixMailMessageProvider = new PhenixMailMessageProvider();
  organization: Organization;

  async alertOneUser(
    user: UserRepresentation,
    kc: KeycloakAdminClient,
    sms_header: string,
    messageProvider?: MessageProvider,
    organization_id?: string,
  ) {
    if (!messageProvider) {
      messageProvider = this.getMessageProvider();
    }

    const newPassword = passwordGenerator(16);

    //Update user password and alerted attribute
    await kc.users.update(
      { id: user.id, realm: process.env.KC_SERVICE_REALM },
      {
        credentials: [
          {
            type: 'password',
            userLabel: 'My password',
            value: newPassword,
          },
        ],
        attributes: {
          ...user.attributes,
          alerted: 1,
        },
      },
    );

    // ######################
    // GENERATE THE KEYCLOAK ACTIONS LINK
    // ######################

    // const response = await axios.get(
    //   `${
    //     process.env.KC_SERVICE_URL
    //   }/realms/${this.keycloakService.getRealmName()}/execute-actions`,
    //   {
    //     params: {
    //       userId: user.id,
    //       clientId: clientId,
    //       // 'redirectUri' value should be also put in Keycloak, under 'Clients > 'account' > 'Valid redirect URIs'
    //       redirectUri: process.env.SITE_INTERNE_URL,
    //     },
    //     // TODO handle multiple actions (Provider 'keycloak-execute-actions' needs to be updated)
    //     data: ['UPDATE_PASSWORD'], // RequiredActionAlias
    //     headers: {
    //       Authorization: `Bearer ${kc.accessToken}`,
    //       'Content-Type': 'application/json',
    //     },
    //   },
    // );
    // const link = response.data;

    const link = `https://${process.env.ORG_DOMAIN}`;

    const data: MessageContentData = {
      sms_header: sms_header,
      username: user.username,
      password: newPassword,
      internalEmail: user.attributes.internal_email[0],
      destination: user.attributes.phoneNumber[0],
      organization: organization_id
        ? organization_id.toUpperCase()
        : this.organization_id.toUpperCase(),
      activationUrl: link,
    };

    const sentSmsResult = await messageProvider.run(data);

    return sentSmsResult;
  }

  getMessageProvider() {
    let messageProvider: MessageProvider;

    switch (process.env.ALERT_PROVIDER_TYPE) {
      default:
      case MessageProviderTypeEnum.SMS:
        switch (process.env.ALERT_PROVIDER_NAME) {
          default:
          case this.fakePhoneMessageProvider.name:
            messageProvider = this.fakePhoneMessageProvider;
            break;
          case this.ovhPhoneMessageProvider.name:
            messageProvider = this.ovhPhoneMessageProvider;
            break;
        }
        break;
      case MessageProviderTypeEnum.EMAIL:
        switch (process.env.ALERT_PROVIDER_NAME) {
          default:
          case this.fakeMailMessageProvider.name:
            messageProvider = this.fakeMailMessageProvider;
            break;
          case this.phenixMailMessageProvider.name:
            messageProvider = this.phenixMailMessageProvider;
            break;
        }
        break;
    }

    return messageProvider;
  }

  private async sendLoginLinkToUsers(
    kc: KeycloakAdminClient,
    alertLevels: AlertLevelEnum[],
    sms_header: string,
    mode_id: string
    // realm: string,
  ) {
    const messageProvider = this.getMessageProvider();

    let alertLevelUsers: UserRepresentation[] = [];

    if (alertLevels.length == 0 || !alertLevels){
      alertLevelUsers = await kc.users.find({realm: process.env.KC_SERVICE_REALM, max: parseInt(process.env.MAX_FIND_KEYCLOAK)});
    }
    // Get AlertLevelEnum member as string
    else{
    for(const alertLevel of alertLevels){
      // alertLevelString = Object.keys(AlertLevelEnum)
      //   .find(
      //     (key) =>
      //       AlertLevelEnum[key as keyof typeof AlertLevelEnum] === alertLevel,
      //   )!
      //   .toLowerCase();

      // Fetch role from Keycloak
      // const alertLevelRole = await kc.roles.findOneByName({
      //   name: alertLevelString,
      //   realm: process.env.KC_SERVICE_REALM,
      // });
      const users = await kc.users.find({realm: process.env.KC_SERVICE_REALM, q: `alert_level:${alertLevel}`, max: parseInt(process.env.MAX_FIND_KEYCLOAK)})
      alertLevelUsers = [...alertLevelUsers,...users];
    }
  }
    // if (alertLevelRole && alertLevelRole.name) {
    //   // Fetch users from Keycloak
    //   const alertLevelUsers = await kc.roles.findUsersWithRole({
    //     name: alertLevelRole?.name,
    //     realm: process.env.KC_SERVICE_REALM,
    //   });
      // const alertLevelUsers = await kc.users.find({username: 'tom-brian.garcia@apitech.fr', realm});

      // Store data to display
      let alreadyEnabledUsers = [];
      let alertedDisabledUsers = [];
      let failedDisabledUsers = [];

      //console.log('alertLevelUsers', alertLevelUsers);
      for (let user of alertLevelUsers) {
        if (user.id && user.attributes && user.attributes.alerted) {
          if ((mode_id || (!mode_id && user.attributes.alerted[0] == 0)) && user.attributes.phoneNumber) {
            try {
              const sentSmsResult = await this.alertOneUser(
                user,
                kc,
                sms_header,
                messageProvider,
              );

              if (sentSmsResult.sent) {
                alertedDisabledUsers.push(user);
              } else {
                //Unset credentials for the user
                await kc.users.update(
                  { id: user.id, realm: process.env.KC_SERVICE_REALM },
                  {
                    attributes: {
                      ...user.attributes,
                      alerted: 0,
                    },
                  },
                );
                await this.logService.create({
                  level: 'info',
                  message: `The message hasn't be sent successfully`,
                  data: {
                    organization_id: this.organization_id,
                    connector_id: Configuration.alertUserId,
                  },
                });
                console.log(``);
                throw new BadRequestException(
                  `Error: The message hasn't been sent successfully to ${user.username}`,
                );
              }
              // return ovhPhoneMessageProvider.run(data);
            } catch (ex) {
              //Unset credentials for the user
              await kc.users.update(
                { id: user.id, realm: process.env.KC_SERVICE_REALM },
                {
                  attributes: {
                    ...user.attributes,
                    alerted: 0,
                  },
                },
              );
              console.error(ex);
              failedDisabledUsers.push(user);
            }
          } else {
            // TODO Send information email ? (login link, without token/required action)

            alreadyEnabledUsers.push(user);
          }
        } else {
          console.log(
            `Error: User ${user.username} without id/attributes/alerted`,
          );
          failedDisabledUsers.push(user);
          continue;
        }
      }

      console.log(
        `Sent sms for ${alertedDisabledUsers.length} users (${alreadyEnabledUsers.length} users already enabled) !`,
      );
      await this.logService.create({
        level: 'info',
        message: `Sent sms for ${alertedDisabledUsers.length} users (${alreadyEnabledUsers.length} users already enabled) !`,
        data: {
          organization_id: this.organization_id,
          connector_id: Configuration.alertUserId,
        },
      });
      if (failedDisabledUsers.length > 0) {
        console.error(
          `Failed to send sms for ${failedDisabledUsers} users (${failedDisabledUsers.map(
            (u) => u.email,
          )})`,
        );
        await this.logService.create({
          level: 'info',
          message: `Failed to send sms for ${failedDisabledUsers} users (${failedDisabledUsers.map(
            (u) => u.email,
          )})`,
          data: {
            organization_id: this.organization_id,
            connector_id: Configuration.alertUserId,
          },
        });

        // throw new InternalServerErrorException(
        //   `[AlertLevel] ${alertLevelString} : Failed to send sms for ${failedDisabledUsers.length} users !`,
        // );
      }
      return {
        alertedUsers: alertedDisabledUsers.length,
        alreadyEnabledUsers: alreadyEnabledUsers.length,
        failedUsers: failedDisabledUsers.length,
      };
    //}
  }

  async run(
    alert_levels: number[],
    sms_header: string,
    organization: Organization,
    mode_id?: string,
  ) {
    this.organization = organization;

    this.setOrganizationId(this.organization.organization_id);

    this.keycloakService.setRealmName(this.organization.organization_id);

    const keycloakAdminClient = new KeycloakAdminClient({
      baseUrl: this.organization.organization_env.KC_SERVICE_URL,
      // baseUrl: process.env.KC_SERVICE_URL,
    });
    console.info('Keycloak client initialized !');

    await this.keycloakService.keycloakAuthenticate(
      keycloakAdminClient,
      this.organization,
    );
    console.info('Keycloak client authenticated !');

    const response = await this.sendLoginLinkToUsers(
      keycloakAdminClient,
      alert_levels,
      sms_header,
      mode_id
    );

    return response;
  }
}
