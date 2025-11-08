import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Adapter, AdapterSession, AdapterUser } from '@auth/core/adapters';
import { SiweMessage } from 'siwe';
import { applyTestEnv } from '../utils/env';
import { createRouteRequest, getCookieValue, mergeCookies } from '../utils/request';

const START_PATH = '/api/auth/siwe/start';
const VERIFY_PATH = '/api/auth/siwe/verify';
const LOGOUT_PATH = '/api/auth/logout';

const WALLET_CHECKSUM = '0x0000000000000000000000000000000000000001';
const WALLET_ADDRESS = WALLET_CHECKSUM.toLowerCase();
let activeSessionToken: string | null = null;

interface MockAdapterState {
  users: Map<string, AdapterUser>;
  sessions: Map<string, AdapterSession & { userId: string }>;
}

const createMockAdapter = (state: MockAdapterState): Adapter => {
  let userCounter = 0;

  const getUserByEmail = (email: string | null | undefined): AdapterUser | null => {
    if (!email) {
      return null;
    }

    for (const user of state.users.values()) {
      if (user.email === email) {
        return user;
      }
    }
    return null;
  };

  return {
    createUser: async (user) => {
      userCounter += 1;
      const id = user.id ?? `user-${userCounter}`;
      const created: AdapterUser = {
        id,
        email: user.email,
        emailVerified: user.emailVerified ?? null,
        name: user.name,
        image: user.image ?? null
      };
      state.users.set(id, created);
      return created;
    },
    getUser: async (id) => state.users.get(id) ?? null,
    getUserByEmail: async (email) => getUserByEmail(email),
    getUserByAccount: async () => null,
    updateUser: async (user) => {
      const existing = state.users.get(user.id);
      if (!existing) {
        return null;
      }
      const updated: AdapterUser = {
        ...existing,
        ...user
      };
      state.users.set(updated.id, updated);
      return updated;
    },
    deleteUser: async (id) => {
      state.users.delete(id);
    },
    linkAccount: async () => undefined,
    unlinkAccount: async () => undefined,
    createSession: async (session) => {
      const record: AdapterSession & { userId: string } = {
        ...session,
        userId: session.userId
      };
      state.sessions.set(session.sessionToken, record);
      return record;
    },
    getSessionAndUser: async (sessionToken) => {
      const session = state.sessions.get(sessionToken);
      if (!session) {
        return null;
      }
      const user = state.users.get(session.userId);
      if (!user) {
        return null;
      }
      return { session, user };
    },
    updateSession: async (session) => {
      const existing = state.sessions.get(session.sessionToken);
      if (!existing) {
        return null;
      }
      const updated: AdapterSession & { userId: string } = {
        ...existing,
        ...session
      };
      state.sessions.set(session.sessionToken, updated);
      return updated;
    },
    deleteSession: async (sessionToken) => {
      state.sessions.delete(sessionToken);
    },
    createVerificationToken: async () => {
      throw new Error('Not implemented in mock');
    },
    useVerificationToken: async () => null,
    updateVerificationToken: async () => {
      throw new Error('Not implemented in mock');
    }
  } satisfies Adapter;
};

const buildSiwePayload = (nonce: string) => {
  const issuedAt = new Date();
  const expirationTime = new Date(issuedAt.getTime() + 5 * 60 * 1000);

  const message = new SiweMessage({
    domain: 'app.chaincontest.local',
    address: WALLET_CHECKSUM,
    statement: 'Sign in to ChainContest',
    uri: 'https://app.chaincontest.local',
    version: '1',
    chainId: 1,
    nonce,
    issuedAt: issuedAt.toISOString(),
    expirationTime: expirationTime.toISOString()
  });

  return {
    message,
    prepared: message.prepareMessage(),
    signature: '0xsigned'
  };
};

describe('SIWE 登录与会话管理', () => {
  beforeEach(() => {
    vi.resetModules();
    applyTestEnv();
    vi.doMock('pg', () => {
      class MockPool {
        query = vi.fn().mockResolvedValue({ rows: [] });
        end = vi.fn().mockResolvedValue(undefined);
      }

      return { Pool: MockPool };
    });
    activeSessionToken = null;
  });

  it('完成登录并支持登出', async () => {
    const state: MockAdapterState = {
      users: new Map(),
      sessions: new Map()
    };

    vi.doMock('@auth/pg-adapter', () => ({
      __esModule: true,
      default: () => createMockAdapter(state)
    }));

    vi.doMock('@/lib/db/pool', () => ({
      getPool: () => ({})
    }));
    const ensureUserIdentity = vi.fn().mockResolvedValue({
      id: 'identity-user-1',
      externalId: 'user-1',
      status: 'active'
    });
    const mutateUserWallet = vi.fn().mockResolvedValue({ status: 'applied' });

    vi.doMock('@/lib/db/client', () => ({
      initDatabase: vi.fn(),
      database: {
        ensureUserIdentity,
        mutateUserWallet
      }
    }));

    const actualSession = await vi.importActual<typeof import('@/lib/auth/session')>('@/lib/auth/session');

    vi.doMock('@/lib/auth/session', () => ({
      ...actualSession,
      requireSession: async () => {
        if (!activeSessionToken) {
          throw new actualSession.SessionNotFoundError();
        }
        const record = state.sessions.get(activeSessionToken);
        if (!record) {
          throw new actualSession.SessionNotFoundError();
        }
        const userRecord = state.users.get(record.userId);
        const sessionUser = {
          id: record.userId,
          name: userRecord?.name ?? userRecord?.email ?? '',
          walletAddress: userRecord?.email?.split('@')[0] ?? '',
          addressChecksum: userRecord?.name ?? ''
        };
        return {
          session: {
            user: sessionUser,
            expires: record.expires.toISOString()
          },
          user: sessionUser,
          sessionToken: activeSessionToken,
          needsRefresh: false
        };
      },
      invalidateSession: async () => {
        if (activeSessionToken) {
          state.sessions.delete(activeSessionToken);
          activeSessionToken = null;
        }
      },
      refreshSession: async () => undefined
    }));

    const actualNextAuth = await vi.importActual<typeof import('next-auth')>('next-auth');

    vi.doMock('next-auth', () => ({
      ...actualNextAuth,
      getServerSession: async () => {
        const token = activeSessionToken;
        if (!token) {
          return null;
        }

        const sessionRecord = state.sessions.get(token);
        if (!sessionRecord) {
          return null;
        }

        const userRecord = state.users.get(sessionRecord.userId);

        return {
          user: {
            id: sessionRecord.userId,
            name: userRecord?.name ?? userRecord?.email ?? '',
            walletAddress: userRecord?.email?.split('@')[0] ?? '',
            addressChecksum: userRecord?.name ?? ''
          },
          expires: sessionRecord.expires.toISOString()
        };
      }
    }));

    const { POST: startRoute, siweNonceCookie } = await import('../../app/api/auth/siwe/start/route');
    const { POST: verifyRoute } = await import('../../app/api/auth/siwe/verify/route');
    const { POST: logoutRoute } = await import('../../app/api/auth/logout/route');
    const { SESSION_COOKIE } = await import('../../lib/auth/config');

    const startResponse = await startRoute(
      createRouteRequest(START_PATH, {
        body: {
          address: WALLET_CHECKSUM,
          chainId: 1
        }
      })
    );

    expect(startResponse.status).toBe(200);

    const nonceCookie = getCookieValue(startResponse.headers.get('set-cookie'), siweNonceCookie);
    expect(nonceCookie).toBeDefined();

    const { message, prepared, signature } = buildSiwePayload(nonceCookie!);

    const verifySpy = vi.spyOn(SiweMessage.prototype, 'verify').mockResolvedValue({
      success: true,
      data: {
        address: WALLET_CHECKSUM,
        statement: message.statement,
        uri: message.uri,
        version: message.version,
        chainId: message.chainId,
        nonce: message.nonce,
        issuedAt: message.issuedAt,
        expirationTime: message.expirationTime,
        notBefore: message.notBefore,
        requestId: message.requestId,
        resources: message.resources,
        scheme: message.scheme,
        domain: message.domain
      }
    } as unknown as Awaited<ReturnType<SiweMessage['verify']>>);

    const verifyResponse = await verifyRoute(
      createRouteRequest(VERIFY_PATH, {
        body: {
          message: prepared,
          signature
        },
        cookies: mergeCookies({ [siweNonceCookie]: nonceCookie! })
      })
    );

    verifySpy.mockRestore();

    expect(verifyResponse.status).toBe(200);
    const verifyBody = (await verifyResponse.json()) as {
      status: string;
      user: { walletAddress: string; addressChecksum: string };
    };
    expect(verifyBody.status).toBe('ok');
    expect(verifyBody.user.walletAddress).toBe(WALLET_ADDRESS);
    expect(verifyBody.user.addressChecksum).toBe(WALLET_CHECKSUM);

    const sessionCookieValue = getCookieValue(verifyResponse.headers.get('set-cookie'), SESSION_COOKIE.name);
    expect(sessionCookieValue).toBeDefined();
    activeSessionToken = sessionCookieValue!;

    const logoutResponse = await logoutRoute(
      createRouteRequest(LOGOUT_PATH, {
        cookies: {
          [SESSION_COOKIE.name]: sessionCookieValue!
        }
      })
    );

    expect(logoutResponse.status).toBe(204);
    expect(state.sessions.size).toBe(0);
    activeSessionToken = null;
  });

  it('nonce 不匹配时拒绝请求', async () => {
    const state: MockAdapterState = {
      users: new Map(),
      sessions: new Map()
    };

    vi.doMock('@auth/pg-adapter', () => ({
      __esModule: true,
      default: () => createMockAdapter(state)
    }));

    vi.doMock('@/lib/db/pool', () => ({
      getPool: () => ({})
    }));
    const ensureUserIdentity = vi.fn().mockResolvedValue({
      id: 'identity-user-1',
      externalId: 'user-1',
      status: 'active'
    });
    const mutateUserWallet = vi.fn().mockResolvedValue({ status: 'applied' });

    vi.doMock('@/lib/db/client', () => ({
      initDatabase: vi.fn(),
      database: {
        ensureUserIdentity,
        mutateUserWallet
      }
    }));

    const actualSession2 = await vi.importActual<typeof import('@/lib/auth/session')>('@/lib/auth/session');

    vi.doMock('@/lib/auth/session', () => ({
      ...actualSession2,
      requireSession: async () => {
        if (!activeSessionToken) {
          throw new actualSession2.SessionNotFoundError();
        }
        const record = state.sessions.get(activeSessionToken);
        if (!record) {
          throw new actualSession2.SessionNotFoundError();
        }
        const userRecord = state.users.get(record.userId);
        const sessionUser = {
          id: record.userId,
          name: userRecord?.name ?? '',
          walletAddress: userRecord?.email?.split('@')[0] ?? '',
          addressChecksum: userRecord?.name ?? ''
        };
        return {
          session: {
            user: sessionUser,
            expires: record.expires.toISOString()
          },
          user: sessionUser,
          sessionToken: activeSessionToken,
          needsRefresh: false
        };
      },
      invalidateSession: async () => {
        if (activeSessionToken) {
          state.sessions.delete(activeSessionToken);
          activeSessionToken = null;
        }
      },
      refreshSession: async () => undefined
    }));

    const actualNextAuth2 = await vi.importActual<typeof import('next-auth')>('next-auth');

    vi.doMock('next-auth', () => ({
      ...actualNextAuth2,
      getServerSession: async () => {
        const token = activeSessionToken;
        if (!token) {
          return null;
        }
        const sessionRecord = state.sessions.get(token);
        if (!sessionRecord) {
          return null;
        }

        const userRecord = state.users.get(sessionRecord.userId);
        return {
          user: {
            id: sessionRecord.userId,
            name: userRecord?.name ?? '',
            walletAddress: userRecord?.email?.split('@')[0] ?? '',
            addressChecksum: userRecord?.name ?? ''
          },
          expires: sessionRecord.expires.toISOString()
        };
      }
    }));

    const { siweNonceCookie } = await import('../../app/api/auth/siwe/start/route');
    const { POST: verifyRoute } = await import('../../app/api/auth/siwe/verify/route');

    const { message, prepared, signature } = buildSiwePayload('nonce1234');

    const verifySpy = vi.spyOn(SiweMessage.prototype, 'verify').mockResolvedValue({
      success: true,
      data: {
        address: WALLET_CHECKSUM,
        statement: message.statement,
        uri: message.uri,
        version: message.version,
        chainId: message.chainId,
        nonce: 'nonce1234',
        issuedAt: message.issuedAt,
        expirationTime: message.expirationTime,
        notBefore: message.notBefore,
        requestId: message.requestId,
        resources: message.resources,
        scheme: message.scheme,
        domain: message.domain
      }
    } as unknown as Awaited<ReturnType<SiweMessage['verify']>>);

    const response = await verifyRoute(
      createRouteRequest(VERIFY_PATH, {
        body: {
          message: prepared,
          signature
        },
        cookies: {
          [siweNonceCookie]: 'nonce9999'
        }
      })
    );

    verifySpy.mockRestore();

    expect(response.status).toBe(401);
    const payload = (await response.json()) as { code: string };
    expect(payload.code).toBe('unauthorized');
  });
});
