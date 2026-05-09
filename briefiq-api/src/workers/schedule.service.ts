// ScheduleService — minute-level cron that enqueues due queries.
//
// We deliberately DON'T use BullMQ's repeat scheduling for per-query timing.
// The reason: the user-facing "frequency" can change while a job is queued
// (paused, switched from daily to hourly), and BullMQ's repeatable jobs are
// awkward to mutate. A simple table poll is cheap, easy to reason about,
// and gives us perfect control over the next run time.
//
// This runs INSIDE the API process. For very large fleets we'd split it
// into its own worker container; at our scale that's premature.

import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { and, asc, eq, isNull, lte, or } from 'drizzle-orm';

import { DRIZZLE_TOKEN, type DrizzleDb } from '../db/client';
import { queries } from '../db/schema';
import { RUN_QUERY_QUEUE } from './constants';
import type { RunQueryJobData } from './run-query.processor';

// Cap per tick so a sudden flood doesn't blast the LLM cascade in one
// minute. 50 active queries per tick = 50 * 5 (search) + 50 (LLM summary)
// at the absolute upper bound, which is comfortably under our key budget.
const MAX_PER_TICK = 50;

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);

  constructor(
    @InjectQueue(RUN_QUERY_QUEUE)
    private readonly queue: Queue<RunQueryJobData>,
    @Inject(DRIZZLE_TOKEN) private readonly db: DrizzleDb,
  ) {}

  /**
   * Every minute, find queries whose nextCheckAt has passed (or was never
   * set) and enqueue a 'run-query' job for each. The jobId equals queryId
   * so a duplicate enqueue while one is still queued is a no-op.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async pollDueQueries(): Promise<void> {
    const now = new Date();
    const due = await this.db
      .select({ id: queries.id })
      .from(queries)
      .where(
        and(
          eq(queries.status, 'active'),
          // First-ever check (nextCheckAt is null) OR overdue.
          or(isNull(queries.nextCheckAt), lte(queries.nextCheckAt, now)),
        ),
      )
      .orderBy(asc(queries.nextCheckAt))
      .limit(MAX_PER_TICK);

    if (due.length === 0) return;

    this.logger.log(`Enqueueing ${due.length} due query(ies).`);

    // Add jobs in parallel. BullMQ's add() is a single Redis round-trip.
    await Promise.all(
      due.map((row) =>
        this.queue.add(
          'run-query',
          { queryId: row.id },
          {
            // Reusing queryId as jobId means an already-queued or in-flight
            // job won't be duplicated by this tick.
            jobId: row.id,
            attempts: 3,
            backoff: { type: 'exponential', delay: 30_000 },
            // Auto-clean to keep Redis tidy.
            removeOnComplete: { age: 24 * 60 * 60 }, // 1 day
            removeOnFail: { age: 7 * 24 * 60 * 60 }, // 7 days
          },
        ),
      ),
    );
  }
}
