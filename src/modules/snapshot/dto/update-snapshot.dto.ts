import { PartialType } from '@nestjs/swagger';
import { CreateSnapshotDto } from './create-snapshot.dto';
import { IsOptional, IsString } from 'class-validator';

export class UpdateSnapshotDto extends PartialType(CreateSnapshotDto) {
    @IsOptional()
    @IsString()
    comment: string;
}
