/**
 * Limits attempts per key (an IP address, a username) in a fixed window, to
 * slow down password guessing. Kept in memory: a restart clears it.
 */
export class RateLimiter {
  private readonly attempts = new Map<string, { count: number; resetAt: number }>();
  private readonly max: number;
  private readonly windowMs: number;

  constructor(max: number, windowMs: number) {
    this.max = max;
    this.windowMs = windowMs;
  }

  /**
   * Counts an attempt before it is checked, so many requests sent at once
   * can't all get through. Returns the seconds to wait when over the limit
   * (the attempt is then refused), or 0.
   */
  attempt(key: string, now = Date.now()): number {
    let entry = this.attempts.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + this.windowMs };
      this.attempts.set(key, entry);
      if (this.attempts.size > 10_000) this.prune(now);
    }
    if (entry.count >= this.max) return Math.ceil((entry.resetAt - now) / 1000);
    entry.count++;
    return 0;
  }

  /** Forgets the attempts of a key (after a successful one). */
  reset(key: string) {
    this.attempts.delete(key);
  }

  private prune(now: number) {
    for (const [key, entry] of this.attempts) {
      if (entry.resetAt <= now) this.attempts.delete(key);
    }
  }
}
