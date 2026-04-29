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

@Global()
@Module({
  providers: [
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
