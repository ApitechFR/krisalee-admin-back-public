import { Entity, ObjectIdColumn, Column } from 'typeorm';
import { Exclude } from 'class-transformer';
import { Version } from './Version';
import { OrganizationVersion } from './OrganizationVersion';

@Entity()
export class Product {
  @ObjectIdColumn()
  @Exclude()
  _id: string;

  @Column()
  product_id: string;

  @Column()
  service_id: string;

  @Column({ unique: true })
  name: string;

  @Column()
  versions: Version[];

  @Column()
  organizations_versions: OrganizationVersion[];

  @Column({ type: 'date' })
  create_date: Date;

  @Column({ type: 'date' })
  update_date: Date;
}
