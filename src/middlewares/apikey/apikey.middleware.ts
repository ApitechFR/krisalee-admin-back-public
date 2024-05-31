import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class ApikeyMiddleware implements NestMiddleware {
  
  use(req: Request, res: Response, next: NextFunction) {
    
    const authorizationHeader = req.headers.authorization;

    //si on a pas authorization dans header
    if (!authorizationHeader) {
      throw new UnauthorizedException('Authorization header not found');
    }

    //split Bearer et apiKey
    const [schema, apiKey] = authorizationHeader.split(' ');

    //si on a pas Bearer ou bien apiKey dans header
    if (schema !== 'Bearer' || !apiKey) {
      throw new UnauthorizedException('Invalid Authorization header');
    }

    //si le apiKey different a notre API_KEY
    if (apiKey !== process.env.API_KEY) {
      throw new UnauthorizedException('Invalid API Key');
    }

    next();
  }
}
