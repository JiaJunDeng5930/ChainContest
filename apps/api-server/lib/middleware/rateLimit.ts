import { getEnv } from '@/lib/config/env';
import { httpErrors } from '@/lib/http/errors';

interface BucketState {
  count: number;
  resetAt: number;
}

export interface RateLimitKey {
  sessionToken?: string | null;
  ip?: string | null;
  route?: string;
}

export interface RateLimitOptions {
  limit?: number;
  windowMs?: number;
  now?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number;
  retryAfterMs?: number;
}

const buckets = new Map<string, BucketState>();

const composeKey = ({ sessionToken, ip, route }: RateLimitKey): string => {
  const sessionPart = sessionToken ? `session:${sessionToken}` : 'session:anonymous';
  const ipPart = ip ? `ip:${ip}` : 'ip:unknown';
  const routePart = route ? `route:${route}` : 'route:global';
  return [sessionPart, ipPart, routePart].join('|');
};

const timestamp = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }

  return Date.now();
};

const resolveOptions = (options: RateLimitOptions = {}): Required<RateLimitOptions> => {
  const env = getEnv();
  return {
    limit: options.limit ?? env.rateLimit.maxRequests,
    windowMs: options.windowMs ?? env.rateLimit.windowMs,
    now: options.now ?? timestamp()
  };
};

export const evaluateRateLimit = (key: RateLimitKey, options?: RateLimitOptions): RateLimitResult => {
  const { limit, windowMs, now } = resolveOptions(options);
  const bucketKey = composeKey(key);
  const current = buckets.get(bucketKey);
  const windowStart = now;

  if (!current || current.resetAt <= windowStart) {
    const resetAt = windowStart + windowMs;
    buckets.set(bucketKey, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: Math.max(limit - 1, 0),
      limit,
      resetAt
    };
  }

  if (current.count < limit) {
    current.count += 1;
    return {
      allowed: true,
      remaining: Math.max(limit - current.count, 0),
      limit,
      resetAt: current.resetAt
    };
  }

  const retryAfterMs = Math.max(current.resetAt - now, 0);
  return {
    allowed: false,
    remaining: 0,
    limit,
    resetAt: current.resetAt,
    retryAfterMs
  };
};

export const enforceRateLimit = (key: RateLimitKey, options?: RateLimitOptions): RateLimitResult => {
  const result = evaluateRateLimit(key, options);
  if (!result.allowed) {
    throw httpErrors.rateLimited(result.retryAfterMs ?? 0, 'Too many requests', {
      detail: {
        route: key.route,
        sessionToken: key.sessionToken ? 'present' : 'absent',
        ip: key.ip
      }
    });
  }

  return result;
};

export const resetRateLimiters = (): void => {
  buckets.clear();
};
