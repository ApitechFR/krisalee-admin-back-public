import { MigrationInterface, QueryRunner, MongoRepository } from 'typeorm';
import { Product } from '../src/modules/product/entities/product.entity';

export class ServiceLastRunDatetime1689152700780 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log(
      '----------------------------------------------------------------------------------',
    );
    console.log(
      'Adding last run datetime to services (adding it to product organiztaions_versions)',
    );
    console.log(
      '----------------------------------------------------------------------------------',
    );
    const repository = new MongoRepository(Product, queryRunner.manager);

    const products = await repository.find();

    for (const product of products) {
      const organizations_versions = product.organizations_versions;
      const new_orgnizations_versions = [];

      for (const organization_version of organizations_versions) {
        if (!organization_version.last_run_datetime) {
          new_orgnizations_versions.push({
            ...organization_version,
            last_run_datetime: null,
          });
        } else {
          new_orgnizations_versions.push(organization_version);
        }
      }

      product.organizations_versions = new_orgnizations_versions;

      await repository.save(product);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log(
      '----------------------------------------------------------------------------------',
    );
    console.log(
      'Deleting last run datetime from services (deleting it from product organiztaions_versions)',
    );
    console.log(
      '----------------------------------------------------------------------------------',
    );
    const repository = new MongoRepository(Product, queryRunner.manager);

    const products = await repository.find();

    for (const product of products) {
      const organizations_versions = product.organizations_versions;
      const new_orgnizations_versions = [];

      for (const organization_version of organizations_versions) {
        delete organization_version.last_run_datetime;

        new_orgnizations_versions.push(organization_version);
      }

      product.organizations_versions = new_orgnizations_versions;

      await repository.save(product);
    }
  }
}
