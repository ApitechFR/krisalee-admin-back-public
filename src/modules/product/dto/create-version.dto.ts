import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateVersionDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  node_pool: string;
}
