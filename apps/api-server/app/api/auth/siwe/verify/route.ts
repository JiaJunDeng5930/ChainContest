import { randomBytes } from 'node:crypto';
import type { Adapter, AdapterUser } from '@auth/core/adapters';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { SiweMessage } from 'siwe';
import { z } from 'zod';
import { getEnv } from '@/lib/config/env';
import { getAuthAdapter, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from '@/lib/auth/config';
import { initDatabase } from '@/lib/db/client';
import { httpErrors } from '@/lib/http/errors';
import { enforceRateLimit } from '@/lib/middleware/rateLimit';
import { getRequestLogger } from '@/lib/observability/logger';
import { siweNonceCookie } from '@/app/api/auth/siwe/start/route';

/*
 * The Auth.js adapter surface currently relies on `any`-typed function signatures.
 * We normalise all adapter responses via Zod before use, so we suppress the lint
 * rules that complain about these unavoidable `any` constituents within this file.
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */

const bodySchema = z.object({
  message: z.string().min(1, 'SIWE message is required'),
  signature: z.string().min(1, 'Signature is required')
});

const getClientIp = (request: NextRequest): string | null => {
  return request.headers.get('x-forwarded-for') ?? request.ip ?? null;
};

const createSessionToken = (): string => {
  return randomBytes(48).toString('base64url');
};

const adapterUserSchema = z
  .object({
    id: z.string(),
    name: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    emailVerified: z.coerce.date().nullable().optional()
  })
  .catchall(z.unknown());

const normalizeAdapterUser = (value: AdapterUser | null | undefined): (AdapterUser & { id: string }) | null => {
  if (!value) {
    return null;
  }

  return adapterUserSchema.parse(value) as AdapterUser & { id: string };
};

interface SessionAdapter {
  getUserByEmail(email: string): Promise<AdapterUser | null | undefined>;
  createUser(user: AdapterUser): Promise<AdapterUser | null | undefined>;
  updateUser?(user: AdapterUser): Promise<AdapterUser | null | undefined>;
  createSession(session: { sessionToken: string; userId: string; expires: Date }): Promise<unknown>;
  deleteSession?(token: string): Promise<void>;
}

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-redundant-type-constituents */
const assertSessionAdapter = (adapter: Adapter): SessionAdapter => {
  const createUser = typeof adapter.createUser === 'function' ? adapter.createUser.bind(adapter) : null;
  const getUserByEmail = typeof adapter.getUserByEmail === 'function' ? adapter.getUserByEmail.bind(adapter) : null;
  const updateUser = typeof adapter.updateUser === 'function' ? adapter.updateUser.bind(adapter) : null;
  const createSession = typeof adapter.createSession === 'function' ? adapter.createSession.bind(adapter) : null;
  const deleteSession = typeof adapter.deleteSession === 'function' ? adapter.deleteSession.bind(adapter) : null;

  if (!createUser || !getUserByEmail || !createSession) {
    throw new Error('Auth adapter does not expose required session methods');
  }

  return {
    createUser: createUser as (user: AdapterUser) => Promise<AdapterUser | null | undefined>,
    getUserByEmail: getUserByEmail as (email: string) => Promise<AdapterUser | null | undefined>,
    updateUser: updateUser ? (updateUser as (user: AdapterUser) => Promise<AdapterUser | null | undefined>) : undefined,
    createSession: createSession as (session: { sessionToken: string; userId: string; expires: Date }) => Promise<unknown>,
    deleteSession: deleteSession ? (deleteSession as (token: string) => Promise<void>) : undefined
  };
};

const ensureUser = async (adapter: SessionAdapter, checksumAddress: string, email: string): Promise<AdapterUser> => {
  const existing = normalizeAdapterUser(await adapter.getUserByEmail(email));

  if (existing) {
    if (existing.name !== checksumAddress && adapter.updateUser) {
      const updated = await adapter.updateUser({ ...existing, name: checksumAddress } as AdapterUser);
      return normalizeAdapterUser(updated) ?? existing;
    }
    return existing;
  }

  const created = normalizeAdapterUser(
    await adapter.createUser({
      email,
      name: checksumAddress,
      emailVerified: null
    } as AdapterUser)
  );

  if (!created) {
    throw httpErrors.internal('Failed to create user for SIWE session');
  }

  return created;
};

const establishSession = async (adapter: SessionAdapter, user: AdapterUser, sessionToken: string, expires: Date): Promise<void> => {
  await adapter.createSession({
    sessionToken,
    userId: user.id,
    expires
  });
};

const clearNonceCookie = (response: NextResponse, secure: boolean): void => {
  response.cookies.set({
    name: siweNonceCookie,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    expires: new Date(0)
  });
};

const setSessionCookie = (response: NextResponse, sessionToken: string, expires: Date): void => {
  response.cookies.set({
    name: SESSION_COOKIE.name,
    value: sessionToken,
    httpOnly: true,
    sameSite: SESSION_COOKIE.options.sameSite,
    secure: SESSION_COOKIE.options.secure,
    path: SESSION_COOKIE.options.path,
    expires
  });
};

export async function POST(request: NextRequest): Promise<Response> {
  let adapter: SessionAdapter | null = null;
  let createdSessionToken: string | null = null;

  try {
    const logger = getRequestLogger({ route: 'auth.siwe.verify', ip: getClientIp(request) ?? undefined });
    const sessionCookie = request.cookies.get(SESSION_COOKIE.name)?.value ?? null;

    enforceRateLimit({
      route: 'auth.siwe.verify',
      ip: getClientIp(request),
      sessionToken: sessionCookie
    });

    await initDatabase();
    adapter = assertSessionAdapter(await getAuthAdapter());
    const env = getEnv();
    let expectedDomain: string | undefined;
    if (env.nextAuth.url) {
      try {
        expectedDomain = new URL(env.nextAuth.url).host;
      } catch {
        expectedDomain = undefined;
      }
    }

    const parsedBody = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsedBody.success) {
      throw httpErrors.badRequest('Invalid SIWE verification payload', {
        detail: parsedBody.error.flatten().fieldErrors
      });
    }

    const nonceCookie = request.cookies.get(siweNonceCookie)?.value;
    if (!nonceCookie) {
      throw httpErrors.unauthorized('SIWE nonce missing or expired');
    }

    let siweMessage: SiweMessage;
    try {
      siweMessage = new SiweMessage(parsedBody.data.message);
    } catch {
      throw httpErrors.badRequest('Malformed SIWE message');
    }

    if (siweMessage.nonce !== nonceCookie) {
      throw httpErrors.unauthorized('SIWE nonce mismatch');
    }

    const now = Date.now();
    if (siweMessage.expirationTime && new Date(siweMessage.expirationTime).getTime() <= now) {
      throw httpErrors.unauthorized('SIWE message has expired');
    }
    if (siweMessage.notBefore && new Date(siweMessage.notBefore).getTime() > now) {
      throw httpErrors.unauthorized('SIWE message is not yet valid');
    }

    const verification = await siweMessage.verify({
      signature: parsedBody.data.signature,
      nonce: nonceCookie,
      domain: expectedDomain ?? siweMessage.domain
    });

    if (!verification.success) {
      throw httpErrors.unauthorized('SIWE verification failed');
    }

    const checksumAddress = verification.data.address;
    const walletAddress = checksumAddress.toLowerCase();
    const email = `${walletAddress}@wallet.chaincontest`;

    const user = await ensureUser(adapter, checksumAddress, email);

    const expires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
    const sessionToken = createSessionToken();
    await establishSession(adapter, user, sessionToken, expires);
    createdSessionToken = sessionToken;

    const response = NextResponse.json({
      status: 'ok',
      user: {
        walletAddress,
        addressChecksum: checksumAddress
      }
    });

    response.headers.set('Cache-Control', 'no-store');
    setSessionCookie(response, sessionToken, expires);
    clearNonceCookie(response, env.nodeEnv === 'production');

    logger.info({ verified: true, walletAddress }, 'SIWE verification succeeded');

    return response;
  } catch (error) {
    if (adapter && createdSessionToken && adapter.deleteSession) {
      try {
        await adapter.deleteSession(createdSessionToken);
      } catch {
        // no-op cleanup best effort
      }
    }

    throw error;
  }
}

export const runtime = 'nodejs';
