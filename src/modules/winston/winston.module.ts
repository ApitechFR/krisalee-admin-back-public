import { Module } from '@nestjs/common';
import { WinstonService } from './winston.service';


@Module({

  controllers: [],
  providers: [WinstonService],
  exports: [WinstonService]
})
export class winstonModule {}
