import {
  IsString,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  IsOptional,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ServicesUpDTO {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  mode_id?: string;

  @IsBoolean()
  @IsOptional()
  alert_level_0?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceType)
  services: ServiceType[];

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  tag_id?: string;
}

class ServiceType {
  @IsString()
  @IsNotEmpty()
  service_id: string;

  @IsOptional()
  @IsString()
  snapshot_id: string;
}
