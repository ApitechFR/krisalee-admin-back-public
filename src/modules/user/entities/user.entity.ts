import { Entity, Column, ObjectIdColumn } from 'typeorm';
import { Exclude } from 'class-transformer';

@Entity()
export class User {
  @ObjectIdColumn()
  @Exclude()
  _id: string;

  @Column({ unique: true })
  user_id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column()
  role: string;

  @Column()
  organization_id: string;
}
