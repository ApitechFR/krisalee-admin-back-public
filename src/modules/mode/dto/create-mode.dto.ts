import { IsString, IsNotEmpty, IsEnum } from 'class-validator';
import { ModeType } from 'src/enums/modeType';

export class CreateModeDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsEnum(ModeType)
  type: number;
}
