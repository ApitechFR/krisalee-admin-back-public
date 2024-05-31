import { IsBoolean, IsOptional } from 'class-validator';

export class AssignTagDto {
  @IsOptional()
  @IsBoolean()
  force: boolean;
}
