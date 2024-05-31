import { Entity, ObjectIdColumn, Column } from 'typeorm';
import { Exclude } from 'class-transformer';

@Entity()
export class Connector {
  @ObjectIdColumn()
  @Exclude()
  _id: string;

  @Column({ unique: true })
  connector_id: string;

  @Column({ unique: true })
  name: string;

  @Column()
  description: string;

  @Column()
  frequency: string;

  @Column((type) => Organization)
  organizations: Organization[];

  @Column()
  depends_on: string[];
}

export class Organization {
  @Column()
  organization_id: string;

  @Column()
  status: number;

  @Column()
  last_run_status: number;

  @Column()
  is_running: number;

  @Column({ type: 'datetime' })
  last_run_datetime: Date;
}
