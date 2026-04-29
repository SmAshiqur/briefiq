// Search service — Tavily AI Search wrapper.
//
// Tavily is the primary fetch engine. Firecrawl will land later as the
// fallback for paywalled / JS-heavy pages (see plan.md "Risks" section).
//
// We deliberately keep this thin: the Tavily client itself is well-typed
// in @tavily/core. This wrapper exists so:
//   1. The rest of the app never imports Tavily directly (easy to swap)
//   2. We can centralize source-allowlist logic + reliability scoring
//   3. Tests can mock this single class instead of HTTP-level mocks

import { Injectable, Logger } from '@nestjs/common';
import { getEnv } from '../config/env';

export interface SearchResult {
  title: string;
  url: string;
  // Plain-text snippet from the result page. Already deduplicated by Tavily.
  content: string;
  // Tavily's own relevance score 0..1. We surface it for downstream ranking.
  score: number;
  publishedDate?: string;
}

export interface SearchOptions {
  /** Restrict to specific domains. Pass null for an open search. */
  includeDomains?: string[];
  /** Limit the number of results. Tavily caps at 20. */
  maxResults?: number;
  /** When true, favors recent content. Good for "today" queries. */
  recent?: boolean;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  // Lazy client so tests / dev without TAVILY_API_KEY don't fail at boot.
  private clientPromise: Promise<{
    search: (q: string, opts: Record<string, unknown>) => Promise<{
      results: Array<{
        title: string;
        url: string;
        content: string;
        score: number;
        published_date?: string;
      }>;
    }>;
  }> | null = null;

  private async getClient() {
    if (this.clientPromise) return this.clientPromise;
    const env = getEnv();
    if (!env.TAVILY_API_KEY) {
      throw new Error(
        'TAVILY_API_KEY is not set. Add one to .env to use search.',
      );
    }
    // Dynamic import for the same ESM/CJS reasons as embeddings.
    this.clientPromise = (async () => {
      const mod = await import('@tavily/core');
      // The exported factory in @tavily/core is `tavily`.
      return mod.tavily({ apiKey: env.TAVILY_API_KEY });
    })();
    return this.clientPromise;
  }

  /**
   * Run a search. Returns up to N results sorted by Tavily's score.
   *
   * Errors don't throw — they return [] and log. The caller (fetch worker)
   * treats an empty result as "no fresh data this cycle", which is the
   * silence-is-a-feature behavior we want.
   */
  async search(
    query: string,
    opts: SearchOptions = {},
  ): Promise<SearchResult[]> {
    try {
      const client = await this.getClient();
      const res = await client.search(query, {
        // Topic 'news' biases toward recent articles when recent=true.
        topic: opts.recent ? 'news' : 'general',
        max_results: opts.maxResults ?? 5,
        include_domains: opts.includeDomains,
        // include_raw_content costs extra tokens; skip during prototype.
        include_raw_content: false,
      });
      return res.results.map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content,
        score: r.score,
        publishedDate: r.published_date,
      }));
    } catch (err) {
      this.logger.warn(
        `Tavily search failed for "${query.slice(0, 60)}": ${(err as Error).message}`,
      );
      return [];
    }
  }
}
