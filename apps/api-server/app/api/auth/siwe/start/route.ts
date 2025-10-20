import { randomBytes } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getEnv } from '@/lib/config/env';
import { HttpError, toErrorResponse } from '@/lib/http/errors';
import { enforceRateLimit } from '@/lib/middleware/rateLimit';
import { getRequestLogger } from '@/lib/observability/logger';
import { SESSION_COOKIE } from '@/lib/auth/config';

const NONCE_COOKIE = 'cc_siwe_nonce';
const NONCE_TTL_MS = 5 * 60 * 1000;

const requestSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Wallet address must be a valid checksum address'),
  chainId: z.number().int().positive('Chain id must be a positive integer')
});

const getClientIp = (request: NextRequest): string | null => {
  return request.headers.get('x-forwarded-for') ?? request.ip ?? null;
};

const readJsonBody = async (request: NextRequest): Promise<unknown> => {
  try {
    const json: unknown = await request.json();
    return json;
  } catch {
    return null;
  }
};

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const logger = getRequestLogger({ route: 'auth.siwe.start', ip: getClientIp(request) ?? undefined });

    enforceRateLimit({
      route: 'auth.siwe.start',
      ip: getClientIp(request),
      sessionToken: request.cookies.get(SESSION_COOKIE.name)?.value ?? null
    });

    const body = await readJsonBody(request);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError('validation_failed', {
        message: 'Invalid SIWE start payload',
        detail: parsed.error.flatten().fieldErrors,
        status: 400
      });
    }

    const nonce = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + NONCE_TTL_MS);
    const env = getEnv();
    const response = NextResponse.json({ nonce, expiresAt: expiresAt.toISOString() });
    response.cookies.set({
      name: NONCE_COOKIE,
      value: nonce,
      httpOnly: true,
      secure: env.nodeEnv === 'production',
      sameSite: 'lax',
      path: '/',
      expires: expiresAt
    });
    response.headers.set('Cache-Control', 'no-store');

    logger.info(
      {
        nonceIssued: true,
        chainId: parsed.data.chainId,
        address: parsed.data.address
      },
      'Issued SIWE nonce'
    );

    return response;
  } catch (error) {
    const normalized = toErrorResponse(error);
    const response = NextResponse.json(normalized.body, { status: normalized.status });
    normalized.headers && Object.entries(normalized.headers).forEach(([key, value]) => response.headers.set(key, value));
    return response;
  }
}

export const config = {
  runtime: 'nodejs'
};

export const siweNonceCookie = NONCE_COOKIE;
