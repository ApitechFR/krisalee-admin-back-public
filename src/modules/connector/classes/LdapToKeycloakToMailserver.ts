// import KeycloakAdminClient from '@keycloak/keycloak-admin-client';
import { KeycloakAdminClient } from '@s3pweb/keycloak-admin-client-cjs';

import RealmRepresentation from '@keycloak/keycloak-admin-client/lib/defs/realmRepresentation';
import * as fsAsync from 'fs/promises';
import * as fsSync from 'fs';
import UserRepresentation from '@keycloak/keycloak-admin-client/lib/defs/userRepresentation';
import * as ssh2SftpClient from 'ssh2-sftp-client';
import {
  CSV_USERS_FORMAT_GRANDLYON,
  ImportUserDTO,
  UserRoundcubeDTO,
} from '../dto/import-user-dto';
import { ValidateUserDTO, userValidationRules } from '../dto/validate-user-dto';
import {
  CredentialsDTO,
  EmailAccount,
  EmailDTO,
  SftpResult,
} from '../interfaces/ldapToKeycloak.interface';
import { RoleMappingPayload } from '../interfaces/ldapToKeycloak.interface';
import { ConnectorInterface } from './Connector';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Configuration } from 'src/config/Configuration';
import { V1Pod } from '@kubernetes/client-node';
import { randomUUID } from 'crypto';
import { parse, stringify } from 'csv';
import { logCommandWithResult } from 'src/helpers/mainHelper';
import { execSync } from 'child_process';
import { ServiceType } from '../dto/run-connector.dto';
import { Organization } from 'src/modules/organization/entities/organization.entity';
import parsePhoneNumber from 'libphonenumber-js';
import { AlertLevelEnum } from '../enums/ldapToKeycloak.enum';

@Injectable()
export class LdapToKeycloakToMailserver extends ConnectorInterface {
  /** The current organization representation */
  private organization: Organization;

  private async findAllMailUsers(
    pod: V1Pod,
    domain: string,
  ): Promise<EmailAccount[]> {
    const emailListRes = await this.kubernetesService.execCommand(
      this.organization.organization_id,
      pod,
      'setup email list',
    );

    if (emailListRes.success) {
      const emails = emailListRes.content
        .split('\r\n') // Split by line
        .filter((val) => val != '') // Remove empty lines
        .filter(
          (val) =>
            val.includes(domain) &&
            !val.includes('ERROR') &&
            !val.includes('Error'),
        ) // Take only emails with the requested domain
        .map((val) => {
          const values = val.split(' ');

          // ex: '* postmaster@krisalee.joona.fr ( 10K / ~ ) [0%]'
          return {
            email: values[1], // postmaster@krisalee.joona.fr
            storageUsed: values[3], // 10K
            storageLimit: values[5], // ~
            storagePercent: values[7], // [0%]
          } as EmailDTO;
        })
        .map((email) => new EmailAccount(email)); // Put into a parsed data obj
      return emails;
    }

    return [];
  }

  private async existOneMailUser(
    pod: V1Pod,
    domain: string,
    username: string,
  ): Promise<Boolean> {
    const emails = await this.findAllMailUsers(pod, domain);

    const foundUser = emails.find(
      (e) => e.username == username && e.domain == domain,
    );
    console.log(
      'User',
      username,
      foundUser != undefined ? 'found' : 'not found',
      'on domain',
      domain,
    );

    return foundUser != undefined;
  }

  private async syncOneMailUser(
    pod: V1Pod,
    domain: string,
    username: string,
    password: string,
  ): Promise<Boolean> {
    const userValues = `${username}@${domain} ${password}`;

    if (await this.existOneMailUser(pod, domain, username)) {
      const updateEmailRes = await this.kubernetesService.execCommand(
        this.organization.organization_id,
        pod,
        `setup email update ${userValues} `,
      );
      console.log(
        `[${domain}] Update ${username} - ${
          updateEmailRes.success ? 'OK (SUCCESS)' : 'KO (FAILED)'
        }`,
      );
      await this.logService.create({
        level: 'info',
        message: `[${domain}] Update ${username} - ${
          updateEmailRes.success ? 'OK (SUCCESS)' : 'KO (FAILED)'
        }`,
        data: {
          organization_id: this.organization_id,
          connector_id: Configuration.importLdapId,
        },
      });
      return updateEmailRes.success;
    } else {
      const addEmailRes = await this.kubernetesService.execCommand(
        this.organization.organization_id,
        pod,
        `setup email add ${userValues} `,
      );
      console.log(
        `[${domain}] Added ${username} - ${
          addEmailRes.success ? 'OK (SUCCESS)' : 'KO (FAILED)'
        }`,
      );
      await this.logService.create({
        level: 'info',
        message: `[${domain}] Added ${username} - ${
          addEmailRes.success ? 'OK (SUCCESS)' : 'KO (FAILED)'
        }`,
        data: {
          organization_id: this.organization_id,
          connector_id: Configuration.importLdapId,
        },
      });
      return addEmailRes.success;
    }
  }

  private async syncAllMailUsers(
    pod: V1Pod,
    domain: string,
    credentials: CredentialsDTO[],
  ): Promise<void> {
    let successCount = 0,
      failCount = 0;

    for (let creds of credentials) {
      const res = await this.syncOneMailUser(
        pod,
        domain,
        creds.username,
        creds.password,
      );
      if (res) {
        successCount += 1;
      } else {
        failCount += 1;
      }
    }

    console.log(
      successCount,
      'email accounts added/updated with success,',
      failCount,
      'email accounts failed',
    );
    await this.logService.create({
      level: 'info',
      message: `${successCount} email accounts added/updated with success,
      ${failCount} email accounts failed`,
      data: {
        organization_id: this.organization_id,
        connector_id: Configuration.importLdapId,
      },
    });
  }

  private async readFileFromSFTP(remotePath: string): Promise<SftpResult> {
    const client = new ssh2SftpClient();

    const localPath = `/tmp/import_users_${Date.now()}.csv`;
    const result: SftpResult = { ok: false, path: localPath };

    try {
      await client.connect(Configuration.getSftpConfiguration(this.organization));
      console.log('[SFTP] Connected !');

      const fileExists = await client.exists(remotePath);

      if (fileExists) {
        // Download file
        await client.get(remotePath, localPath);
        console.log('[SFTP] File downloaded successfully!');
        await this.logService.create({
          level: 'info',
          message: `[SFTP] File ${remotePath} downloaded successfully!`,
          data: {
            organization_id: this.organization_id,
            connector_id: Configuration.importLdapId,
          },
        });

        // Check that file can be accessed
        await fsAsync.access(localPath);

        result.ok = true;
      } else {
        console.error('[SFTP] File not found on server.');
        await this.logService.create({
          level: 'info',
          message: `[SFTP] File ${remotePath} not found on server.`,
          data: {
            organization_id: this.organization_id,
            connector_id: Configuration.importLdapId,
          },
        });
      }
    } catch (err) {
      console.error('[SFTP] Error during file download', err);
      await this.logService.create({
        level: 'info',
        message: `[SFTP] Error during file download', ${err}`,
        data: {
          organization_id: this.organization_id,
          connector_id: Configuration.importLdapId,
        },
      });
    } finally {
      await client.end();
      return result;
    }
  }

  private async importUsersFromCSV(path: string) {
    const userDTOs: ValidateUserDTO[] = [];

    // Check path/file (will throw error if needed)
    await fsAsync.access(path, fsAsync.constants.R_OK);

    const fileContent = await fsAsync.readFile(path, 'latin1');

    // Parse CSV file content
    const parser = parse(fileContent, {
      delimiter: ';',
      bom: true,
      encoding: 'utf-8',
      columns: CSV_USERS_FORMAT_GRANDLYON.COLUMNS,
    });

    /** a set to store some users attributes (usefull csv validation when we have some attributes that should not be duplicated) */
    const phoneNumbers: Set<string> = new Set();
    let lineNumber: number = 0;
    
    for await (const row of parser) {
      // Avoid taking header row
      if (
        JSON.stringify(Object.keys(row)) !== JSON.stringify(Object.values(row))
      ) {
        lineNumber++;
        const userDto = new ValidateUserDTO(new ImportUserDTO(row));
        const user = await this.ValidateUsersFields(userDto, lineNumber, phoneNumbers);
        if(user){
          //use standard phone number
          row.P_Phone = user.phoneNumber;
          phoneNumbers.add(user.phoneNumber);
          userDTOs.push(new ValidateUserDTO(new ImportUserDTO(row)));
        }
      }
    }

    return userDTOs;
  }

  private async ValidateUsersFields(user: ValidateUserDTO,lineNumber: number, phoneNumbers: Set<string>): Promise<any>{

    let userErrors: string[] = [];

    // Validate username length
    if (user.username.length < userValidationRules.username.minLength || user.username.length > userValidationRules.username.maxLength) {
      userErrors.push(`Identifiant invalide, doit avoir une longueur entre ${userValidationRules.username.minLength} et ${userValidationRules.username.maxLength}`)
    }

    // Validate username format
    if (!userValidationRules.alphabeticWithDotsRegex.test(user.username)) {
      userErrors.push(`Identifiant invalide (caractères alphabétiques uniquement)`)
    }

    // Validate firstName length
    if (user.firstName.length < userValidationRules.firstName.minLength || user.firstName.length > userValidationRules.firstName.maxLength) {
      userErrors.push(`Prénom invalide, doit avoir une longueur entre ${userValidationRules.firstName.minLength} et ${userValidationRules.firstName.maxLength}`);
    }
    // Validate firstName format
    if (!userValidationRules.alphabeticRegex.test(user.firstName)) {
      userErrors.push(`Prénom invalide (caractère alphabétiques uniquement)`);
    }
    
    // Validate lastName length
    if (user.lastName.length < userValidationRules.lastName.minLength || user.lastName.length > userValidationRules.lastName.maxLength) {
      userErrors.push(`Nom invalide, doit avoir une longueur entre ${userValidationRules.lastName.minLength} et ${userValidationRules.lastName.maxLength}`)
    }
    // Validate lastName format 
    if (!userValidationRules.alphabeticRegex.test(user.lastName)) {
      userErrors.push(`Nom invalide (caractère alphabétiques uniquement)`);
    }

    // TODO check username not duplicated

    //TODO add validation for alias ???


    // Validate phoneNumber
    if (!user.phoneNumber) {
      userErrors.push(`Numéro de téléphone obligatoire,`);
    }
    //French phone number already in other format
    const phoneNumberFR = parsePhoneNumber(user.phoneNumber, 'FR');
    if (!phoneNumberFR || !phoneNumberFR.isValid()) {
      userErrors.push(`Numéro de téléphone invalide`)
    }
    else{
      user.phoneNumber = phoneNumberFR.number
    }

    if (phoneNumbers.has(user.phoneNumber)) {
      userErrors.push(`Numéro de téléphone "${user.phoneNumber}" dupliqué`);
    }

    // Validate email address (optionnelle)
    if (user.emailAddress && !userValidationRules.emailRegex.test(user.emailAddress)) {
      userErrors.push(`Adresse email "${user.emailAddress}" : format invalide`);
    }

    // Validate level
    if(!Number.isInteger(user.alertLevel) || user.alertLevel < AlertLevelEnum.ALERT_LEVEL_0 || user.alertLevel > AlertLevelEnum.ALERT_LEVEL_3){
      userErrors.push(`Le niveau est ${user.alertLevel} doit être entre 0 et 3.`)
    }


    // Validate jobDepartment
    if (!userValidationRules.alphaAndSpecialCharsRegex.test(user.jobDepartment)) {
      userErrors.push(`Département "${user.jobDepartment}" : format invalide (caractères alphabétiques et/ou spéciaux uniquement)`)
    }

    // Validate jobTitle
    if (!userValidationRules.alphaAndSpecialCharsRegex.test(user.jobTitle)) {
      userErrors.push(`Poste "${user.jobTitle}" : format invalide (caractères alphabétiques et/ou spéciaux uniquement)`);
    }

    // Validate alias
    if(user.alias.length === 0){
      userErrors.push(`L'alias est obligatoire.`)
    }

    // Validate date of birth
    if(user.dateOfBirth.length === 0){
      userErrors.push(`Date de naissance obligatoire`);
    }else if (!userValidationRules.dateOfBirthRegex.test(user.dateOfBirth)){
      userErrors.push(`Date de naissance invalide (format valide : DD-MM-YYYY)`);
    }


    if(userErrors.length > 0){
     throw new InternalServerErrorException(`Utilisateur ${user.username} de la ligne ${lineNumber} non valide: ${userErrors.join(' | ')}`);
    }
    return user;
  }

  private async updateRolesInKeycloak(
    kc: KeycloakAdminClient,
    userData: ValidateUserDTO,
    userKC: UserRepresentation,
  ) {
    if (userKC.id) {
      //-----------------------------------

      const availableRealmRoles = await kc.roles.find({
        realm: process.env.KC_SERVICE_REALM,
      }); // COMPLETE (shows all roles in realm)
      // const availableRoles = await kc.users.listRealmRoleMappings({id: userKC.id, realm}); // INCOMPLETE (shows only assigned roles)
      // const availableRoles = await kc.users.listAvailableRealmRoleMappings({ id: userKC.id, realm }); // INCOMPLETE (show almost all roles but missing some)
      // console.log(`[RealmRoles] [${realm}] ${availableRealmRoles.length} roles available`, availableRealmRoles.map(r => r.name));

      const defaultRealmRolesNames = [
        `default-roles-grandlyon`,
        'offline_access',
        'uma_authorization',
      ];
      const defaultRealmRoles = availableRealmRoles.filter(
        (role) => role.name && defaultRealmRolesNames.includes(role.name),
      );
      const defaultRealmRolesIds = defaultRealmRoles.map((r) => r.id);
      // const rolesToAddPayload = rolesToAdd.map(r =>)
      // console.log(`[RealmRoles] [${realm}] ${defaultRealmRoles.length} default roles to keep`, defaultRealmRoles.map(r => r.name));

      // const toDelRealmRolesNames = 'availableRoles' - 'defaultRoles'
      const toDelRealmRoles = availableRealmRoles.filter(
        (role) => defaultRealmRolesIds.includes(role.id) == false,
      );
      // const toDelRealmRolesIds = toDelRealmRoles.filter(r => r.clientRole !== true).map(r => r.id);
      //
      const toDelRealmRolesPayload: RoleMappingPayload[] = [];
      toDelRealmRoles.forEach((r) => {
        if (r.id && r.name) {
          toDelRealmRolesPayload.push({ id: r.id, name: r.name });
        }
      });
      //
      // console.log(`[RealmRoles] [${realm}] ${toDelRealmRoles.length} roles to remove from this user`, toDelRealmRoles.map(r => r.name));

      const toAddRealmRolesNames = userData.getRealmRoles();
      const toAddRealmRoles = availableRealmRoles.filter(
        (role) => role.name && toAddRealmRolesNames.includes(role.name),
      );
      // const toAddRolesIds = toAddRoles.map(r => r.id);
      //
      const toAddRealmRolesPayload: RoleMappingPayload[] = [];
      toAddRealmRoles.forEach((r) => {
        if (r.id && r.name) {
          toAddRealmRolesPayload.push({ id: r.id, name: r.name });
        }
      });
      //
      // console.log(`[RealmRoles] [${realm}] ${toAddRealmRoles.length} roles to add to this user`, toAddRealmRoles.map(r => r.name));

      console.log(
        `[RealmRoles] [${this.keycloakService.getRealmName()}] Updating roles for this user !`,
      );
      console.table({
        available: {
          length: availableRealmRoles.length,
          data: availableRealmRoles.map((r) => r.name),
        },
        keep: {
          length: defaultRealmRoles.length,
          data: defaultRealmRoles.map((r) => r.name),
        },
        delete: {
          length: toDelRealmRoles.length,
          data: toDelRealmRoles.map((r) => r.name),
        },
        add: {
          length: toAddRealmRoles.length,
          data: toAddRealmRoles.map((r) => r.name),
        },
      });

      // Execute Realm Roles modifications
      await kc.users.delRealmRoleMappings({
        id: userKC.id,
        roles: toDelRealmRolesPayload,
        realm: process.env.KC_SERVICE_REALM,
      });
      await kc.users.addRealmRoleMappings({
        id: userKC.id,
        roles: toAddRealmRolesPayload,
        realm: process.env.KC_SERVICE_REALM,
      });

      //-----------------------------------

      const servicesClientsNames = Object.keys(userData.getClientRoles()); // = ['drive-nextcloud', 'intranet-wordpress', 'extranet-wordpress' ];
      const availableClients = await kc.clients.find({
        realm: process.env.KC_SERVICE_REALM,
      });
      const usefulClients = availableClients.filter(
        (c) => c.clientId && servicesClientsNames.includes(c.clientId),
      );

      for (let client of usefulClients) {
        if (client.clientId && client.id) {
          const availableClientRoles = await kc.clients.listRoles({
            id: client.id,
            realm: process.env.KC_SERVICE_REALM,
          }); // COMPLETE
          // const availableRoles = await kc.users.listAvailableClientRoleMappings({clientUniqueId: client.id, id: userKC.id, realm}); // COMPLETE
          // const availableRoles = await kc.users.listClientRoleMappings({clientUniqueId: client.id, id: userKC.id, realm}); // INCOMPLETE (shows only assigned roles)
          // console.log(`[ClientRoles] [${client.clientId}] ${availableClientRoles.length} roles available`, availableClientRoles.map(r => r.name));

          const defaultClientRolesNames = ['uma_protection'];
          const defaultClientRoles = availableClientRoles.filter(
            (role) => role.name && defaultClientRolesNames.includes(role.name),
          );
          const defaultClientRolesIds = defaultClientRoles.map((r) => r.id);
          // const rolesToAddPayload = rolesToAdd.map(r =>)
          // console.log(`[ClientRoles] [${client.clientId}] ${defaultClientRoles.length} default roles to keep`, defaultClientRoles.map(r => r.name));

          // const toRemoveRolesNames = 'availableRoles' - 'defaultRoles'
          const toDelClientRoles = availableClientRoles.filter(
            (role) => defaultClientRolesIds.includes(role.id) == false,
          );
          // const toRemoveRolesIds = toRemoveRoles.filter(r => r.clientRole !== true).map(r => r.id);
          //
          const toDelClientRolesPayload: RoleMappingPayload[] = [];
          toDelClientRoles.forEach((r) => {
            if (r.id && r.name) {
              toDelClientRolesPayload.push({ id: r.id, name: r.name });
            }
          });
          //
          // console.log(`[ClientRoles] [${client.clientId}] ${toDelClientRoles.length} roles to remove from this user`, toDelClientRoles.map(r => r.name));

          const toAddClientRolesNames =
            userData.getClientRoles()[client.clientId];
          const toAddClientRoles = availableClientRoles.filter(
            (role) => role.name && toAddClientRolesNames.includes(role.name),
          );
          // const toAddRolesIds = toAddRoles.map(r => r.id);
          //
          const toAddClientRolesPayload: RoleMappingPayload[] = [];
          toAddClientRoles.forEach((r) => {
            if (r.id && r.name) {
              toAddClientRolesPayload.push({ id: r.id, name: r.name });
            }
          });
          //
          // console.log(`[ClientRoles] [${client.clientId}] ${toAddClientRoles.length} roles to add to this user`, toAddClientRoles.map(r => r.name));

          console.log(
            `[ClientRoles] [${client.clientId}] Updating roles for this user !`,
          );
          console.table({
            available: {
              length: availableClientRoles.length,
              data: availableClientRoles.map((r) => r.name),
            },
            keep: {
              length: defaultClientRoles.length,
              data: defaultClientRoles.map((r) => r.name),
            },
            delete: {
              length: toDelClientRoles.length,
              data: toDelClientRoles.map((r) => r.name),
            },
            add: {
              length: toAddClientRoles.length,
              data: toAddClientRoles.map((r) => r.name),
            },
          });

          // Execute Client Roles modifications
          await kc.users.delClientRoleMappings({
            clientUniqueId: client.id,
            id: userKC.id,
            roles: toDelClientRolesPayload,
            realm: process.env.KC_SERVICE_REALM,
          });
          await kc.users.addClientRoleMappings({
            clientUniqueId: client.id,
            id: userKC.id,
            roles: toAddClientRolesPayload,
            realm: process.env.KC_SERVICE_REALM,
          });
        }
      }

      //-----------------------------------

      console.log(
        'TODO',
        'Implement code to handle adding/removing user to/from groups',
      );
      // console.log('GROUPS FROM DATA', await kc.users.listGroups({id: userKC.id, realm}));
      // console.log('GROUPS IN REALM', userData.getGroups());
    }
  }

  private async createOrUpdateUsersInKeycloak(
    kc: KeycloakAdminClient,
    users: ValidateUserDTO[],
  ): Promise<Boolean> {
    let updatedUsers = 0;
    for (let userData of users) {
      const payload: UserRepresentation = {
        username: userData.username,
        email: userData.emailAddress,
        firstName: userData.firstName,
        lastName: userData.lastName,
        enabled: true,
        emailVerified: true
      };

      console.log(`\r\n`);
      console.log(
        `Searching for user with username ${userData.username} in Keycloak`,
      );
      const searchRes = await kc.users.find({
        username: userData.username,
        realm: process.env.KC_SERVICE_REALM,
        exact: true
      });
      let userID: string = '';

      if (searchRes.length > 0 && searchRes[0] && searchRes[0].id) {
        userID = searchRes[0].id;
        const attributes: Record<string, any> = {
          phoneNumber: userData.phoneNumber,
          job_title: userData.jobTitle,
          job_dept: userData.jobDepartment,
          alert_level: userData.alertLevel
        };
        if (searchRes[0].attributes) {
          if (searchRes[0].attributes.internal_email) {
            attributes.internal_email =
              searchRes[0].attributes.internal_email[0];
          }if (searchRes[0].attributes.alerted) {
            attributes.alerted =
              searchRes[0].attributes.alerted[0];
          }
        }
        await kc.users.update(
          { id: userID, realm: process.env.KC_SERVICE_REALM },
          { ...payload, attributes: attributes },
        );

        console.log(
          `Updated existing user for ${userData.username} (${userID})`,
        );
      } else {
        // if the alias is set we'll use it to create the internal email
        let username = userData.alias ? userData.alias : userData.username;
        username = username.toLowerCase();
        // let username = userData.username;
        if (username.includes('@')) {
          username = username.split('@')[0];
        }
        const res = await kc.users.create({
          ...payload,
          attributes: {
            internal_email: `${username}@${this.organization.organization_env.ORG_DOMAIN}`,
            phoneNumber: userData.phoneNumber,
            job_title: userData.jobTitle,
            job_dept: userData.jobDepartment,
            alerted: 0,
            alert_level: userData.alertLevel
          },
          realm: process.env.KC_SERVICE_REALM,
        });

        userID = res.id;

        console.log(`Created new user for ${userData.username} (${userID})`);
      }

      const user = await kc.users.findOne({
        id: userID,
        realm: process.env.KC_SERVICE_REALM,
      });
      if (user) {
        // create/update worked
        await this.updateRolesInKeycloak(kc, userData, user);
        updatedUsers += 1;
      } else {
        throw /*InternalServer*/ Error(
          "Can't find previously created/updated user !",
        );
      }
    }

    console.log(
      `[Keycloak] Imported ${updatedUsers} users out of ${users.length}`,
    );
    await this.logService.create({
      level: 'info',
      message: `[Keycloak] Imported ${updatedUsers} users out of ${users.length}`,
      data: {
        organization_id: this.organization_id,
        connector_id: Configuration.importLdapId,
      },
    });

    return users.length === updatedUsers;
  }

  private async importUsers(kc: KeycloakAdminClient, users: ValidateUserDTO[]) {
    // const LDAP_USERS_CSV_PATH = 'src/data/import_users.csv';

      // Create or Update users in Keycloak
      const res = await this.createOrUpdateUsersInKeycloak(kc, users);
      console.log('importUsers', res);
      return users;
  }

  async run(
    organization_id: string,
    depends_on: string[],
    organization: Organization,
    services?: ServiceType[],
  ) {
    // if it's true we delete the services, if not we delete
    // We added this variable to prevent deleting services in case of csv validation error (because we didn't start the services yet)
    let downConnectorServices = false;

    try {
      this.organization = organization;

      this.setOrganizationId(this.organization.organization_id);

      //##################################
      //      validate users
      //##################################
      // Read selected file from SFTP
      const sftpRes = await this.readFileFromSFTP(
        '/upload/files/directory/import_users.csv',
      );
      let userToImport: ValidateUserDTO[] = [];
      if (sftpRes.ok) {
        // Read data from CSV
        userToImport = await this.importUsersFromCSV(
          sftpRes.path,
        );
      } else {
        console.error("Can't import users, SFTP failed !");
        throw new InternalServerErrorException(
          "Can't import users, SFTP failed !",
        );
      }
      //##################################
      //      import users
      //##################################
      // if we are going to start the services and there was no throw error before, delete the services in catch block
      downConnectorServices = true;
      // run connector depends_on services
      await this.upConnectorServices(services);

      // #####################
      // LDAP to Keycloak
      // #####################

      this.keycloakService.setRealmName(organization_id);
      const keycloakAdminClient = new KeycloakAdminClient({
        baseUrl: this.organization.organization_env.KC_SERVICE_URL,
      });
      console.info('Keycloak client initialized !');

      await this.keycloakService.keycloakAuthenticate(
        keycloakAdminClient,
        this.organization,
      );
      console.info('Keycloak client authenticated !');

      const csvUsers = await this.importUsers(keycloakAdminClient, userToImport);

      // #####################
      // Keycloak to Mailserver
      // #####################
      const MAIL_DOMAIN = this.organization.organization_env.ORG_DOMAIN;

      const kcUsers = await this.keycloakService.getUsersForRealm(
        keycloakAdminClient,
      );

      //filter keycloak users with csv users
      const users: UserRepresentation[] = [];
      for (const kcUser of kcUsers) {
        for (const csvUser of csvUsers) {
          if (csvUser.username.toLowerCase() === kcUser.username.toLowerCase()) {
            users.push(kcUser);
          }
        }
      }

      const mailserver = await this.kubernetesService.findPod(
        this.organization_id,
        'mailserver-app',
      );

      if (mailserver) {
        // Check existing mail accounts
        const usersBeforeAction = await this.findAllMailUsers(
          mailserver,
          MAIL_DOMAIN,
        );
        console.log(
          'Before : There are',
          usersBeforeAction.length,
          'users registered in Mailserver',
        );
        await this.logService.create({
          level: 'info',
          message: `Before : There are, ${usersBeforeAction.length}, users registered in Mailserver`,
          data: {
            organization_id: this.organization_id,
            connector_id: Configuration.importLdapId,
          },
        });
        // Generate credentials

        const credentials: CredentialsDTO[] = [];
        for (const u of users) {
          if (u.attributes) {
            if (u.attributes.internal_email) {
              // keycloak retourne internal email comme liste
              const emailAccount = new EmailAccount({
                email: u.attributes.internal_email[0],
              });
              const username = emailAccount.username;
              credentials.push({ username, password: randomUUID() });
            }
          }
        }
        //  users.map(u => {
        //   if(u.attributes.internal_email) {
        //     return { username: new EmailAccount({email: u.attributes.internal_email}).username, password: randomUUID() }
        //   }
        // });
        console.log('Generated credentials for all users !');
        // console.table(credentials);

        // Create mail accounts for all users (with random password)
        await this.syncAllMailUsers(mailserver, MAIL_DOMAIN, credentials);
        console.log('Provisionned all email accounts with random passwords !');
        await this.logService.create({
          level: 'info',
          message: `Provisionned all email accounts with random passwords !`,
          data: {
            organization_id: this.organization_id,
            connector_id: Configuration.importLdapId,
          },
        });

        // Check that all mail accounts are created
        const usersAfterAction = await this.findAllMailUsers(
          mailserver,
          MAIL_DOMAIN,
        );
        console.log(
          'After : There are',
          usersAfterAction.length,
          'users registered in Mailserver',
        );
        await this.logService.create({
          level: 'info',
          message: `After : There are ${usersAfterAction.length} users registered in Mailserver !`,
          data: {
            organization_id: this.organization_id,
            connector_id: Configuration.importLdapId,
          },
        });
        // TODO: check if the users exist ?
        // Check if user exist
        await this.existOneMailUser(
          mailserver,
          MAIL_DOMAIN,
          credentials[0].username,
        );

        // Update mail account password for a selected user
        // console.log("Updated email account with new password !");
        // await this.syncOneMailUser(mailserver, MAIL_DOMAIN, 'tom-brian.g', 'tom-brian.g')

        // Display all users
        console.table(usersAfterAction);
      } else {
        throw new InternalServerErrorException(
          'Mailserver pod not found, could not import users into Mailserver !',
        );
      }

      // #####################
      // Keycloak to Roundcube (contacts)
      // #####################

      const webmail = await this.kubernetesService.findPod(
        this.organization_id,
        'roundcube-app',
      );

      if (webmail) {
        const localPath = `/tmp/export_users_${Date.now()}.csv`;

        // Convert users from "Keycloak" format to "Roundcube Import" format
        const usersDTO = users.map(
          (u) =>
            new UserRoundcubeDTO(
              u,
              this.organization.organization_env.ORG_DOMAIN,
            ),
        );

        // Transform to CSV and write to file
        stringify(usersDTO, {
          header: true,
          delimiter: ',',
          encoding: 'utf-8',
        }).pipe(fsSync.createWriteStream(localPath));

        // Copy CSV file to Roundcube
        //
        // podname : pod of service 'apitech-mail-roundcube-app'
        // path : {roundcube_path}/plugins/{custom_plugin_name}
        // exec(`kubectl cp ${localPath} \${pod-name}:/var/www/html/plugins/importaddressbook`);
        //

        const roundcubePod = await this.kubernetesService.findPod(
          this.organization_id,
          'mail-roundcube-app',
        );

        if (roundcubePod) {
          const roundcubePodName: string = roundcubePod.metadata?.name ?? 'N/A';
          const command = `${this.kubernetesService.kubectlConfig} cp ${localPath} ${roundcubePodName}:/var/www/html/plugins/importaddressbook`;
          let executionResult: any;
          try {
            executionResult = execSync(command);
          } catch (error) {
            executionResult = error;
          }
          logCommandWithResult(command, executionResult);

          // console.log("TODO : Copy generated file with 'exec kubectl cp'");
        } else {
          throw new InternalServerErrorException('Roundcube pod not found !');
        }

        // Trigger a Roundcube login using Chrome/Puppeeter to trigger CSV import
        //
        // params : roundcube url/host, admin username, admin password
        // res = exec('docker run -it --rm apitech/roundcube-login-ts:1.0 --auth-type basic --host http://host.docker.internal:9000 --username admin@test.mailu.io --password letmeout')
        //

        // await this.kubernetesService.startChromPuppeeterPod(
        //   this.organization_id,
        //   this.organization,
        // );
        // await this.kubernetesService.deleteChromPuppeeterPod(
        //   this.organization_id,
        // );

        // console.log("TODO : Trigger a login using a docker or k8s container run");

        // Check the result of the Roundcube login (=> successful login ~= successful import)
        //
        // if(res.code !== 0) throw error
        //
        console.log(
          'TODO : Check the result of the docker/k8s run to see if import has been done',
        );
      } else {
        throw new InternalServerErrorException(
          'Mailserver pod not found, could not import users into Webmail (contacts) !',
        );
      }

      await this.downConnectorServices(depends_on, true);
    } catch (err: unknown) {
      console.log('global catch error (before down services):');
      console.log(err);
      // we don't delete the services here because in this case the services didn't start
      if(downConnectorServices) {
        await this.downConnectorServices(depends_on, false, );
      }

      const error = err as Error;

      if (error) {
        console.error(error.message);
        await this.logService.create({
          level: 'info',
          message: error.message,
          data: {
            organization_id: this.organization_id,
            connector_id: Configuration.importLdapId,
          },
        });
        throw new InternalServerErrorException(error.message);
        // console.error(error);
      } else {
        console.error(err);
        throw new InternalServerErrorException(err);
      }
    }
  }
}
