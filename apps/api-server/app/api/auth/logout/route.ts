import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { httpErrors, toErrorResponse } from '@/lib/http/errors';
import { enforceRateLimit } from '@/lib/middleware/rateLimit';
import { getRequestLogger } from '@/lib/observability/logger';
import { invalidateSession, requireSession, SessionNotFoundError } from '@/lib/auth/session';
import { SESSION_COOKIE } from '@/lib/auth/config';

const getClientIp = (request: NextRequest): string | null => {
  return request.headers.get('x-forwarded-for') ?? request.ip ?? null;
};

const clearSessionCookie = (response: NextResponse): void => {
  response.cookies.set({
    name: SESSION_COOKIE.name,
    value: '',
    httpOnly: true,
    sameSite: SESSION_COOKIE.options.sameSite,
    secure: SESSION_COOKIE.options.secure,
    path: SESSION_COOKIE.options.path,
    expires: new Date(0)
  });
};

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const logger = getRequestLogger({
      route: 'auth.logout',
      ip: getClientIp(request) ?? undefined,
      sessionId: request.cookies.get(SESSION_COOKIE.name)?.value
    });

    enforceRateLimit({
      route: 'auth.logout',
      ip: getClientIp(request),
      sessionToken: request.cookies.get(SESSION_COOKIE.name)?.value ?? null
    });

    const active = await requireSession().catch((error) => {
      if (error instanceof SessionNotFoundError) {
        throw httpErrors.unauthorized('No active session');
      }
      throw error;
    });

    await invalidateSession(active.sessionToken);

    const response = new NextResponse(null, { status: 204 });
    response.headers.set('Cache-Control', 'no-store');
    clearSessionCookie(response);

    logger.info({ logout: true }, 'Session terminated');

    return response;
  } catch (error) {
    const normalized = toErrorResponse(error);
    const response = NextResponse.json(normalized.body, { status: normalized.status });
    normalized.headers && Object.entries(normalized.headers).forEach(([key, value]) => response.headers.set(key, value));
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}

export const runtime = 'nodejs';
