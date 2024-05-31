import { Exclude } from 'class-transformer';
import { ObjectIdColumn, Column, Entity } from 'typeorm';

@Entity()
export class Snapshot {
  @ObjectIdColumn()
  @Exclude()
  _id: string;

  @Column({ unique: true })
  snapshot_id: string;

  @Column()
  name: string;

  @Column()
  timestamp: string;

  @Column()
  tags: string[];

  @Column()
  organization_id: string;

  @Column()
  version_id: string;

  @Column()
  is_active: boolean;

  @Column()
  create_date: Date;

  @Column()
  update_date: Date;

  @Column()
  comment: string;
}
