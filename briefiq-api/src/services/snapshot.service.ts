// Snapshot service — turns raw search results into a structured-fact JSON
// blob + an embedding, then writes a row to the snapshots table.
//
// This is step 3 of the AI pipeline (per plan.md). It's intentionally
// passive about the shape of `structured_json` — different intents emit
// different fields. Downstream (delta detector, briefing summarizer)
// reads only what it cares about.
//
// Currently a stub: produces a basic snapshot from the raw text. The full
// implementation will use generateObject + an intent-specific Zod schema.

import { Inject, Injectable, Logger } from '@nestjs/common';
import { DRIZZLE_TOKEN, type DrizzleDb } from '../db/client';
import { snapshots } from '../db/schema';
import { EmbeddingsService } from './embeddings.service';
import type { SearchResult } from './search.service';

export interface SnapshotInput {
  queryId: string;
  fetchId: string;
  /** The user's original query text — used for the embedding context. */
  queryText: string;
  searchResults: SearchResult[];
}

@Injectable()
export class SnapshotService {
  private readonly logger = new Logger(SnapshotService.name);

  constructor(
    @Inject(DRIZZLE_TOKEN) private readonly db: DrizzleDb,
    private readonly embeddings: EmbeddingsService,
  ) {}

  /**
   * Persist a structured snapshot for a single fetch. Returns the new row.
   *
   * Stub today — extracts a minimal structuredJson + embeds the
   * concatenated titles. Replace with an LLM call once the full pipeline
   * is in place; the function signature won't change.
   */
  async create(input: SnapshotInput) {
    // For now, the "structured" form is just the trimmed search hits. This
    // is enough for the delta detector to work on text overlap until we
    // wire generateObject for proper fact extraction.
    const structuredJson = {
      queryText: input.queryText,
      hits: input.searchResults.slice(0, 5).map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content.slice(0, 600),
        score: r.score,
      })),
    };

    // Concatenate the top hits to embed. Cap at ~2k chars so one bad result
    // can't blow up the model's context window.
    const embedText = [input.queryText, ...input.searchResults.slice(0, 3).map((r) => r.title + '. ' + r.content)]
      .join('\n')
      .slice(0, 2000);

    const embedding = await this.embeddings.embed(embedText);

    const [row] = await this.db
      .insert(snapshots)
      .values({
        queryId: input.queryId,
        fetchId: input.fetchId,
        structuredJson,
        // pgvector expects Postgres-formatted vector text; drizzle-orm's
        // vector column accepts a number[] directly.
        embedding,
      })
      .returning();

    this.logger.log(
      `Snapshot ${row.id} written for query=${input.queryId} fetch=${input.fetchId}`,
    );
    return row;
  }
}
