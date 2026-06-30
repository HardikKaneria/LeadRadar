import 'reflect-metadata';
import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { loadConfig } from '@radar/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));

  // CORS must be registered before helmet so preflight responses carry the headers.
  // Chrome extension service workers send chrome-extension://<id> as Origin — allow all of them.
  // Token auth on the ingest endpoints is the real security gate.
  const allowedOrigins = config.WEB_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin) || origin.startsWith('chrome-extension://')) {
        cb(null, true);
      } else {
        cb(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization,Idempotency-Key,x-organization-id',
    credentials: true,
  });

  // helmet after enableCors — disable crossOriginResourcePolicy so the browser
  // does not block cross-origin fetch responses (extension → API).
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.setGlobalPrefix('api/v1');

  const swagger = new DocumentBuilder()
    .setTitle('Radar OIP API')
    .setDescription('Opportunity Intelligence Platform — REST API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger));

  await app.listen(config.API_PORT);
}

void bootstrap();
