import { Tag } from '../src/modules/tag/entities/tag.entity';
import { MigrationInterface, MongoRepository, QueryRunner } from 'typeorm';

export class TagIdConstraint1690359720783 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log('-------------------------------');
    console.log('Add unique constraint to tag_id');
    console.log('-------------------------------');

    const repository = new MongoRepository(Tag, queryRunner.manager);

    await repository.createCollectionIndex('tag_id', {
      unique: true,
      name: 'tag_id_unique',
    });
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log('------------------------------------');
    console.log('Removing unique constraint to tag_id');
    console.log('------------------------------------');

    const repository = new MongoRepository(Tag, queryRunner.manager);

    await repository.dropCollectionIndex('tag_id_unique');
  }
}
