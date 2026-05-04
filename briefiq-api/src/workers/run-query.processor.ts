// RunQueryProcessor — the actual end-to-end pipeline for one query.
//
// Triggered by the 'run-query' BullMQ queue. ScheduleService enqueues a job
// every minute for each query whose nextCheckAt is due. Job payload is just
// { queryId: string } — the rest is reloaded from the DB so the job stays
// idempotent against a redelivery.
//
// Pipeline (matches plan.md "AI pipeline"):
//   1. Load query row; bail if missing or paused
//   2. Insert a fetches audit row
//   3. SearchService.search(query.rawText) -> hit list
//   4. SnapshotService.create() -> writes snapshot row with embedding
//   5. DeltaService.detect()    -> verdict (changed / no_signal)
//   6. If changed: BriefingService.createFromDelta() -> briefings row
//   7. If briefing produced + has push token + not in quiet hours:
//        ApnsService.send() + notifications row
//   8. Update queries.lastCheckedAt + nextCheckAt
//   9. Close out the fetches row
//
// LLM exhaustion is handled INSIDE BriefingService — it returns null and
// logs a warning. We treat that as "no briefing this cycle, try again next
// time", which is the silence-is-a-feature behavior we want.

import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { eq } from 'drizzle-orm';

import { DRIZZLE_TOKEN, type DrizzleDb } from '../db/client';
import {
  queries,
  fetches,
  users,
  notifications,
} from '../db/schema';
import { SearchService } from '../services/search.service';
import { SnapshotService } from '../services/snapshot.service';
import { DeltaService } from '../services/delta.service';
import { BriefingService } from '../services/briefing.service';
import { ApnsService } from '../services/apns.service';
import { QuietHoursService } from '../services/quiet-hours.service';

import { RUN_QUERY_QUEUE } from './workers.module';

export interface RunQueryJobData {
  queryId: string;
}

@Injectable()
@Processor(RUN_QUERY_QUEUE)
export class RunQueryProcessor extends WorkerHost {
  private readonly logger = new Logger(RunQueryProcessor.name);

  constructor(
    @Inject(DRIZZLE_TOKEN) private readonly db: DrizzleDb,
    private readonly search: SearchService,
    private readonly snapshot: SnapshotService,
    private readonly delta: DeltaService,
    private readonly briefing: BriefingService,
    private readonly apns: ApnsService,
    private readonly quietHours: QuietHoursService,
  ) {
    super();
  }

  async process(job: Job<RunQueryJobData>): Promise<void> {
    const { queryId } = job.data;
    this.logger.log(`run-query START queryId=${queryId}`);

    // Reload the query — never trust the queue payload for anything beyond
    // identity.
    const queryRows = await this.db
      .select()
      .from(queries)
      .where(eq(queries.id, queryId))
      .limit(1);

    if (queryRows.length === 0) {
      this.logger.warn(`Query ${queryId} not found; skipping job.`);
      return;
    }
    const q = queryRows[0];

    if (q.status !== 'active') {
      this.logger.log(`Query ${queryId} status=${q.status}; skipping.`);
      return;
    }

    // Audit row. We update it at the very end with status + finishedAt.
    const [fetch] = await this.db
      .insert(fetches)
      .values({ queryId, status: 'ok' })
      .returning();

    let fetchStatus: 'ok' | 'partial' | 'error' = 'ok';
    let fetchError: string | null = null;

    try {
      // ── 1. Search ──
      const results = await this.search.search(q.rawText, {
        includeDomains: q.sourcesJson?.domains,
        // News-biased ranking for time-sensitive intents.
        recent: q.intentType === 'event' || q.intentType === 'price',
        maxResults: 5,
      });

      if (results.length === 0) {
        // Tavily returned nothing — could be a key issue, network, or just
        // a niche query. Mark partial; reschedule normally.
        this.logger.log(`No search results for query=${queryId}.`);
        fetchStatus = 'partial';
      } else {
        // ── 2. Snapshot ──
        const snap = await this.snapshot.create({
          queryId,
          fetchId: fetch.id,
          queryText: q.rawText,
          searchResults: results,
        });

        // ── 3. Delta ──
        // snap.embedding may be null when the embeddings model is degraded;
        // DeltaService handles that by returning {changed: false}.
        const verdict = await this.delta.detect(
          queryId,
          snap.id,
          (snap.embedding as number[] | null) ?? null,
        );

        // ── 4 + 5. Briefing + delivery ──
        if (verdict.changed) {
          const briefRow = await this.briefing.createFromDelta({
            queryId,
            fetchId: fetch.id,
            queryText: q.rawText,
            deltaVerdict: verdict.explanation,
            facts: snap.structuredJson,
            sourceDomains: this.extractDomains(results.map((r) => r.url)),
          });

          if (briefRow) {
            await this.maybeDeliverPush(q.userId, briefRow.id, {
              importance: briefRow.importance,
              summary: briefRow.summary,
            });
          }
        }
      }
    } catch (err) {
      // Any error inside the pipeline aborts THIS cycle but does NOT crash
      // the worker. The query gets rescheduled normally.
      this.logger.error(
        `run-query failed queryId=${queryId}: ${(err as Error).message}`,
      );
      fetchStatus = 'error';
      fetchError = (err as Error).message;
    } finally {
      // Always close out the fetch row + reschedule the query, even on error.
      const now = new Date();
      await this.db
        .update(fetches)
        .set({
          finishedAt: now,
          status: fetchStatus,
          error: fetchError,
        })
        .where(eq(fetches.id, fetch.id));

      await this.db
        .update(queries)
        .set({
          lastCheckedAt: now,
          nextCheckAt: this.computeNextCheckAt(q.frequency, now),
        })
        .where(eq(queries.id, queryId));

      this.logger.log(
        `run-query DONE queryId=${queryId} status=${fetchStatus}`,
      );
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  /**
   * Push delivery + audit row. Suppresses non-important pushes during the
   * user's quiet hours (those flow into the morning digest later).
   */
  private async maybeDeliverPush(
    userId: string,
    briefingId: string,
    briefing: { importance: 'important' | 'new' | 'minor'; summary: string },
  ): Promise<void> {
    const userRows = await this.db
      .select({
        pushToken: users.pushToken,
        quietStart: users.quietStart,
        quietEnd: users.quietEnd,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (userRows.length === 0) return;
    const u = userRows[0];

    if (!u.pushToken) {
      // No registered device. Briefing is still discoverable via
      // GET /briefings/today on next app launch.
      this.logger.log(
        `Skip push for user=${userId}: no push token registered.`,
      );
      return;
    }

    const inQuiet = this.quietHours.isWithin({
      start: u.quietStart || '22:00',
      end: u.quietEnd || '07:00',
    });

    // Only 'important' pierces quiet hours (maps to APNs time-sensitive).
    if (inQuiet && briefing.importance !== 'important') {
      await this.db.insert(notifications).values({
        userId,
        briefingId,
        channel: 'apns',
        status: 'suppressed_quiet_hours',
      });
      return;
    }

    const result = await this.apns.send({
      deviceToken: u.pushToken,
      title: 'BriefIQ',
      body: briefing.summary,
      importance: briefing.importance,
      // Deep-link the iOS app onto the briefing detail screen.
      link: `briefiq://briefings/${briefingId}`,
    });

    await this.db.insert(notifications).values({
      userId,
      briefingId,
      channel: 'apns',
      status: result.delivered ? 'sent' : 'failed',
    });
  }

  /**
   * Frequency -> next-check delta.
   * Custom cron strings are out of scope here (we'd parse customCron when
   * we add that feature; for now any unknown frequency falls back to daily).
   */
  private computeNextCheckAt(frequency: string, from: Date): Date {
    const out = new Date(from);
    switch (frequency) {
      case 'hourly':
        out.setHours(out.getHours() + 1);
        return out;
      case 'weekly':
        out.setDate(out.getDate() + 7);
        return out;
      case 'daily':
      default:
        out.setDate(out.getDate() + 1);
        return out;
    }
  }

  /** Pull bare hostnames from URLs. Falls back to 'unknown' on bad input. */
  private extractDomains(urls: string[]): string[] {
    const set = new Set<string>();
    for (const u of urls) {
      try {
        set.add(new URL(u).hostname);
      } catch {
        set.add('unknown');
      }
    }
    return Array.from(set);
  }
}
