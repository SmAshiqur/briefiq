// Briefing service — final step of the pipeline. Given a delta verdict
// that says "yes, push", asks the LLM for a 2-sentence summary and an
// importance label, then writes a row to the briefings table.

import { Inject, Injectable, Logger } from '@nestjs/common';
import { DRIZZLE_TOKEN, type DrizzleDb } from '../db/client';
import { briefings } from '../db/schema';
import { LlmService, LlmExhaustedError } from './llm.service';

export interface BriefingInput {
  queryId: string;
  fetchId: string;
  prevSnapshotId?: string;
  queryText: string;
  deltaVerdict: string;
  // The new snapshot's structured_json. Used as raw input to the summarizer.
  facts: unknown;
  // Optional: domains cited in the source material.
  sourceDomains?: string[];
}

@Injectable()
export class BriefingService {
  private readonly logger = new Logger(BriefingService.name);

  constructor(
    @Inject(DRIZZLE_TOKEN) private readonly db: DrizzleDb,
    private readonly llm: LlmService,
  ) {}

  /**
   * Generate + persist a briefing. If the LLM fails entirely (cascade
   * exhausted), returns null and logs — the cycle degrades to "no fresh
   * briefing", which is intentional silence rather than an error.
   */
  async createFromDelta(input: BriefingInput) {
    let summary: string;
    let importance: 'important' | 'new' | 'minor';

    try {
      const result = await this.llm.summarizeDelta({
        queryText: input.queryText,
        deltaVerdict: input.deltaVerdict,
        facts: input.facts,
      });
      summary = result.summary;
      importance = result.importance;
    } catch (err) {
      if (err instanceof LlmExhaustedError) {
        this.logger.warn(
          `LLM exhausted for query=${input.queryId}; skipping briefing creation. ` +
            'This is expected silence, not a bug.',
        );
        return null;
      }
      throw err;
    }

    const [row] = await this.db
      .insert(briefings)
      .values({
        queryId: input.queryId,
        fetchId: input.fetchId,
        prevSnapshotId: input.prevSnapshotId,
        deltaVerdict: input.deltaVerdict,
        importance,
        summary,
        sourcesJson: input.sourceDomains
          ? { domains: input.sourceDomains }
          : null,
      })
      .returning();

    this.logger.log(
      `Briefing ${row.id} created for query=${input.queryId} importance=${importance}`,
    );
    return row;
  }
}
