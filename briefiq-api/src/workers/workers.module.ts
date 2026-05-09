// WorkersModule — BullMQ queue + processor + cron poller.
//
// What lives here:
//   - The 'run-query' queue (Redis-backed, BullMQ).
//   - RunQueryProcessor: actually does fetch -> snapshot -> delta ->
//     briefing -> push for one query.
//   - ScheduleService: a 1-minute cron that finds due queries and pushes
//     them onto the queue.
//
// Why one module instead of three: the three pieces only ever wire
// together via this queue. Splitting would force public exports nobody
// else needs.

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { getEnv } from '../config/env';
import { RunQueryProcessor } from './run-query.processor';
import { ScheduleService } from './schedule.service';
import { RUN_QUERY_QUEUE } from './constants';

export { RUN_QUERY_QUEUE };

@Module({
  imports: [
    // forRootAsync registers the default Redis connection BullMQ uses for
    // every queue in this module. We parse REDIS_URL ourselves because
    // BullMQ's connection options are { host, port, password } shaped
    // rather than URL-shaped.
    BullModule.forRootAsync({
      useFactory: () => {
        const env = getEnv();
        const url = new URL(env.REDIS_URL);
        const dbStr = url.pathname.replace(/^\//, '');
        return {
          connection: {
            host: url.hostname,
            port: parseInt(url.port || '6379', 10),
            password: url.password || undefined,
            username: url.username || undefined,
            db: dbStr ? parseInt(dbStr, 10) : 0,
            // Required by BullMQ for blocking BRPOPLPUSH operations.
            maxRetriesPerRequest: null,
          },
        };
      },
    }),
    // Register the queue at module-init time so @InjectQueue('run-query')
    // works in ScheduleService.
    BullModule.registerQueue({ name: RUN_QUERY_QUEUE }),
  ],
  providers: [RunQueryProcessor, ScheduleService],
})
export class WorkersModule {}
