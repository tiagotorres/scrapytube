import { describe, expect, it } from 'vitest';

import { RateLimiter } from './rate-limit.ts';

describe('RateLimiter', () => {
  it('allows a number of attempts per window, then says how long to wait', () => {
    const limiter = new RateLimiter(2, 60_000);
    expect(limiter.attempt('a', 0)).toBe(0);
    expect(limiter.attempt('a', 1000)).toBe(0);
    expect(limiter.attempt('a', 2000)).toBe(58);
    // Other keys are counted apart.
    expect(limiter.attempt('b', 2000)).toBe(0);
    // A new window starts once the first one is over.
    expect(limiter.attempt('a', 60_000)).toBe(0);
  });

  it('starts over after a reset', () => {
    const limiter = new RateLimiter(1, 60_000);
    expect(limiter.attempt('a', 0)).toBe(0);
    expect(limiter.attempt('a', 0)).toBeGreaterThan(0);
    limiter.reset('a');
    expect(limiter.attempt('a', 0)).toBe(0);
  });
});
