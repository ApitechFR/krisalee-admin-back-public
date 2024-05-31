import { Type } from 'class-transformer';
import { ServicesUrl } from './ServicesUrl.entity';
import { IsInt, IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { ServicesCredentials } from './ServicesCredentials.entity';

export class OrganizationEnv {
  @Type(() => ServicesUrl)
  @ValidateNested()
  services_url: ServicesUrl;

  @Type(() => ServicesCredentials)
  @ValidateNested()
  services_credentials: ServicesCredentials;

  @IsNotEmpty()
  @IsInt()
  HOST_DATA_SSH_PORT: number;

  @IsString()
  SFTP_HOST: string;

  @IsNotEmpty()
  @IsInt()
  SFTP_PORT: number;

  @IsString()
  SFTP_USERNAME: string;

  @IsString()
  SFTP_PASSWORD: string;

  @IsString()
  KC_SERVICE_ADMIN_CLIENT_ID: string;

  @IsString()
  KC_SERVICE_URL: string;

  @IsString()
  ORG_DOMAIN: string;
}
