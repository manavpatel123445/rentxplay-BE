import type { Request, RequestHandler } from "express";
import { HttpError } from "../lib/http-error.ts";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/**
 * Fixed-window rate limit kept in memory. Fine for one API instance; move to Redis
 * (planned in the HLD) before running several instances, or each keeps its own count.
 */
export function rateLimit(options: { name: string; limit: number; windowMs: number; key: (req: Request) => string }): RequestHandler {
  return (req, res, next) => {
    const now = Date.now();
    const id = `${options.name}:${options.key(req)}`;
    let bucket = buckets.get(id);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(id, bucket);
    }
    bucket.count += 1;

    if (bucket.count > options.limit) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      const minutes = Math.ceil(retryAfter / 60);
      next(new HttpError(429, "RATE_LIMITED", `Too many attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`));
      return;
    }
    next();
  };
}

/** Tests only. */
export function resetRateLimits() {
  buckets.clear();
}

// Expired buckets are dropped every 10 minutes so the map can't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [id, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(id);
}, 10 * 60_000).unref();
