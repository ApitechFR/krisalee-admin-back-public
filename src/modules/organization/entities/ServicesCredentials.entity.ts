import { IsString } from 'class-validator';

export class ServicesCredentials {
  @IsString()
  NEXT_CLOUD_USERNAME: string;

  @IsString()
  NEXT_CLOUD_PASSWORD: string;

  @IsString()
  MAILSERVER_POSTMASTER_USERNAME: string;

  @IsString()
  MAILSERVER_POSTMASTER_PASSWORD: string;

  @IsString()
  KC_SERVICE_ADMIN_USERNAME: string;

  @IsString()
  KC_SERVICE_ADMIN_PASSWORD: string;
}
