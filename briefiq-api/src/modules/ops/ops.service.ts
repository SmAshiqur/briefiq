// Ops service — ingests client events and serves the monitoring timeline.

import { Injectable, Logger } from '@nestjs/common';

import { EventStoreService } from '../../monitoring/event-store.service';
import type {
  EventLevel,
  EventSource,
  MonitorEvent,
} from '../../monitoring/event-store.types';
import type { ClientEventDto } from './dto/create-client-events.dto';

@Injectable()
export class OpsService {
  private readonly logger = new Logger(OpsService.name);

  constructor(private readonly eventStore: EventStoreService) {}

  /** Store one batch of client-reported events. */
  ingestClientEvents(
    userId: string,
    events: ClientEventDto[],
  ): { accepted: number } {
    for (const e of events) {
      const stored = this.eventStore.record({
        source: 'client',
        level: e.level,
        message: e.message,
        context: {
          userId,
          ...e.context,
        },
      });

      // Mirror warn/error to server logs for Fly.io / local tail -f.
      if (e.level === 'error') {
        this.logger.error(
          `client error user=${userId}: ${e.message}`,
          e.context ? JSON.stringify(e.context) : undefined,
        );
      } else if (e.level === 'warn') {
        this.logger.warn(`client warn user=${userId}: ${e.message}`);
      }
    }

    return { accepted: events.length };
  }

  listEvents(options: {
    limit?: number;
    source?: EventSource;
    level?: EventLevel;
  }): MonitorEvent[] {
    return this.eventStore.listRecent(options);
  }

  summary() {
    return this.eventStore.summary();
  }
}
