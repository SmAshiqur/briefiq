// Global monitoring module — EventStoreService is injectable everywhere
// without re-importing this module in each feature.

import { Global, Module } from '@nestjs/common';
import { EventStoreService } from './event-store.service';

@Global()
@Module({
  providers: [EventStoreService],
  exports: [EventStoreService],
})
export class MonitoringModule {}
