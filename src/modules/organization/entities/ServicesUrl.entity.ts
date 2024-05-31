import { IsString } from 'class-validator';

export class ServicesUrl {
  @IsString()
  auth: string;

  @IsString()
  mail: string;

  @IsString()
  drive: string;

  @IsString()
  website: string;

  @IsString()
  chat: string;
}
