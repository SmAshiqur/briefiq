// Embeddings service — local Xenova/transformers + bge-small-en-v1.5.
//
// Why local:
//   - Zero rate limit, zero API cost during prototype.
//   - 384-dim normalized vectors are exactly what pgvector HNSW needs.
//   - Adds ~100MB to the container but at our scale (~10 sentences/cycle)
//     ONNX runtime CPU time (~200-400ms/sentence) is invisible.
//
// First call after boot triggers a one-time model download (~50MB) into
// ./.cache/. We warm the pipeline in onModuleInit so the first user-facing
// request doesn't wait the full 3-5s cold start.
//
// One-line swap to OpenAI: replace `embed(text)` body with `embed()` from
// the Vercel AI SDK pointing at text-embedding-3-small (1536-dim). Bump
// the snapshots.embedding column dimension and backfill.

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

// We import lazily so test runs that don't need embeddings don't pay the
// ONNX runtime startup cost.
type FeatureExtractionPipeline = (
  text: string,
  opts: { pooling: 'mean' | 'cls'; normalize: boolean },
) => Promise<{ data: ArrayLike<number> }>;

@Injectable()
export class EmbeddingsService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingsService.name);
  private pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

  /**
   * Kick off model load at boot. We don't await it — Nest moves on while
   * the model downloads in the background. The first embed() call awaits
   * whatever progress has been made, then runs.
   */
  onModuleInit() {
    // Only warm in non-test envs; tests should mock this whole service.
    if (process.env.NODE_ENV === 'test') return;
    this.getPipeline().catch((err) => {
      // Don't crash the boot — degrade gracefully. Snapshots will be
      // written without an embedding until the model becomes available.
      this.logger.warn(
        `Embedding model warmup failed: ${(err as Error).message}. ` +
          'Embeddings will be disabled until manual retry.',
      );
    });
  }

  /**
   * Embed a string. Returns a 384-dim array of floats, or null if the model
   * is unavailable (e.g. offline, model load failed).
   *
   * Callers should treat null as "skip the vector column" and continue.
   */
  async embed(text: string): Promise<number[] | null> {
    try {
      const pipeline = await this.getPipeline();
      const out = await pipeline(text, { pooling: 'mean', normalize: true });
      return Array.from(out.data) as number[];
    } catch (err) {
      this.logger.error(
        `Embed failed for text len=${text.length}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  // Lazy load + cache the pipeline. Subsequent calls reuse the same instance.
  private async getPipeline(): Promise<FeatureExtractionPipeline> {
    if (!this.pipelinePromise) {
      this.pipelinePromise = (async () => {
        // Dynamic import keeps the heavy ONNX runtime out of the cold-path
        // bundle. Required because @xenova/transformers is ESM-only.
        const { pipeline } = await import('@xenova/transformers');
        this.logger.log(
          'Loading embedding model Xenova/bge-small-en-v1.5 (one-time, ~50MB)...',
        );
        const pipe = (await pipeline(
          'feature-extraction',
          'Xenova/bge-small-en-v1.5',
        )) as unknown as FeatureExtractionPipeline;
        this.logger.log('Embedding model ready.');
        return pipe;
      })();
    }
    return this.pipelinePromise;
  }
}
