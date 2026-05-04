// Unit tests for the in-memory KeyRotator.
//
// We inject a fake clock so the time-based behaviour (cooldowns, sliding
// window, daily reset) is deterministic — no flakey setTimeout, no waiting
// in CI for 60s windows to clear.

import { KeyRotator } from '../src/services/key-rotator';

describe('KeyRotator', () => {
  // Mutable "now" that fake clock returns. Tests advance this manually.
  let now: Date;
  const clock = () => now;

  beforeEach(() => {
    now = new Date('2026-05-05T10:00:00Z');
  });

  it('throws when no keys are provided', () => {
    expect(() => new KeyRotator([])).toThrow();
  });

  it('picks the only key when one is available', () => {
    const r = new KeyRotator(['sk-or-v1-AAAA'], clock);
    const pick = r.pick();
    expect(pick).not.toBeNull();
    expect(pick!.key).toBe('sk-or-v1-AAAA');
    expect(pick!.keyId).toBe('AAAA'); // last 4 chars
  });

  it('rotates to the lower-usage key after a success', () => {
    const r = new KeyRotator(['key-AAAA', 'key-BBBB'], clock);

    // First pick is arbitrary (both at 0). Use the result.
    const first = r.pick()!;
    r.markSuccess(first.key);

    // Second pick MUST go to the other key (now 0 vs 1 calls).
    const second = r.pick()!;
    expect(second.key).not.toBe(first.key);
  });

  it('skips a key that is in cooldown after rate-limit', () => {
    const r = new KeyRotator(['key-AAAA', 'key-BBBB'], clock);
    r.markRateLimit('key-AAAA', 60_000); // 1 minute cooldown

    // Even after 50s, AAAA is still cooling. BBBB is the only candidate.
    now = new Date(now.getTime() + 50_000);
    const pick = r.pick()!;
    expect(pick.key).toBe('key-BBBB');
  });

  it('returns null when every key is on cooldown', () => {
    const r = new KeyRotator(['key-AAAA', 'key-BBBB'], clock);
    r.markRateLimit('key-AAAA', 60_000);
    r.markRateLimit('key-BBBB', 60_000);

    expect(r.pick()).toBeNull();
  });

  it('re-eligibility kicks in once cooldown elapses', () => {
    const r = new KeyRotator(['key-AAAA'], clock);
    r.markRateLimit('key-AAAA', 60_000);
    expect(r.pick()).toBeNull();

    // Skip past the cooldown.
    now = new Date(now.getTime() + 61_000);
    const pick = r.pick();
    expect(pick).not.toBeNull();
    expect(pick!.key).toBe('key-AAAA');
  });

  it('per-minute counter slides — old calls drop off after 60s', () => {
    const r = new KeyRotator(['key-AAAA'], clock);
    r.markSuccess('key-AAAA');
    r.markSuccess('key-AAAA');
    expect(r.getSnapshot()[0].usedThisMinute).toBe(2);

    // 61 seconds later, both calls have aged out of the window.
    now = new Date(now.getTime() + 61_000);
    expect(r.getSnapshot()[0].usedThisMinute).toBe(0);
  });

  it('day counter accumulates and survives the 60s window', () => {
    const r = new KeyRotator(['key-AAAA'], clock);
    r.markSuccess('key-AAAA');
    r.markSuccess('key-AAAA');
    now = new Date(now.getTime() + 61_000);
    expect(r.getSnapshot()[0].usedToday).toBe(2);
  });

  it('daily counter resets at UTC midnight', () => {
    const r = new KeyRotator(['key-AAAA'], clock);
    r.markSuccess('key-AAAA');
    expect(r.getSnapshot()[0].usedToday).toBe(1);

    // Jump to next UTC day.
    now = new Date('2026-05-06T00:01:00Z');
    expect(r.getSnapshot()[0].usedToday).toBe(0);
  });

  it('snapshot exposes keyId not the raw secret', () => {
    const r = new KeyRotator(['sk-or-v1-supersecret-key-XYZW'], clock);
    const snap = r.getSnapshot();
    expect(snap[0].keyId).toBe('XYZW');
    // Defence-in-depth: ensure no field leaks the full key.
    for (const v of Object.values(snap[0])) {
      expect(typeof v === 'string' ? v : '').not.toContain('supersecret');
    }
  });

  it('markRateLimit also bumps usedToday (the call cost a slot upstream)', () => {
    const r = new KeyRotator(['key-AAAA'], clock);
    r.markRateLimit('key-AAAA');
    expect(r.getSnapshot()[0].usedToday).toBe(1);
  });

  it('markError records lastError without putting the key on cooldown', () => {
    const r = new KeyRotator(['key-AAAA'], clock);
    r.markError('key-AAAA', new Error('model temporarily unavailable'));
    const snap = r.getSnapshot()[0];
    expect(snap.lastError).toContain('model temporarily unavailable');
    expect(snap.cooldownUntil).toBeNull();
    // Key is still pickable.
    expect(r.pick()).not.toBeNull();
  });
});
