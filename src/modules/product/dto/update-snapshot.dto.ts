import { PartialType } from '@nestjs/swagger';
import { SnapshotDto } from './snapshot.dto';

export class updateSnapshotDTO extends PartialType(SnapshotDto) {}