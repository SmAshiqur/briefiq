// Briefings read API. The write side (creating briefings from delta
// detection) lives in services/briefing.service.ts; this module is what
// the iOS feed screen calls.

import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { DRIZZLE_TOKEN, type DrizzleDb } from '../../db/client';
import { briefings, queries } from '../../db/schema';

@Injectable()
export class BriefingsService {
  constructor(@Inject(DRIZZLE_TOKEN) private readonly db: DrizzleDb) {}

  /**
   * Today's feed payload: every delivered briefing in the last 24h, plus a
   * count of "still monitoring" queries that produced silence today.
   *
   * The iOS feed renders both — the cards from `changes` and the
   * reassurance block from `stillMonitoring`. Returning them together lets
   * us do this in one round trip instead of two.
   */
  async today(userId: string) {
    // Briefings: join queries to scope by user, return last 24h.
    const since = new Date();
    since.setHours(since.getHours() - 24);

    const changes = await this.db
      .select({
        id: briefings.id,
        queryId: briefings.queryId,
        queryText: queries.rawText,
        importance: briefings.importance,
        summary: briefings.summary,
        deltaVerdict: briefings.deltaVerdict,
        sourcesJson: briefings.sourcesJson,
        deliveredAt: briefings.deliveredAt,
        createdAt: briefings.createdAt,
      })
      .from(briefings)
      .innerJoin(queries, eq(briefings.queryId, queries.id))
      .where(
        and(
          eq(queries.userId, userId),
          gte(briefings.createdAt, since),
        ),
      )
      .orderBy(desc(briefings.createdAt));

    // Still-monitoring count = active queries that did NOT produce a
    // briefing in the last 24h. Done in SQL to avoid a fan-out fetch.
    const stillMonitoringRows = await this.db
      .select({
        id: queries.id,
        rawText: queries.rawText,
        frequency: queries.frequency,
        lastCheckedAt: queries.lastCheckedAt,
        nextCheckAt: queries.nextCheckAt,
      })
      .from(queries)
      .where(
        and(
          eq(queries.userId, userId),
          eq(queries.status, 'active'),
          // Outer-join trick via NOT EXISTS subquery.
          sql`NOT EXISTS (
            SELECT 1 FROM briefings b
            WHERE b.query_id = ${queries.id}
              AND b.created_at >= ${since.toISOString()}
          )`,
        ),
      );

    return {
      changes,
      stillMonitoring: stillMonitoringRows,
      // Keep these in the response so iOS can render the stat row exactly
      // like the dark-mode prototype.
      counts: {
        updatesToday: changes.length,
        noChange: stillMonitoringRows.length,
        running: changes.length + stillMonitoringRows.length,
      },
    };
  }

  /** All briefings for one query — used by the iOS query-detail history timeline. */
  async forQuery(userId: string, queryId: string) {
    // Join queries so we can enforce ownership without a separate lookup.
    // queryText included so iOS Briefing decoder (shared with /today) succeeds.
    return this.db
      .select({
        id: briefings.id,
        queryId: briefings.queryId,
        queryText: queries.rawText,
        importance: briefings.importance,
        summary: briefings.summary,
        deltaVerdict: briefings.deltaVerdict,
        sourcesJson: briefings.sourcesJson,
        deliveredAt: briefings.deliveredAt,
        createdAt: briefings.createdAt,
      })
      .from(briefings)
      .innerJoin(queries, eq(briefings.queryId, queries.id))
      .where(and(eq(briefings.queryId, queryId), eq(queries.userId, userId)))
      .orderBy(desc(briefings.createdAt));
  }

  /** Single briefing — used by the iOS detail screen. */
  async getOne(userId: string, id: string) {
    const rows = await this.db
      .select({
        b: briefings,
        q: queries,
      })
      .from(briefings)
      .innerJoin(queries, eq(briefings.queryId, queries.id))
      .where(eq(briefings.id, id))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException(`Briefing ${id} not found`);
    }
    if (rows[0].q.userId !== userId) {
      throw new NotFoundException(`Briefing ${id} not found`);
    }
    return { ...rows[0].b, query: rows[0].q };
  }
}
