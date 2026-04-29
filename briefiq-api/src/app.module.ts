// Root module — wires together every feature module + global services.
//
// Keep this file thin: only imports + decorators. All real wiring lives
// inside individual modules. When you add a new feature module, add it to
// the imports array here.

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';

import { DatabaseModule } from './db/database.module';
import { ServicesModule } from './services/services.module';

import { HealthController } from './health.controller';

import { AuthModule } from './modules/auth/auth.module';
import { QueriesModule } from './modules/queries/queries.module';
import { BriefingsModule } from './modules/briefings/briefings.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { SettingsModule } from './modules/settings/settings.module';
import { PushModule } from './modules/push/push.module';

@Module({
  imports: [
    // Load .env early so every other module sees a populated process.env.
    ConfigModule.forRoot({ isGlobal: true }),

    // Pino logger with pretty transport in dev. Logs are JSON in prod which
    // plays nicely with Fly.io / Grafana.
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : {
                target: 'pino-pretty',
                options: { singleLine: true, translateTime: 'HH:MM:ss' },
              },
      },
    }),

    // @nestjs/schedule registers cron jobs declared with @Cron(). Per-query
    // schedule is built dynamically in workers/schedule.service.ts later.
    ScheduleModule.forRoot(),

    // Shared infra modules.
    DatabaseModule,
    ServicesModule,

    // Feature modules. Each owns its REST surface + business rules.
    AuthModule,
    QueriesModule,
    BriefingsModule,
    FeedbackModule,
    SettingsModule,
    PushModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
