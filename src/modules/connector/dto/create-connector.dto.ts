import { IsString, IsNotEmpty, IsArray, IsOptional } from 'class-validator';

export class CreateConnectorDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  frequency: string;

  @IsArray()
  @IsString({ each: true })
  depends_on: string[];
}
