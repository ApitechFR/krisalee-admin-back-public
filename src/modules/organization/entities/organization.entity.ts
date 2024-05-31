import { Exclude, Type } from 'class-transformer';
import { ObjectIdColumn, Column, Entity } from 'typeorm';
import { OrganizationEnv } from './organizationEnv.entity';
import { ValidateNested } from 'class-validator';

@Entity()
export class Organization {
  @ObjectIdColumn()
  @Exclude()
  _id: string;

  @Column({ unique: true })
  organization_id: string;

  @Column({ unique: true })
  name: string;

  @Column()
  is_root: boolean;

  @Column()
  organization_env: OrganizationEnv;
}
