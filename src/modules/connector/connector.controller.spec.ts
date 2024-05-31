import { Test, TestingModule } from '@nestjs/testing';
import { ConnectorController } from './connector.controller';
import { ConnectorService } from './connector.service';

describe('ConnectorController', () => {
  let controller: ConnectorController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConnectorController],
      providers: [ConnectorService],
    }).compile();

    controller = module.get<ConnectorController>(ConnectorController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
