import { Entity, Column, ObjectIdColumn } from 'typeorm';
import { Exclude } from 'class-transformer';

@Entity()
export class Tag {
  @ObjectIdColumn()
  @Exclude()
  _id: string;

  @Column({ unique: true })
  tag_id: string;

  @Column()
  name: string;

  @Column()
  description: string;

  @Column()
  system: boolean;

  @Column()
  unique: boolean;

  @Column()
  organization_id: string;

  @Column()
  type: number;
}
