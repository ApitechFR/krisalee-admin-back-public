import * as ssh2SftpClient from 'ssh2-sftp-client';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'fs';
import axios, { AxiosInstance } from 'axios';
import { ConnectorInterface } from './Connector';
import { Configuration } from 'src/config/Configuration';
import { ServiceType } from '../dto/run-connector.dto';
import { Organization } from 'src/modules/organization/entities/organization.entity';
import * as process from "process";

@Injectable()
export class ImportDocuments extends ConnectorInterface {
  /** The current organization representation */
  private organization: Organization;

  private axiosInstance: AxiosInstance;

  /*private filesGroupes = [
    {
      group: 'Doc. de gestion de crise',
      directory: '/upload/files/crisis_management',
    },
    {
      group: 'Doc. techniques',
      directory: '/upload/files/technical_documents',
    },
  ];*/

  private fileDirectory = 'upload/files/directory';
  private groupFolderName = 'fichiers'

  private async readFileFromSFTP(): Promise<any> {
    console.log('-----------------------------------------------------------');
    console.log('Read the files from sftp server and put it in documents ...');
    console.log('-----------------------------------------------------------');
    await this.logService.create({
      level: 'info',
      message: 'Read the files from sftp server and put it in documents',
      data: {
        organization_id: this.organization_id,
        connector_id: Configuration.importDocId,
      },
    });

    const client = new ssh2SftpClient();

    try {
      await client.connect(
        Configuration.getSftpConfiguration(this.organization),
      );
      console.log('[SFTP] Connected !');

      // for (const fileGroup of this.filesGroupes) {
      //   const directoryExists = await client.exists(fileGroup.directory);
      const directoryExists = await client.exists(this.fileDirectory);
      if (directoryExists) {
        // const localPath = `${process.env.DIR}/documents/${fileGroup.group}`;
        const localPath = `${process.env.DIR}/documents/${this.fileDirectory}`;
        if (!existsSync(localPath)) {
          mkdirSync(localPath, { recursive: true });
        }
        // const list = await client.list(fileGroup.directory);
        const list = await client.list(this.fileDirectory);
        for (const file of list) {
          // const remoteFilePath = `${fileGroup.directory}/${file.name}`;
          const remoteFilePath = `${this.fileDirectory}/${file.name}`;
          const localFilePath = `${localPath}/${file.name}`;
          const fileExists = await client.exists(remoteFilePath);
          if (!fileExists) {
            console.log('File On Remote Not Found');
            await this.logService.create({
              level: 'error',
              message: `File ${remoteFilePath} On Remote Not Found`,
              data: {
                organization_id: this.organization_id,
                connector_id: Configuration.importDocId,
              },
            });
          }
          await client.get(remoteFilePath, localFilePath);
          // }
        }
      }
    } catch (err) {
      console.error('Import Document Error: ');
      console.log(err);
      await this.logService.create({
        level: 'error',
        message: `Import Document from sftp to local path fails: ${err.message}`,
        data: {
          organization_id: this.organization_id,
          connector_id: Configuration.importDocId,
        },
      });
      throw new InternalServerErrorException(err.message);
    }
  }

  private async isOrgDirectoryExist() {
    try {
      const response = await this.axiosInstance({
        method: 'PROPFIND',
        url: `remote.php/dav/files/admin/${this.organization_id}`,
      });

      if (response.status === 207) {
        // if (response.status >= 200 && response.status < 300) {
        console.log('Directory exists', `HTTP CODE ${response.status}`);
        return true;
      } else {
        console.log('Directory does not exist', `HTTP CODE ${response.status}`);
        return false;
      }
    } catch (error) {
      console.error('Error checking directory:', error.message);
      await this.logService.create({
        level: 'error',
        message: `Error checking directory: ${error.message}`,
        data: {
          organization_id: this.organization_id,
          connector_id: Configuration.importDocId,
        },
      });
      return false;
    }
  }

  private async createOrgDirectory() {
    console.log('-------------------------------------------------');
    console.log('Creating The organization folder in nextcloud ...');
    console.log('-------------------------------------------------');
    await this.logService.create({
      level: 'info',
      message: 'Creating The organization folder in nextcloud',
      data: {
        organization_id: this.organization_id,
        connector_id: Configuration.importDocId,
      },
    });
    try {
      await this.axiosInstance({
        method: 'MKCOL',
        url: `remote.php/dav/files/admin/${this.organization_id}`,
      });
    } catch (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  private async uploadFilesToNextCloud() {
    // const response = await this.axiosInstance.get(
    //     `index.php/apps/groupfolders/folders`,
    //     {
    //       headers: {
    //         'OCS-APIRequest': true,
    //       },
    //     },
    // );

    // const groupeFolders = response.data.ocs.data;
    //
    // const groupeFoldersKeys = Object.keys(groupeFolders);

    try {
      console.log('------------------------------------');
      console.log('Uploading the files to nextcloud ...');
      console.log('------------------------------------');
      await this.logService.create({
        level: 'info',
        message: 'Uploading the files to nextcloud',
        data: {
          organization_id: this.organization_id,
          connector_id: Configuration.importDocId,
        },
      });
      // for (const fileGroup of this.filesGroupes) {
      //   let match = false;
      //   for (const groupeFoldersKey of groupeFoldersKeys) {
      //     if (fileGroup.group === groupeFolders[groupeFoldersKey].mount_point) {
      //       match = true;
      //     }
      //   }

        // if (!match) {
        //   continue;
        // }

        // console.log(`Trying to upload files for group '${fileGroup.group}'...`);
        console.log(`Trying to upload files ...`);

        // const files = readdirSync(
        //   `${process.env.DIR}/documents/${fileGroup.group}`,
        // );
        const files = readdirSync(
          `${process.env.DIR}/documents/${this.fileDirectory}`,
        );

        for (const file of files) {
          console.log(`Trying to upload '${file}'...`);

          // const fileContent = readFileSync(
          //   `${process.env.DIR}/documents/${fileGroup.group}/${file}`,
          // );
          const fileContent = readFileSync(
            `${process.env.DIR}/documents/${this.fileDirectory}/${file}`,
          );
          // const groupe = encodeURI(fileGroup.group);
          const groupe = encodeURI(this.groupFolderName);
          const response = await this.axiosInstance({
            method: 'PUT',
            // url: `remote.php/dav/files/${this.organization.organization_env.services_credentials.NEXT_CLOUD_USERNAME}/upload/${file}`,
            // url: `remote.php/dav/files/${this.organization.organization_env.services_credentials.NEXT_CLOUD_USERNAME}/upload/${file}`,
            url: `remote.php/dav/files/${this.organization.organization_env.services_credentials.NEXT_CLOUD_USERNAME}/${groupe}/${file}`,
            // url: `remote.php/dav/files/${process.env.NEXT_CLOUD_USERNAME}/${groupe}/${file}`,
            data: fileContent,
          });

          if (response.status === 201) {
            console.log(`file ${file} is uploaded successfully`);
            await this.logService.create({
              level: 'info',
              message: `file ${file} is uploaded successfully`,
              data: {
                organization_id: this.organization_id,
                connector_id: Configuration.importDocId,
              },
            });
          }

          // const res = await axios({
          //   method: 'POST',
          //   url: `${process.env.NEXT_CLOUD_HOST}/ocs/v2.php/apps/files_sharing/api/v1/shares`,
          //   auth: {
          //     username: process.env.NEXT_CLOUD_USERNAME,
          //     password: process.env.NEXT_CLOUD_PASSWORD,
          //   },
          //   headers: {
          //     'OCS-APIRequest': 'true',
          //   },
          //   data: {
          //     path: `/${this.organization_id}/${file}`,
          //     shareType: 1,
          //     shareWith: fileGroup.group,
          //     permissions: 2,
          //   },
          // });

          // console.log(res.status);
        }
      // }

      console.log('---------------------------------');
      console.log('Deleting the documents folder ...');
      console.log('---------------------------------');
      await this.logService.create({
        level: 'info',
        message: `Deleting the documents folder`,
        data: {
          organization_id: this.organization_id,
          connector_id: Configuration.importDocId,
        },
      });
      rmSync(`${process.env.DIR}/documents`, { recursive: true });
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException(error.message);
    }
  }

  private setAxiosInstance() {
    this.axiosInstance = axios.create({
      baseURL: `${this.organization.organization_env.services_url.drive}/`,
      auth: {
        username:
          this.organization.organization_env.services_credentials
            .NEXT_CLOUD_USERNAME,
        password:
          this.organization.organization_env.services_credentials
              .NEXT_CLOUD_PASSWORD,
      },
    });
  }

  async run(
    depends_on: string[],
    organization: Organization,
    services?: ServiceType[],
  ) {
    try {
      this.organization = organization;

      this.setOrganizationId(this.organization.organization_id);

      this.setAxiosInstance();

      await this.upConnectorServices(services);

      await this.readFileFromSFTP();
      await this.uploadFilesToNextCloud();

      await this.downConnectorServices(depends_on, true);
    } catch (error) {
      console.log(error);
      await this.downConnectorServices(depends_on, false);
      throw new InternalServerErrorException(error.message);
    }
  }
}
