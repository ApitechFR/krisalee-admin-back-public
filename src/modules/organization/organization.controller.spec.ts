import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { Organization } from './entities/organization.entity';
import { MongoRepository } from 'typeorm';

let mockRepo = ()=>({
  
})
describe('OrganizationController', () => {
  let controller: OrganizationController;
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
      controllers: [OrganizationController],
      providers: [OrganizationService,{
        provide: 'OrganizationRepository',
        useClass: MongoRepository,
      },],
    }).compile();

    controller = module.get<OrganizationController>(OrganizationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
  describe('create', () => {
    it('should create an organization', async () => {
      
      const mockOrganization: Organization = {
        _id: '',
        organization_id: 'test organization',
        name: createDto.name,
        is_root: createDto.is_root,
        organization_env: createDto.organization_env,
      };

      jest.spyOn(controller, 'create').mockResolvedValue(mockOrganization);
      const result = await controller.create(createDto)
      expect(result).toEqual(mockOrganization);
    });
  });
});
