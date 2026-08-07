import crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';

/**
 * Compares two secrets without leaking their contents through timing.
 *
 * `crypto.timingSafeEqual` throws on length mismatch, and comparing lengths
 * first would leak the secret's length. Hashing both sides to a fixed 32 bytes
 * sidesteps that: the comparison is always over equal-length buffers, and the
 * hash of a wrong guess reveals nothing about the real value.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hb = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Best-effort client IP, for rate limiting and reject logging only.
 *
 * On Railway the socket address is the edge proxy, so the real client is the
 * first entry in X-Forwarded-For. That header is client-controllable, so this
 * value is never a security decision on its own — the shared secret is the
 * actual gate. A forged header can at most evade rate limiting.
 */
export function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (raw) {
    const first = raw.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Fixed-window per-IP limiter. In-memory by design: there is one instance and
 * one user, so the coordination a shared store would buy is not worth the
 * dependency. Losing counters on restart is acceptable.
 */
export function checkRateLimit(ip: string): boolean {
  const now = Date.now();

  // Opportunistic pruning keeps the map from growing without bound under a
  // spray of distinct source IPs. Cheap because the map stays small.
  if (buckets.size > 1024) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }

  const existing = buckets.get(ip);
  if (!existing || existing.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  existing.count += 1;
  return existing.count <= MAX_REQUESTS_PER_WINDOW;
}

/** Exposed for tests; resets limiter state. */
export function resetRateLimits(): void {
  buckets.clear();
}
