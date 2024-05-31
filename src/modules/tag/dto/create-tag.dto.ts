import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsString,
} from 'class-validator';
import { TagType } from 'src/enums/tagType';

export class CreateTagDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsBoolean()
  system: boolean;

  @IsBoolean()
  unique: boolean;

  @IsNumber()
  @IsEnum(TagType)
  type: number;
}
