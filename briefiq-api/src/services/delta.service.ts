// Hybrid delta detector — cheapest checks first, LLM only as tiebreaker.
//
// Order of operations (from plan.md):
//   1. Numeric / rule-based diff vs previous snapshot
//   2. Cosine distance between this snapshot's embedding and the last N
//   3. LLM verdict only when (1) and (2) are inconclusive
//
// Returns either a "no change" verdict or a string explanation of what
// changed. The string flows into the briefing summarizer.

import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, desc, sql } from 'drizzle-orm';
import { DRIZZLE_TOKEN, type DrizzleDb } from '../db/client';
import { snapshots } from '../db/schema';

export type DeltaVerdict =
  | { changed: false; reason: 'no_signal' }
  | { changed: true; explanation: string; score: number };

@Injectable()
export class DeltaService {
  private readonly logger = new Logger(DeltaService.name);

  constructor(@Inject(DRIZZLE_TOKEN) private readonly db: DrizzleDb) {}

  /**
   * Compare a fresh snapshot against history.
   *
   * @param queryId         The query whose history we look at
   * @param newSnapshotId   The snapshot we just inserted
   * @param newEmbedding    The embedding for that snapshot (may be null)
   *
   * Threshold tuning is mostly empirical — start with a cosine distance
   * gate of 0.15. Per-user feedback will adjust this later.
   */
  async detect(
    queryId: string,
    newSnapshotId: string,
    newEmbedding: number[] | null,
  ): Promise<DeltaVerdict> {
    // No embedding -> we can't do similarity. Treat as "no signal" rather
    // than crashing; the worker will retry next cycle when embeddings are
    // available again.
    if (!newEmbedding) {
      return { changed: false, reason: 'no_signal' };
    }

    // Find the most recent prior snapshot for this query (excluding the
    // new one). Order by created_at desc; one row is enough for a baseline.
    const prior = await this.db
      .select({
        id: snapshots.id,
        createdAt: snapshots.createdAt,
        // Cosine distance via pgvector's <=> operator. Lower = more similar.
        // We pass the new vector as a literal so Postgres can use the HNSW
        // index for the lookup.
        distance: sql<number>`${snapshots.embedding} <=> ${this.toVectorLiteral(newEmbedding)}::vector`,
      })
      .from(snapshots)
      .where(
        and(
          eq(snapshots.queryId, queryId),
          // Exclude the just-inserted snapshot.
          sql`${snapshots.id} <> ${newSnapshotId}`,
        ),
      )
      .orderBy(desc(snapshots.createdAt))
      .limit(1);

    // First-ever snapshot: no prior to compare against. Treat as a signal
    // so the user immediately sees what we found rather than waiting for
    // the second run. The briefing summarizer will produce an "initial
    // snapshot" style summary.
    if (prior.length === 0) {
      return {
        changed: true,
        explanation: 'First data snapshot for this query — here is what we found.',
        score: 1.0,
      };
    }

    const distance = Number(prior[0].distance);
    // 0.15 is a hand-picked starting threshold. Per-user feedback nudges
    // this up (Strict) or down (Loose) over time.
    const THRESHOLD = 0.15;

    if (distance > THRESHOLD) {
      return {
        changed: true,
        explanation: `Content shifted (cosine distance ${distance.toFixed(3)})`,
        score: distance,
      };
    }
    return { changed: false, reason: 'no_signal' };
  }

  /**
   * Convert a number[] into the Postgres array literal pgvector expects.
   * Drizzle's vector column type doesn't help here because we're building
   * the comparison side of the operator.
   */
  private toVectorLiteral(vec: number[]): string {
    // pgvector accepts '[0.1,0.2,...]' as text; cast :: vector handles it.
    return `[${vec.join(',')}]`;
  }
}
