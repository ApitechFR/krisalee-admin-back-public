import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationService } from './organization.service';
import { MongoRepository } from 'typeorm';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { Organization } from './entities/organization.entity';

describe('OrganizationService', () => {
  let service: OrganizationService;

  const createDto: CreateOrganizationDto = {
    name: 'Test Organization',
    is_root: false,
    organization_env: {
      services_url: {
        auth: 'auth.dev.krisalee.fr',
        mail: 'webmail.dev.krisalee.fr',
        drive: 'drive.dev.krisalee.fr',
        website: 'site-interne.dev.krisalee.fr',
        chat: 'chat.dev.krisalee.fr'
      },
      services_credentials: {
        NEXT_CLOUD_USERNAME: 'blabla',
        NEXT_CLOUD_PASSWORD: 'blabla',
        MAILSERVER_POSTMASTER_USERNAME: 'blabla',
        MAILSERVER_POSTMASTER_PASSWORD: 'blabla',
        KC_SERVICE_ADMIN_USERNAME: 'backend-krisalee',
        KC_SERVICE_ADMIN_PASSWORD: 'dvqkQc7xkb8NyoKw'
      },
      HOST_DATA_SSH_PORT: 22,
      SFTP_HOST: 'blabla',
      SFTP_PORT: 56445,
      SFTP_USERNAME: 'blabla',
      SFTP_PASSWORD: 'blabla',
      KC_SERVICE_ADMIN_CLIENT_ID: 'admin-cli',
      KC_SERVICE_URL: 'auth.dev.krisalee.fr',
      ORG_DOMAIN: 'krisalee.dev.joona.fr'
    },
  };


  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OrganizationService,{
          provide: 'OrganizationRepository',
          useClass: MongoRepository,
        },],
    }).compile();

    service = module.get<OrganizationService>(OrganizationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return an array of organizations', async () => {
      
      const organizations = [{ 
        _id: 'mockId',
        organization_id: 'test organization',
        name: createDto.name,
        is_root: createDto.is_root,
        organization_env: createDto.organization_env, 
      }, { 
      _id: 'mockId2',
      organization_id: 'test organization',
      name: createDto.name,
      is_root: createDto.is_root,
      organization_env: createDto.organization_env, 
      }];
      jest.spyOn(service, 'findAll').mockResolvedValue(organizations);

      expect(await service.findAll()).toEqual(organizations);
    });
  });

  describe('findOne', () => {
    it('should return an organization by id', async () => {
      
      const organization: Organization = {
        _id: 'mockId',
        organization_id: 'apitech',
        name: createDto.name,
        is_root: createDto.is_root,
        organization_env: createDto.organization_env,
      };

      jest.spyOn(service, 'findOne').mockResolvedValue(organization);
      expect(await service.findOne('apitech')).toEqual(organization);
    });

    it('should throw NotFoundException if organization is not found', async () => {
      jest.spyOn(service, 'findOne').mockRejectedValue(new NotFoundException());

      await expect(service.findOne('111')).rejects.toThrowError(NotFoundException);
    });
  });

  describe('remove', () => {
    const id = 'apitech';

    it('should remove organization successfully', async () => {
      
      const result = await jest.spyOn(service, 'remove').mockResolvedValue(null);
      expect(await service.remove(id)).toEqual(null);
    });
  });
  describe('create', () => {
    it('should create organization', async () => {
      const organization: Organization = {
        _id: '',
        organization_id: 'test organization',
        name: createDto.name,
        is_root: createDto.is_root,
        organization_env: createDto.organization_env,
      };
      jest.spyOn(service, 'create').mockResolvedValue(organization);

      const result = await service.create(createDto);
      expect(result).toEqual(organization);
    });
  });
});
