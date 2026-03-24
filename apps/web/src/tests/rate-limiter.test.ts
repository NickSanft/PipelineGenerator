import { describe, it, expect, vi, beforeEach } from 'vitest';

// We manipulate Date.now() to control the time window
let now = 0;
vi.spyOn(Date, 'now').mockImplementation(() => now);

// Import AFTER mocking Date.now so module-level Map is clean each re-import
const { checkRateLimit } = await import('../lib/rate-limiter.js');

describe('checkRateLimit()', () => {
  beforeEach(() => {
    now = 1_000_000;
  });

  it('allows the first 10 requests from the same IP', () => {
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit('1.2.3.4')).toBe(true);
    }
  });

  it('blocks the 11th request from the same IP', () => {
    for (let i = 0; i < 10; i++) checkRateLimit('5.6.7.8');
    expect(checkRateLimit('5.6.7.8')).toBe(false);
  });

  it('treats different IPs independently', () => {
    for (let i = 0; i < 10; i++) checkRateLimit('10.0.0.1');
    expect(checkRateLimit('10.0.0.2')).toBe(true);
  });

  it('resets after the window expires', () => {
    for (let i = 0; i < 10; i++) checkRateLimit('9.9.9.9');
    expect(checkRateLimit('9.9.9.9')).toBe(false);

    // Advance 1 hour + 1 ms
    now += 60 * 60 * 1000 + 1;
    expect(checkRateLimit('9.9.9.9')).toBe(true);
  });
});
