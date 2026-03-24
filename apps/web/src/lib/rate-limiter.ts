/**
 * Per-IP token bucket rate limiter.
 * Allows MAX_TOKENS requests per WINDOW_MS.
 * State is in-process memory — resets on cold start.
 */

const MAX_TOKENS = 10;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

interface Bucket {
  tokens: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(ip);

  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(ip, { tokens: MAX_TOKENS - 1, windowStart: now });
    return true;
  }

  if (bucket.tokens <= 0) {
    return false;
  }

  bucket.tokens -= 1;
  return true;
}
