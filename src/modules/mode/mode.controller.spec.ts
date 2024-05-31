import { Test, TestingModule } from '@nestjs/testing';
import { ModeController } from './mode.controller';
import { ModeService } from './mode.service';

describe('ModeController', () => {
  let controller: ModeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ModeController],
      providers: [ModeService],
    }).compile();

    controller = module.get<ModeController>(ModeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
