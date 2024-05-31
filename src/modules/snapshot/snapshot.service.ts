import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  BadRequestException, Inject, forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { GetCurrentDate } from 'src/helpers/getCurrentDate';
import { toTimeStamp } from 'src/helpers/mainHelper';
import { MongoRepository } from 'typeorm';
import { CreateSnapshotDto } from './dto/create-snapshot.dto';
import { UpdateSnapshotDto } from './dto/update-snapshot.dto';
import { Snapshot } from './entities/snapshot.entity';
import { SnapshotStatus } from 'src/enums/snapshotStatus';
import { OrganizationService } from '../organization/organization.service';
import { rmSync, existsSync } from 'fs';
import { TagService } from '../tag/tag.service';
import { SnapshotWithTags } from './types/snapshot-with-tags';
import { TagType } from 'src/enums/tagType';
import {ServiceService} from "../service/service.service";
import {Service} from "../service/entities/service.entity";
import {Configuration} from "../../config/Configuration";

@Injectable()
export class SnapshotService {
  constructor(
    @InjectRepository(Snapshot)
    private readonly snapshotRepository: MongoRepository<Snapshot>,
    private readonly organizationService: OrganizationService,
    private readonly tagService: TagService,
    @Inject(forwardRef(() => ServiceService))
    private readonly serviceService: ServiceService
  ) {}

  async findAll(organization_id: string) {
    try {
      let snapshots = await this.snapshotRepository.find();
      snapshots = snapshots.filter(
        (snapshot) => snapshot.organization_id == organization_id,
      );
      return snapshots;
    } catch (error) {
      throw new BadRequestException('Bad request');
    }
  }

  /**
   * Create a snapshot
   * @param organization_id The organization id
   * @param timestamp The snapshot timestamp
   * @param version_id The id of the product version
   */
  async create(organization_id: string, timestamp: string, version_id: string, comment: string, tag_id?: string) {
    try {
      const snapshot = this.snapshotRepository.create({
        snapshot_id: `${version_id}_${timestamp}`,
        organization_id,
        timestamp,
        version_id,
        is_active: false,
        create_date: GetCurrentDate(parseInt(timestamp)),
        update_date: GetCurrentDate(parseInt(timestamp)),
        comment: comment ? comment : "",
        tags: [],
      });

      await this.snapshotRepository.save(snapshot);
      if(tag_id){
          await this.assignTag(organization_id, snapshot.snapshot_id, tag_id, undefined, true);
      }
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException('Impossible de créer la sauvegarde');
    }
  }

  async patch(id: string, updateSnapshotDTO: UpdateSnapshotDto) {
    try {
      const snapshot = await this.snapshotRepository.findOneOrFail({where: {snapshot_id: id}});
      snapshot.comment = updateSnapshotDTO.comment;
      return await this.snapshotRepository.save(snapshot);
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException("Erreur serveur")
    }
  }

  /**
   * Delete the snapshot from the database and the filesystem
   * @param organization_id organization id
   * @param id snapshot id
   * @throws an internal server error if the snapshot doesn't exist on the filesystem
   * @throws ForbiddenException if the organization is not root
   */
  async delete(organization_id: string, id: string) {
    const snapshot = await this.snapshotRepository.findOne({
      where: { snapshot_id: id },
    });
    if (snapshot) {
      //If the snapshot is source we cannot delete it
      const tags = await this.tagService.findManyByIds(snapshot.tags);
      for (const tag of tags) {
        if (tag.type === TagType.SOURCE) {
          throw new ForbiddenException(
            'Vous ne pouvez pas supprimer la sauvegarde source',
          );
        }
      }

      if (snapshot.tags.length > 0) {
        throw new ForbiddenException(
          'Vous ne pouvez pas supprimer cette sauvegarde, veuillez penser à désaffecter les labels !',
        );
      }

      await this.snapshotRepository.deleteOne({ snapshot_id: id });
      const path = `${process.env.DATA_PATH}/${
        snapshot.organization_id
      }/service/${id.replace(/_/g, '/')}`;
      try {
        rmSync(path, { recursive: true });
      } catch (err) {
        if (err.code === 'ENOENT') {
          throw new InternalServerErrorException(
            `Directory ${path} does not exist.`,
          );
        } else {
          throw new InternalServerErrorException(
            `Error deleting directory ${path}`,
          );
        }
      }
    }
  }

  async purge(organization_id: string) {
    try {
      const snapshots = await this.findAll(organization_id);
      for (let snapshot of snapshots) {
        //get the snapshot path from file system;
        const path = `${process.env.DATA_PATH}/${
          snapshot.organization_id
        }/${snapshot.snapshot_id.replace(/_/g, '/')}`;
        if (existsSync(path)) {
          console.log('path exists');
        } else if (!existsSync(path) && !snapshot.is_active) {
          await this.snapshotRepository.deleteOne({
            snapshot_id: snapshot.snapshot_id,
          });
          console.log('path does not exist');
        }
      }
    } catch (error) {
      throw new InternalServerErrorException(`Error while purging snapshots`);
    }
  }

  async findOne(snapshot_id: string) {
    try {
      return await this.snapshotRepository.findOneByOrFail({ snapshot_id });
    } catch (error) {
      throw new InternalServerErrorException('Sauvegarde Not Found');
    }
  }

  async getActiveSnapshot(organization_id: string, version_id: string) {
    try {
      return await this.snapshotRepository.findOneByOrFail({
        organization_id,
        version_id,
        is_active: true,
      });
    } catch (error) {
      // console.log(error);
      return undefined;
    }
  }

  async serviceHasTaggednapshot(
    organization_id: string,
    version_id: string,
    tag_id: string,
  ): Promise<{
    hasTaggedSnapshot: boolean;
    snapshot_id: string | undefined;
    tagName: string;
  }> {
    const tag = await this.tagService.findOne(organization_id, tag_id);

    const snapshots = await this.getVersionSnapshots(
      organization_id,
      version_id,
    );

    //Filter snaphsots with tag_id
    const taggedSnapshots = snapshots.filter((snapshot) =>
      snapshot.tags.includes(tag_id),
    );

    if (taggedSnapshots.length > 0) {
      return {
        hasTaggedSnapshot: true,
        snapshot_id: taggedSnapshots[taggedSnapshots.length - 1].snapshot_id,
        tagName: tag.name,
      };
    }

    return {
      hasTaggedSnapshot: false,
      snapshot_id: undefined,
      tagName: tag.name,
    };
  }

  /**
   * Get the last snapshot
   * @param organization_id The organization_id of the organisation which the service belong to
   * @param version_id the version id
   * @returns The last snapshot, undefined if it is not found
   */
  async getLastSnapshot(organization_id: string, version_id: string) {
    try {
      let maxDateIndex = 0;
      let snapshot: Snapshot;
      const snapshots = await this.snapshotRepository.find({
        where: { organization_id, version_id },
      });

      for (const snap of snapshots) {
        const created_at: number = toTimeStamp(snap.create_date);
        if (created_at > maxDateIndex) {
          maxDateIndex = created_at;
          snapshot = snap;
        }
      }
      return snapshot;
    } catch (error) {
      console.log(error);
      return undefined;
    }
  }

  /**
   * update the last snapshot
   * @param snapshot_id The snapshot id
   * @returns Last snapshot, undefined otherwise
   */
  async update(snapshot_id: string, is_active: boolean, timestamp: number) {
    try {
      await this.snapshotRepository.update(
        { snapshot_id },
        { is_active, update_date: GetCurrentDate(timestamp) },
      );
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException('Impossible de modifier la sauvegarde');
    }
  }

  async getVersionSnapshots(organization_id: string, version_id: string) {
    const snapshots = await this.snapshotRepository.find({
      where: { organization_id, version_id },
    });

    return await this.assignTagsToSnapshots(snapshots);
  }

  async assignTag(
    organizatio_id: string,
    snapshot_id: string,
    tag_id: string,
    user: any,
    force?: boolean,
  ) {
    const snapshot = await this.findOne(snapshot_id);
    const snapshotTagsIds = snapshot.tags;
    if (snapshotTagsIds.includes(tag_id)) {
      return [];
    }
    const snapshotTags = await this.tagService.findManyByIds(snapshotTagsIds);
    const tag = await this.tagService.findOne(organizatio_id, tag_id);

    if(user){
      if (
        tag.type === TagType.SOURCE &&
        !user.realm_access.roles.includes('admin')
      ) {
        throw new ForbiddenException('Only admins can assign source tag');
      }
    }

    //If snapshot has tag source don't assign any other tag
    for (const tg of snapshotTags) {
      if (tg.type === TagType.SOURCE) {
        throw new ForbiddenException(
          'Vous ne pouvez pas affecter des labels à la sauvegarde source',
        );
      }
    }

    if (tag.system) {
      // check if all snapshots have only one unique system tag
      if (tag.unique) {
        const snapshots = await this.getVersionSnapshots(
          organizatio_id,
          snapshot.version_id,
        );

        let oldUniqueSnap: Snapshot;

        // check if any other snapshot has this unique tag
        for (const snap of snapshots) {
          if (snap.tags.includes(tag_id)) {
            if (force) {
              // remove the unique tag system from the old snapshot
              const snapTags = snap.tags;
              const newTags = snapTags.filter((e) => e !== tag_id);
              snap.tags = newTags;
              oldUniqueSnap = { ...snap };
              // await this.snapshotRepository.save(snap);
            } else {
              return {
                systemTagUniqueExist: true,
              };
            }
          }
        }

        // a variable to check if there is already a unique system tag
        let hasUnique: boolean = false;

        // add the unique tag system to the new snapshot
        // and check if there is another system tag on the tags list
        for (const snapshotTag of snapshotTags) {
          if (snapshotTag.system) {
            if (!snapshotTag.unique) {
              const newSnap = this.replaceSystemTag(
                snapshot,
                snapshotTag.tag_id,
                tag_id,
              );
              const newSnapshot = await this.snapshotRepository.save(newSnap);
              if (oldUniqueSnap) {
                return await this.assignTagsToSnapshots([
                  oldUniqueSnap,
                  newSnapshot,
                ]);
              } else {
                return await this.assignTagsToSnapshots([newSnapshot]);
              }
            } else {
              hasUnique = true;
            }
          }
        }

        console.log(hasUnique);

        if (!hasUnique) {
          if (oldUniqueSnap) {
            snapshot.tags.push(tag_id);

            const newSnapshot = await this.snapshotRepository.save(snapshot);
            const newSnapshot2 = await this.snapshotRepository.save(
              oldUniqueSnap,
            );
            return await this.assignTagsToSnapshots([
              newSnapshot,
              newSnapshot2,
            ]);
          }
        } else {
          return {
            snapHasTagUnique: true,
          };
        }
      } else {
        // check if snapshot has already system tags
        for (const snapshotTag of snapshotTags) {
          if (snapshotTag.system) {
            if (force) {
              const snap = this.replaceSystemTag(
                snapshot,
                snapshotTag.tag_id,
                tag_id,
              );
              const newSnapshot = await this.snapshotRepository.save(snap);
              return await this.assignTagsToSnapshots([newSnapshot]);
            } else {
              return {
                systemTagExist: true,
              };
            }
          }
        }
      }
    }
    snapshot.tags.push(tag_id);

    const newSnapshot = await this.snapshotRepository.save(snapshot);
    return await this.assignTagsToSnapshots([newSnapshot]);
  }

  private async assignTagsToSnapshots(snapshots: Snapshot[]) {
    const snapshotsWithTags: SnapshotWithTags[] = [];

    for (const snapshot of snapshots) {
      const tags = await this.tagService.findManyByIds(snapshot.tags);
      const snapshotWithTags = new SnapshotWithTags({
        ...snapshot,
        snapTags: tags,
      });
      snapshotsWithTags.push(snapshotWithTags);
    }

    return snapshotsWithTags;
  }

  private replaceSystemTag(
    snapshot: Snapshot,
    toRemplace: string,
    remplaceBy: string,
  ) {
    const newTags = snapshot.tags.filter((e) => e !== toRemplace);
    newTags.push(remplaceBy);
    snapshot.tags = newTags;
    return snapshot;
  }

  async UnassignTag(
    organizatio_id: string,
    snapshot_id: string,
    tag_id: string,
  ) {
    const snapshot = await this.findOne(snapshot_id);

    //If the tag is source prevent unassigning it
    const tag = await this.tagService.findOne(organizatio_id, tag_id);
    if (tag.type === TagType.SOURCE) {
      throw new ForbiddenException(
        "Vous ne pouvez pas désaffecter le label source",
      );
    }

    if (snapshot.tags.includes(tag_id)) {
      const newTags = snapshot.tags.filter((e) => e !== tag_id);
      snapshot.tags = newTags;
      const newSnapshot = await this.snapshotRepository.save(snapshot);
      return await this.assignTagsToSnapshots([newSnapshot]);
    } else {
      return await this.assignTagsToSnapshots([snapshot]);
    }
  }
}
