// Smoke test for QuietHoursService. Pure function — no Nest container.
//
// Why this test first: it's the simplest piece of business logic in the
// app and exercises our test plumbing (jest + ts-jest config).

import { QuietHoursService } from '../src/services/quiet-hours.service';

describe('QuietHoursService', () => {
  const svc = new QuietHoursService();
  const at = (h: number, m = 0) => new Date(2026, 3, 28, h, m, 0);

  it('detects quiet inside a wrapping window (22:00 -> 07:00)', () => {
    const w = { start: '22:00', end: '07:00' };
    expect(svc.isWithin(w, at(23))).toBe(true);
    expect(svc.isWithin(w, at(2))).toBe(true);
    expect(svc.isWithin(w, at(7))).toBe(false); // exactly end is not quiet
    expect(svc.isWithin(w, at(12))).toBe(false);
  });

  it('detects quiet inside a normal window (13:00 -> 14:00)', () => {
    const w = { start: '13:00', end: '14:00' };
    expect(svc.isWithin(w, at(13))).toBe(true);
    expect(svc.isWithin(w, at(13, 59))).toBe(true);
    expect(svc.isWithin(w, at(14))).toBe(false);
    expect(svc.isWithin(w, at(12, 59))).toBe(false);
  });
});
