import { Test, TestingModule } from '@nestjs/testing';
import { ServiceAdminController } from './service-admin.controller';

describe('ServiceAdminController', () => {
  let controller: ServiceAdminController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ServiceAdminController],
    }).compile();

    controller = module.get<ServiceAdminController>(ServiceAdminController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
