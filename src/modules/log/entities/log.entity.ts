import { Column, Entity, ObjectIdColumn, ObjectID, } from 'typeorm';
import { Exclude } from 'class-transformer';
import { Meta } from './Meta.entity';

@Entity()
export class Log {
  @ObjectIdColumn()
  @Exclude()
  id: ObjectID;

  @Column()
  message: string;

  @Column()
  level: string;

  @Column()
  timestamp: Date;

  @Column()
  meta: Meta;
}