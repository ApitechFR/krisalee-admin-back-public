import { Test, TestingModule } from '@nestjs/testing';
import { TagController } from './tag.controller';
import { TagService } from './tag.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { TagType } from '../../enums/tagType';
import { Tag } from './entities/tag.entity';
import { OrganizationService } from '../organization/organization.service';
import { MongoRepository } from 'typeorm';

describe('TagController', () => {
  let controller: TagController;
  let service: TagService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TagController],
      providers: [TagService, OrganizationService, {
        provide: 'TagRepository',
        useClass: MongoRepository,
      },{
        provide: 'OrganizationRepository',
        useClass: MongoRepository,
      },],
    }).compile();

    controller = module.get<TagController>(TagController);
    service = module.get<TagService>(TagService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a tag', async () => {
      const mockTagDto: CreateTagDto = {
        name: 'Test Tag',
        description: 'Test description',
        system: false,
        unique: true,
        type: 5,
      };

      const organization_id = 'apitech';

      //jest.spyOn(service, 'create').mockResolvedValueOnce(mockTag);

      const result = await controller.create(organization_id, mockTagDto);

      expect(result).toEqual({
        ...mockTagDto,
        organization_id: null,
        _id: expect.any(String), // Assuming _id is a string
        tag_id: expect.any(String), // Assuming tag_id is a string
      });
    });
  });
  describe('findAll', () => {
    it('should find all tags', async () => {
      const organization_id = 'apitech';

      const mockTags = [{ name: 'Tag 1' }, { name: 'Tag 2' }]; // Example data

      //jest.spyOn(service, 'findAll').mockResolvedValueOnce(mockTags);

      const result = await controller.findAll(organization_id);

      expect(result).toEqual(mockTags);
    });
  });

  describe('update', () => {
    it('should update a tag', async () => {
      const tagId = 'tag123';
      const updateTagDto = { name: 'Updated Tag' };
      const result = { id: tagId, ...updateTagDto };

      //jest.spyOn(service, 'update').mockResolvedValue(result);

      expect(await controller.update(tagId, updateTagDto)).toEqual(result);
      expect(service.update).toHaveBeenCalledWith(tagId, updateTagDto);
    });
  });

  describe('remove', () => {
    it('should remove a tag', async () => {
      const organizationId = 'apitech';
      const tagId = 'tag123';

      jest.spyOn(service, 'remove').mockResolvedValue();

      expect(await controller.remove(organizationId, tagId)).toEqual({});
      expect(service.remove).toHaveBeenCalledWith(organizationId, tagId);
    });
  });
});
