import { ObjectIdColumn, Column, Entity } from 'typeorm';
import { Exclude } from 'class-transformer';

@Entity()
export class Mode {
  @ObjectIdColumn()
  @Exclude()
  _id: string;

  @Column({ unique: true })
  mode_id: string;

  @Column()
  name: string;

  @Column()
  description: string;

  @Column()
  default: boolean;
}
