import { IsString, IsNotEmpty, IsNumber, IsEnum } from 'class-validator';
import { SnapshotStatus } from 'src/enums/snapshotStatus';

export class SnapshotDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @IsEnum(SnapshotStatus)
  status: number;
}
