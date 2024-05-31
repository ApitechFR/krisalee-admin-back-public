import { Type } from 'class-transformer';
import { IsString, IsBoolean, IsNotEmpty, ValidateNested } from 'class-validator';
import { OrganizationEnv } from '../entities/organizationEnv.entity';

export class CreateOrganizationDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsBoolean()
  is_root: boolean;

  @Type(() => OrganizationEnv)
  @ValidateNested()
  organization_env: OrganizationEnv;
}
