// In-memory ring buffer of recent monitoring events.
//
// Why in-memory for the prototype:
//   - Zero migration / schema churn while we iterate on event shape.
//   - Fast enough for dev dashboards and GET /ops/events.
//   - Production should also ship logs to Fly.io/Grafana and optional Sentry;
//     this store is the "what happened in the last N minutes" view.
//
// Events are capped at MAX_EVENTS; oldest entries drop off silently.

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

import type {
  EventLevel,
  EventSource,
  EventSummary,
  ListEventsOptions,
  MonitorEvent,
} from './event-store.types';

const MAX_EVENTS = 300;

const EMPTY_LEVELS: Record<EventLevel, number> = {
  debug: 0,
  info: 0,
  warn: 0,
  error: 0,
};

const EMPTY_SOURCES: Record<EventSource, number> = {
  server: 0,
  client: 0,
  worker: 0,
};

@Injectable()
export class EventStoreService {
  private events: MonitorEvent[] = [];

  /**
   * Append an event. Returns the stored record (with generated id/timestamp).
   */
  record(
    input: Omit<MonitorEvent, 'id' | 'timestamp'> & {
      id?: string;
      timestamp?: string;
    },
  ): MonitorEvent {
    const event: MonitorEvent = {
      id: input.id ?? randomUUID(),
      timestamp: input.timestamp ?? new Date().toISOString(),
      source: input.source,
      level: input.level,
      message: input.message,
      context: input.context,
    };

    this.events.push(event);
    if (this.events.length > MAX_EVENTS) {
      this.events = this.events.slice(-MAX_EVENTS);
    }
    return event;
  }

  /** Newest-first list with optional filters. */
  listRecent(options: ListEventsOptions = {}): MonitorEvent[] {
    const limit = Math.min(options.limit ?? 50, MAX_EVENTS);
    let out = [...this.events].reverse();

    if (options.source) {
      out = out.filter((e) => e.source === options.source);
    }
    if (options.level) {
      out = out.filter((e) => e.level === options.level);
    }

    return out.slice(0, limit);
  }

  /** Aggregate counts for /ops/summary and /health. */
  summary(): EventSummary {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const byLevel = { ...EMPTY_LEVELS };
    const bySource = { ...EMPTY_SOURCES };
    let lastHour = 0;

    for (const e of this.events) {
      byLevel[e.level]++;
      bySource[e.source]++;
      if (new Date(e.timestamp).getTime() >= oneHourAgo) {
        lastHour++;
      }
    }

    return {
      total: this.events.length,
      lastHour,
      byLevel,
      bySource,
    };
  }

  /** Test helper — clears the buffer. */
  clear(): void {
    this.events = [];
  }
}
