// Application entrypoint. Boots NestJS, wires global pipes/filters, prints
// a startup banner so a fresh dev knows what's listening on what port.
//
// Why ValidationPipe with whitelist + transform: every controller receives
// already-validated, already-transformed DTOs. Unknown fields are stripped,
// so the LLM and DB layers never see junk from a misbehaving client.

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';

async function bootstrap() {
  // Validate env BEFORE NestFactory.create so a missing var fails fast
  // with a readable Zod error instead of a confusing module-init failure.
  const env = loadEnv();

  const app = await NestFactory.create(AppModule, {
    // Pino is wired inside AppModule via nestjs-pino. Default Nest logger
    // stays on for boot messages until that's ready.
    logger: ['log', 'warn', 'error'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // CORS is permissive in dev; tighten this for the iOS app's bundle origin
  // in production (set CORS_ORIGINS env var and read it here).
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // '0.0.0.0' exposes the server on all network interfaces, not just loopback.
  // Required for other LAN devices (e.g. Mac) to reach this Windows host.
  await app.listen(env.PORT, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  logger.log(`BriefIQ API listening on http://0.0.0.0:${env.PORT}`);
  logger.log(`Health: GET http://localhost:${env.PORT}/health`);
  logger.log(`Env:    NODE_ENV=${env.NODE_ENV}, LLM_MODEL=${env.LLM_MODEL}`);
}

bootstrap().catch((err) => {
  // Last-resort handler. If bootstrap throws (bad env, DB down, etc.) print
  // it cleanly and exit so the process supervisor (Fly.io / pm2) restarts.
  // eslint-disable-next-line no-console
  console.error('Fatal during bootstrap:', err);
  process.exit(1);
});
