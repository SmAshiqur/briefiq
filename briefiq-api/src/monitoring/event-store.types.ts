// Shared types for the in-memory monitoring ring buffer.
// Server errors, worker failures, and iOS client events all land here
// with the same shape so GET /ops/events can show a unified timeline.

export type EventSource = 'server' | 'client' | 'worker';

export type EventLevel = 'debug' | 'info' | 'warn' | 'error';

export interface MonitorEvent {
  id: string;
  timestamp: string;
  source: EventSource;
  level: EventLevel;
  message: string;
  /** Optional structured context — never put secrets here. */
  context?: Record<string, unknown>;
}

export interface EventSummary {
  total: number;
  lastHour: number;
  byLevel: Record<EventLevel, number>;
  bySource: Record<EventSource, number>;
}

export interface ListEventsOptions {
  limit?: number;
  source?: EventSource;
  level?: EventLevel;
}
