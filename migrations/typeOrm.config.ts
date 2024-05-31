import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { ServiceLastRunDatetime1689152700780 } from './1689152700780-ServiceLastRunDatetime';
import { TagIdConstraint1690359720783 } from './1690359720783-TagIdConstraint';
import { Product } from '../src/modules/product/entities/product.entity';
import { Tag } from '../src/modules/tag/entities/tag.entity';

config();

export default new DataSource({
  type: 'mongodb',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  authSource: 'admin',
  useUnifiedTopology: true,
  entities: [Product, Tag],
  migrations: [
    ServiceLastRunDatetime1689152700780,
    TagIdConstraint1690359720783,
  ],
});
