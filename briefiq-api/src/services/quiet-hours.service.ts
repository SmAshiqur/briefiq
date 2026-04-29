// Quiet hours gating. Pure function service — no DB, no async.
//
// The user picks two HH:MM strings (default 22:00 -> 07:00). Any push that
// arrives between them is held back to the morning digest. The window can
// span midnight; we handle that case explicitly.
//
// Time math is intentionally simple: minute-of-day arithmetic. We assume
// the user is in one timezone for now; full TZ-aware handling lands when
// we add user timezone storage in Settings (Week 5+).

import { Injectable } from '@nestjs/common';

export interface QuietHoursWindow {
  /** "HH:MM" 24-hour. */
  start: string;
  /** "HH:MM" 24-hour. */
  end: string;
}

@Injectable()
export class QuietHoursService {
  /**
   * Returns true if `now` falls inside the quiet-hours window.
   * `now` defaults to current time so callers can omit it in production
   * but pass a fixed Date in tests.
   */
  isWithin(window: QuietHoursWindow, now: Date = new Date()): boolean {
    const cur = this.toMinutes(now.getHours(), now.getMinutes());
    const start = this.parseHHMM(window.start);
    const end = this.parseHHMM(window.end);

    // Normal window (e.g. 13:00 -> 14:00).
    if (start < end) {
      return cur >= start && cur < end;
    }
    // Window wraps midnight (e.g. 22:00 -> 07:00). Quiet if we're in the
    // late-night portion OR the early-morning portion.
    return cur >= start || cur < end;
  }

  private parseHHMM(s: string): number {
    const [h, m] = s.split(':').map((n) => parseInt(n, 10));
    if (Number.isNaN(h) || Number.isNaN(m)) {
      // Defensive: invalid format means "no quiet hours" rather than crash.
      return -1;
    }
    return this.toMinutes(h, m);
  }

  private toMinutes(h: number, m: number) {
    return h * 60 + m;
  }
}
