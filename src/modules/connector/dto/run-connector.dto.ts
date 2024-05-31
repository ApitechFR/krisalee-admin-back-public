import { IsArray, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { AlertLevelEnum } from '../enums/ldapToKeycloak.enum';
import { Type } from 'class-transformer';

export class RunConnectorDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  frequency: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  sms_header: string;

  @IsNumber()
  @IsEnum(AlertLevelEnum)
  @IsOptional()
  alert_level: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceType)
  services: ServiceType[];
}

export class ServiceType {
  @IsString()
  @IsNotEmpty()
  service_id: string;

  @IsOptional()
  @IsString()
  snapshot_id: string;
}