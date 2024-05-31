import { Tag } from 'src/modules/tag/entities/tag.entity';
import { Snapshot } from '../entities/snapshot.entity';

export class SnapshotWithTags extends Snapshot {
  constructor(partial: Partial<SnapshotWithTags>) {
    super();
    Object.assign(this, partial);
  }

  snapTags: Tag[];
}
