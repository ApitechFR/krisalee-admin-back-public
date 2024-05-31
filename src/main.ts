import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestFactory } from '@nestjs/core';
import {} from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { AppClusterService } from './app_cluster.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: [`${process.env.CLIENT_URL}`],
  });

  app.setGlobalPrefix('/api/organization');

  const config = new DocumentBuilder()
    .setTitle('Phoenix Api')
    .setDescription('The Phoenix Api documentation')
    .setVersion('1.0')
    .addServer('/api/organization')
    .addBearerAuth()
    .addTag('Phoenix')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    ignoreGlobalPrefix: true,
  });
  SwaggerModule.setup('api/documentation', app, document);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
    }),
  );

  await app.listen(3000);
}
AppClusterService.clusterize(bootstrap);
