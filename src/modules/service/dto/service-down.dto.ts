import {
  IsString,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  IsOptional,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ServicesDownDTO {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => serviceType)
  services: serviceType[];
}

export class serviceType {

  @IsString()
  @IsNotEmpty()
  service_id: string;

  @IsBoolean()
  @IsOptional()
  save_snapshot: boolean;

  @IsString()
  @IsOptional()
  comment: string
}
