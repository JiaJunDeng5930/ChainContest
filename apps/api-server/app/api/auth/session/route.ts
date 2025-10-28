import type { AdapterSession, AdapterUser } from '@auth/core/adapters';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { initDatabase } from '@/lib/db/client';
import { SESSION_COOKIE, SESSION_RENEW_THRESHOLD_MS } from '@/lib/auth/config';
import { httpErrors, toErrorResponse } from '@/lib/http/errors';
import { getAuthAdapter } from '@/lib/auth/config';

const applyCorsHeaders = (response: NextResponse, request: NextRequest): void => {
  const origin = request.headers.get('origin');
  if (origin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.append('Vary', 'Origin');
  } else {
    response.headers.set('Access-Control-Allow-Origin', '*');
  }
};

const adaptUser = (user: AdapterUser): { walletAddress: string; addressChecksum: string } => {
  const name = typeof user.name === 'string' ? user.name : null;
  const email = typeof user.email === 'string' ? user.email : null;

  const addressChecksum = name && name.length > 0 ? name : email?.split('@')[0]?.toUpperCase() ?? '';
  if (!addressChecksum) {
    throw httpErrors.internal('Session payload missing checksum');
  }

  const walletAddress = addressChecksum.toLowerCase();
  return { walletAddress, addressChecksum };
};

const normalizeExpires = (session: AdapterSession): Date => {
  const rawExpires = session.expires;
  if (rawExpires instanceof Date) {
    return rawExpires;
  }

  const parsed = new Date(rawExpires as string | number | Date);
  if (Number.isNaN(parsed.getTime())) {
    throw httpErrors.internal('Session payload contained invalid expiry timestamp');
  }

  return parsed;
};

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const sessionToken = request.cookies.get(SESSION_COOKIE.name)?.value;
    if (!sessionToken) {
      throw httpErrors.unauthorized('Authentication required');
    }

    await initDatabase();
    const adapter = await getAuthAdapter();
    const sessionRecord = await adapter.getSessionAndUser?.(sessionToken);
    if (!sessionRecord) {
      throw httpErrors.unauthorized('Authentication required');
    }

    const expiresAt = normalizeExpires(sessionRecord.session);
    const { walletAddress, addressChecksum } = adaptUser(sessionRecord.user);
    const needsRefresh = expiresAt.getTime() - Date.now() <= SESSION_RENEW_THRESHOLD_MS;

    const response = NextResponse.json({
      walletAddress,
      addressChecksum,
      needsRefresh,
      expiresAt: expiresAt.toISOString()
    });
    response.headers.set('Cache-Control', 'no-store');
    applyCorsHeaders(response, request);
    return response;
  } catch (error) {
    const normalized = toErrorResponse(error);
    const response = NextResponse.json(normalized.body, { status: normalized.status });
    normalized.headers && Object.entries(normalized.headers).forEach(([key, value]) => response.headers.set(key, value));
    response.headers.set('Cache-Control', 'no-store');
    applyCorsHeaders(response, request);
    return response;
  }
}

export const runtime = 'nodejs';
