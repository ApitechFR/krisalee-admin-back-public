import { Entity, ObjectIdColumn, Column } from 'typeorm';
import { Exclude } from 'class-transformer';

@Entity()
export class Service {
  @ObjectIdColumn()
  @Exclude()
  _id: string;

  @Column({ unique: true })
  service_id: string;

  @Column({ unique: true })
  name: string;

  @Column()
  description: string;

  @Column({ type: 'date' })
  create_date: Date;

  @Column({ type: 'date' })
  update_date: Date;
}
