import { EventStoreService } from '../src/monitoring/event-store.service';

describe('EventStoreService', () => {
  let store: EventStoreService;

  beforeEach(() => {
    store = new EventStoreService();
  });

  it('records and lists events newest-first', () => {
    store.record({
      source: 'server',
      level: 'info',
      message: 'first',
    });
    store.record({
      source: 'client',
      level: 'error',
      message: 'second',
    });

    const list = store.listRecent({ limit: 10 });
    expect(list).toHaveLength(2);
    expect(list[0].message).toBe('second');
    expect(list[1].message).toBe('first');
  });

  it('filters by source and level', () => {
    store.record({ source: 'server', level: 'warn', message: 'a' });
    store.record({ source: 'worker', level: 'error', message: 'b' });
    store.record({ source: 'client', level: 'error', message: 'c' });

    expect(store.listRecent({ source: 'worker' })).toHaveLength(1);
    expect(store.listRecent({ level: 'error' })).toHaveLength(2);
  });

  it('caps the ring buffer at 300 events', () => {
    for (let i = 0; i < 310; i++) {
      store.record({
        source: 'server',
        level: 'debug',
        message: `evt-${i}`,
      });
    }
    expect(store.summary().total).toBe(300);
    expect(store.listRecent({ limit: 1 })[0].message).toBe('evt-309');
  });

  it('summarizes counts by level and source', () => {
    store.record({ source: 'server', level: 'error', message: 'x' });
    store.record({ source: 'client', level: 'warn', message: 'y' });

    const summary = store.summary();
    expect(summary.byLevel.error).toBe(1);
    expect(summary.byLevel.warn).toBe(1);
    expect(summary.bySource.server).toBe(1);
    expect(summary.bySource.client).toBe(1);
    expect(summary.lastHour).toBe(2);
  });
});
