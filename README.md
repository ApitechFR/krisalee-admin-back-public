## Seed

**1- Import system tags**

to import system tags you need to run the `importTags.sh` inside the mongo container

```bash
$ docker exec -it mongo bash
$ bash importTags.sh
```

## Migration

**1- Create a migration**

```bash
$ npm run typeorm:create-migration --name=MigrationName
```

The **MigrationName** is the name of the migration

**2- Add migration to system**

- Import the created migration in **'migrations/tpeOrm.config.ts'** then add it to **migrations: []**
- Import the entities you want to apply migration to in **'migrations/tpeOrm.config.ts'** and add them to **entities: []**

**3- Implement migration**

Running the migration command creates a file with the code that can bring our database from one state to another and back. Its filename consists of the current timestamp followed by the name provided when using the migration:create command.
Here is an example:

```
public async up(queryRunner: MongoQueryRunner): Promise<any> {
    const count = await queryRunner.cursor('my-collection', {}).count(false);
}
```

**4- Run migration**

```bash
$ npm run typeorm:run-migrations
```

This command will run all the migrations specified in **migrations: []**

**5- Revert Migration**

```bash
$ npm run typeorm:revert-migration
```

This command will revert the last executed migration
