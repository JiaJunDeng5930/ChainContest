import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { applyCorsHeaders } from '@/lib/http/cors';

const SESSION_COOKIE_BASE = 'cc_session';
const isProduction = process.env.NODE_ENV === 'production';
const SESSION_COOKIE_NAME = isProduction ? `__Secure-${SESSION_COOKIE_BASE}` : SESSION_COOKIE_BASE;

const RATE_LIMIT_WINDOW_MS = Number.parseInt(process.env.RATE_LIMIT_WINDOW ?? '60000', 10);
const RATE_LIMIT_MAX = Number.parseInt(process.env.RATE_LIMIT_MAX ?? '60', 10);

interface BucketState {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, BucketState>();

const getTimestamp = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }

  return Date.now();
};

const composeKey = (sessionToken: string | null, ip: string | null, route: string): string => {
  const sessionPart = sessionToken ? `session:${sessionToken}` : 'session:anonymous';
  const ipPart = ip ? `ip:${ip}` : 'ip:unknown';
  return `${sessionPart}|${ipPart}|route:${route}`;
};

const evaluateLimit = (sessionToken: string | null, ip: string | null, route: string) => {
  const now = getTimestamp();
  const key = composeKey(sessionToken, ip, route);
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: Math.max(RATE_LIMIT_MAX - 1, 0), resetAt: now + RATE_LIMIT_WINDOW_MS };
  }

  if (bucket.count < RATE_LIMIT_MAX) {
    bucket.count += 1;
    return { allowed: true, remaining: Math.max(RATE_LIMIT_MAX - bucket.count, 0), resetAt: bucket.resetAt };
  }

  return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
};

const buildJsonResponse = (
  request: NextRequest,
  status: number,
  code: string,
  message: string,
  detail?: unknown
): NextResponse => {
  const body = JSON.stringify({ code, message, detail });
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'cache-control': 'no-store'
  };
  const response = new NextResponse(body, { status, headers });
  applyCorsHeaders(response, request);
  return response;
};

const PUBLIC_PATHS = ['/api/auth/siwe/start', '/api/auth/siwe/verify', '/api/health', '/api/runtime/config'];

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  if (request.method === 'OPTIONS') {
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const ip = request.ip ?? request.headers.get('x-forwarded-for') ?? request.headers.get('cf-connecting-ip');

  const rate = evaluateLimit(sessionToken, ip, pathname);
  if (!rate.allowed) {
    const retryAfterMs = Math.max(rate.resetAt - getTimestamp(), 0);
    const retryAfterSeconds = Math.max(Math.ceil(retryAfterMs / 1000), 1);
    const response = buildJsonResponse(request, 429, 'rate_limited', 'Too many requests', { retryAfterMs });
    response.headers.set('retry-after', retryAfterSeconds.toString());
    return response;
  }

  if (!sessionToken) {
    return buildJsonResponse(request, 401, 'unauthorized', 'Authentication required');
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*']
};
