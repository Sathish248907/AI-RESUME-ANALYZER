/**
 * rateLimit.ts — a small fixed-window limiter for the legacy Next.js route
 * handlers. The Express backend has `express-rate-limit`; these handlers run in
 * the Next process and have nothing, so an expensive AI call was previously
 * unmetered.
 *
 * **What this does and does not guarantee.** The counters live in this
 * process's memory. On a single long-running Node server that is a real limit.
 * On a serverless platform each instance keeps its own counters, so the
 * effective allowance is per instance, not global — it raises the cost of a
 * naive loop without being a defence against a determined, distributed caller.
 * The hard input caps in the route are the control that always holds.
 *
 * A shared store (Redis, Upstash) is the upgrade path; it is deliberately not
 * pretended to be here.
 */

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

/** Drop expired windows so the map cannot grow without bound. */
function sweep(now: number): void {
  if (windows.size < 1000) return;
  for (const [key, w] of windows) {
    if (w.resetAt <= now) windows.delete(key);
  }
}

export interface TakeResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function takeToken(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): TakeResult {
  const now = Date.now();
  sweep(now);

  const existing = windows.get(key);
  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, retryAfterSeconds: 0 };
}

/**
 * A stable key for the caller: the user id when signed in, otherwise the
 * client address. `x-forwarded-for` is only trustworthy behind a proxy that
 * sets it, which is why a signed-in caller is keyed by id instead.
 */
export function clientKey(req: Request, userId?: string): string {
  if (userId) return `user:${userId}`;
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  return `ip:${ip}`;
}

/** Test seam: drop all counters. */
export function resetRateLimits(): void {
  windows.clear();
}
