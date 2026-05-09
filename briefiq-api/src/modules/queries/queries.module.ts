// Queries module — the user's tracking questions live here.

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueriesController } from './queries.controller';
import { QueriesService } from './queries.service';
import { AuthModule } from '../auth/auth.module';
import { RUN_QUERY_QUEUE } from '../../workers/constants';

@Module({
  imports: [
    AuthModule,
    // Registers the queue token so QueriesService can inject it and
    // enqueue a job the moment a new query is created — no waiting for cron.
    BullModule.registerQueue({ name: RUN_QUERY_QUEUE }),
  ],
  controllers: [QueriesController],
  providers: [QueriesService],
  exports: [QueriesService],
})
export class QueriesModule {}
