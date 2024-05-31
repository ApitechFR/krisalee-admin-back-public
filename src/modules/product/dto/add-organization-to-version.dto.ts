import { IsString, IsNotEmpty, IsArray } from 'class-validator';

export class AddOrganizationToVersionDto {
  @IsString()
  @IsNotEmpty()
  org_id: string;

  @IsArray()
  @IsString({ each: true })
  depends_on: string[];
}
