// Global services module — all the AI / external-API wrappers live here.
//
// Marked @Global so feature modules can inject any of these without having
// to add ServicesModule to their own imports list. We pay for that
// convenience with a slightly leakier surface, which is fine for an MVP.

import { Global, Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { EmbeddingsService } from './embeddings.service';
import { SearchService } from './search.service';
import { SnapshotService } from './snapshot.service';
import { DeltaService } from './delta.service';
import { BriefingService } from './briefing.service';
import { ApnsService } from './apns.service';
import { QuietHoursService } from './quiet-hours.service';
import { KeyRotator } from './key-rotator';
import { getOpenRouterKeys } from '../config/env';

@Global()
@Module({
  providers: [
    // KeyRotator is built once at module init from the env. If keys aren't
    // configured, getOpenRouterKeys() throws here with a readable error —
    // the app fails to boot rather than silently 401-ing every LLM call.
    {
      provide: KeyRotator,
      useFactory: () => new KeyRotator(getOpenRouterKeys()),
    },
    LlmService,
    EmbeddingsService,
    SearchService,
    SnapshotService,
    DeltaService,
    BriefingService,
    ApnsService,
    QuietHoursService,
  ],
  exports: [
    KeyRotator,
    LlmService,
    EmbeddingsService,
    SearchService,
    SnapshotService,
    DeltaService,
    BriefingService,
    ApnsService,
    QuietHoursService,
  ],
})
export class ServicesModule {}
