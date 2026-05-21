// Integration spec for RunQueryProcessor.
//
// We mock every external service (DB, Search, Snapshot, Delta, Briefing,
// APNs, QuietHours) and verify the orchestration logic does the right
// thing in the three scenarios that matter:
//
//   1. Happy path: search hits -> change detected -> briefing -> push sent
//   2. Silence:    search hits -> no change -> no briefing, no push
//   3. Quiet hours: change detected, briefing created, but importance is
//      'minor' so push is suppressed and a notifications row records why
//
// Mocking the DB the way Drizzle exposes it (chainable API) is verbose but
// keeps tests fast (no Postgres) and deterministic. The verbosity is
// limited to a single helper at the top of the file.

import { Test } from '@nestjs/testing';
import type { Job } from 'bullmq';

import { RunQueryProcessor } from '../src/workers/run-query.processor';
import { DRIZZLE_TOKEN } from '../src/db/client';
import { SearchService } from '../src/services/search.service';
import { SnapshotService } from '../src/services/snapshot.service';
import { DeltaService } from '../src/services/delta.service';
import { BriefingService } from '../src/services/briefing.service';
import { ApnsService } from '../src/services/apns.service';
import { QuietHoursService } from '../src/services/quiet-hours.service';
import { EventStoreService } from '../src/monitoring/event-store.service';

// ── DB mock helpers ───────────────────────────────────────────────────────
//
// Drizzle's API is `db.select().from().where().limit()` (and similar for
// insert/update). For each test we queue up the values we want each chain
// to resolve to. The helper hands back a fresh chain object every call.

interface QueuedDbReturns {
  selects: unknown[][];
  insertReturns: unknown[][];
  updateResolves: unknown[][]; // arrays we resolve to from .where(...)
}

function makeMockDb(returns: QueuedDbReturns) {
  // Pull the next return off the head of each array. Tests must queue them
  // up in call order or this mock returns undefined.
  const popNext = <T>(arr: T[][]): T[] => arr.shift() ?? [];

  const select = jest.fn(() => ({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(popNext(returns.selects)),
      }),
    }),
  }));

  const insert = jest.fn(() => ({
    values: () => ({
      returning: () => Promise.resolve(popNext(returns.insertReturns)),
      // Calls without .returning() (notifications inserts) — also resolve.
      then: (resolve: (v: unknown[]) => void) => resolve([]),
    }),
  }));

  const update = jest.fn(() => ({
    set: () => ({
      where: () => Promise.resolve(popNext(returns.updateResolves)),
    }),
  }));

  return { select, insert, update };
}

// ── Test data ─────────────────────────────────────────────────────────────

const QUERY_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000002';
const FETCH_ID = '00000000-0000-0000-0000-000000000003';
const SNAPSHOT_ID = '00000000-0000-0000-0000-000000000004';
const BRIEFING_ID = '00000000-0000-0000-0000-000000000005';

const baseQueryRow = {
  id: QUERY_ID,
  userId: USER_ID,
  rawText: 'Track dollar rate in Bangladesh',
  intentType: 'trend',
  sourcesJson: { domains: ['bb.org.bd'] },
  frequency: 'daily',
  signalThreshold: null,
  status: 'active',
  customCron: null,
  createdAt: new Date('2026-05-01T00:00:00Z'),
  lastCheckedAt: null,
  nextCheckAt: new Date('2026-05-05T10:00:00Z'),
};

const baseUserRow = {
  pushToken: 'test-device-token-12345678',
  quietStart: '22:00',
  quietEnd: '07:00',
};

// ── Suite ─────────────────────────────────────────────────────────────────

describe('RunQueryProcessor', () => {
  let processor: RunQueryProcessor;
  let db: ReturnType<typeof makeMockDb>;
  let search: { search: jest.Mock };
  let snapshot: { create: jest.Mock };
  let delta: { detect: jest.Mock };
  let briefing: { createFromDelta: jest.Mock };
  let apns: { send: jest.Mock };
  let quietHours: { isWithin: jest.Mock };

  // Helper: build a fake BullMQ Job — only `data` is read by the processor.
  const job = (queryId = QUERY_ID): Job =>
    ({ data: { queryId } } as unknown as Job);

  async function setup(returns: QueuedDbReturns) {
    db = makeMockDb(returns);
    search = { search: jest.fn() };
    snapshot = { create: jest.fn() };
    delta = { detect: jest.fn() };
    briefing = { createFromDelta: jest.fn() };
    apns = { send: jest.fn() };
    quietHours = { isWithin: jest.fn() };

    const mod = await Test.createTestingModule({
      providers: [
        RunQueryProcessor,
        { provide: DRIZZLE_TOKEN, useValue: db },
        { provide: SearchService, useValue: search },
        { provide: SnapshotService, useValue: snapshot },
        { provide: DeltaService, useValue: delta },
        { provide: BriefingService, useValue: briefing },
        { provide: ApnsService, useValue: apns },
        { provide: QuietHoursService, useValue: quietHours },
        { provide: EventStoreService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    processor = mod.get(RunQueryProcessor);
  }

  // ── Happy path ─────────────────────────────────────────────────────────

  it('runs the full pipeline and delivers a push when a change is detected', async () => {
    await setup({
      selects: [
        [baseQueryRow], // query lookup
        [baseUserRow], // user lookup inside maybeDeliverPush
      ],
      insertReturns: [
        [{ id: FETCH_ID }], // fetches insert
        // notifications insert (no .returning()) — handled by the .then()
        // path in the mock; nothing to queue here.
      ],
      updateResolves: [
        [], // close fetches row
        [], // update queries.lastCheckedAt + nextCheckAt
      ],
    });

    search.search.mockResolvedValue([
      {
        title: 'BDT/USD edges higher',
        url: 'https://bb.org.bd/news/123',
        content: 'The taka weakened to 109.50 against the dollar today...',
        score: 0.91,
      },
    ]);
    snapshot.create.mockResolvedValue({
      id: SNAPSHOT_ID,
      structuredJson: { hits: [] },
      embedding: new Array(384).fill(0.01),
    });
    delta.detect.mockResolvedValue({
      changed: true,
      explanation: 'Rate up by 1.5 BDT vs prior snapshot',
      score: 0.22,
    });
    briefing.createFromDelta.mockResolvedValue({
      id: BRIEFING_ID,
      importance: 'important',
      summary: 'Taka weakened to 109.50 BDT/USD on Bangladesh Bank report.',
    });
    quietHours.isWithin.mockReturnValue(false);
    apns.send.mockResolvedValue({ delivered: true });

    await processor.process(job());

    expect(search.search).toHaveBeenCalledTimes(1);
    expect(snapshot.create).toHaveBeenCalledTimes(1);
    expect(delta.detect).toHaveBeenCalledTimes(1);
    expect(briefing.createFromDelta).toHaveBeenCalledTimes(1);
    expect(apns.send).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceToken: baseUserRow.pushToken,
        importance: 'important',
        link: `briefiq://briefings/${BRIEFING_ID}`,
      }),
    );

    // Two updates: close fetch, reschedule query.
    expect(db.update).toHaveBeenCalledTimes(2);
  });

  // ── Silence path ───────────────────────────────────────────────────────

  it('produces no briefing when delta detector says no_signal', async () => {
    await setup({
      selects: [
        [baseQueryRow], // query lookup
        // No user lookup expected — push path never runs.
      ],
      insertReturns: [
        [{ id: FETCH_ID }],
      ],
      updateResolves: [
        [],
        [],
      ],
    });

    search.search.mockResolvedValue([
      {
        title: 'No real change',
        url: 'https://bb.org.bd/x',
        content: '...',
        score: 0.4,
      },
    ]);
    snapshot.create.mockResolvedValue({
      id: SNAPSHOT_ID,
      structuredJson: {},
      embedding: new Array(384).fill(0),
    });
    delta.detect.mockResolvedValue({ changed: false, reason: 'no_signal' });

    await processor.process(job());

    expect(briefing.createFromDelta).not.toHaveBeenCalled();
    expect(apns.send).not.toHaveBeenCalled();
    // Reschedule still happens.
    expect(db.update).toHaveBeenCalledTimes(2);
  });

  // ── Quiet-hours suppression ────────────────────────────────────────────

  it('suppresses non-important push when within quiet hours', async () => {
    await setup({
      selects: [
        [baseQueryRow],
        [baseUserRow],
      ],
      insertReturns: [
        [{ id: FETCH_ID }],
      ],
      updateResolves: [
        [],
        [],
      ],
    });

    search.search.mockResolvedValue([
      { title: 'x', url: 'https://example.com', content: 'y', score: 0.5 },
    ]);
    snapshot.create.mockResolvedValue({
      id: SNAPSHOT_ID,
      structuredJson: {},
      embedding: new Array(384).fill(0),
    });
    delta.detect.mockResolvedValue({
      changed: true,
      explanation: 'mild shift',
      score: 0.18,
    });
    briefing.createFromDelta.mockResolvedValue({
      id: BRIEFING_ID,
      importance: 'minor', // would be a digest item
      summary: 'Small change observed.',
    });
    quietHours.isWithin.mockReturnValue(true); // we are in quiet hours

    await processor.process(job());

    // Briefing was created — that's a DB record regardless of delivery.
    expect(briefing.createFromDelta).toHaveBeenCalledTimes(1);
    // But push was NOT sent because importance != 'important' in quiet hours.
    expect(apns.send).not.toHaveBeenCalled();
  });

  // ── Edge: missing query ────────────────────────────────────────────────

  it('exits cleanly when the query no longer exists', async () => {
    await setup({
      selects: [[]], // empty result
      insertReturns: [],
      updateResolves: [],
    });

    await processor.process(job('00000000-0000-0000-0000-deadbeefdead'));

    expect(search.search).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  // ── Edge: paused query ─────────────────────────────────────────────────

  it('skips paused queries entirely', async () => {
    await setup({
      selects: [[{ ...baseQueryRow, status: 'paused' }]],
      insertReturns: [],
      updateResolves: [],
    });

    await processor.process(job());

    expect(search.search).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
});
