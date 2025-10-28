import type { AdapterSession } from '@auth/core/adapters';
import { cookies } from 'next/headers';
import { getServerSession } from 'next-auth';
import type { Session } from 'next-auth';
import { authOptions, getAuthAdapter, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, SESSION_RENEW_THRESHOLD_MS } from '@/lib/auth/config';
import { getRequestLogger } from '@/lib/observability/logger';

/* eslint-disable @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

export class SessionNotFoundError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'SessionNotFoundError';
  }
}

export class SessionIntegrityError extends Error {
  constructor(message = 'Session payload corrupted') {
    super(message);
    this.name = 'SessionIntegrityError';
  }
}

export class SessionTokenMissingError extends Error {
  constructor(message = 'Session token missing') {
    super(message);
    this.name = 'SessionTokenMissingError';
  }
}

export interface ActiveSession {
  session: Session;
  user: Session['user'];
  sessionToken: string | null;
  needsRefresh: boolean;
}

const readSessionToken = (): string | null => {
  return cookies().get(SESSION_COOKIE.name)?.value ?? null;
};

const clearSessionCookie = (): void => {
  const store = cookies();
  const cookie = store.get(SESSION_COOKIE.name);
  if (cookie) {
    store.delete(SESSION_COOKIE.name);
  }
};

const ensureUserShape = (session: Session): Session['user'] => {
  if (!session.user) {
    throw new SessionIntegrityError('Session missing principal payload');
  }

  const { id, walletAddress, addressChecksum } = session.user as Record<string, unknown>;
  if (typeof id !== 'string' || typeof walletAddress !== 'string' || typeof addressChecksum !== 'string') {
    throw new SessionIntegrityError('Session user is not hydrated');
  }

  return session.user;
};

export const getActiveSession = async (): Promise<ActiveSession | null> => {
  const session = await getServerSession(authOptions);
  if (!session) {
    return null;
  }

  const user = ensureUserShape(session);
  const sessionToken = readSessionToken();
  const expiresAt = new Date(session.expires);
  const needsRefresh = expiresAt.getTime() - Date.now() <= SESSION_RENEW_THRESHOLD_MS;

  return {
    session,
    user,
    sessionToken,
    needsRefresh
  };
};

export const requireSession = async (): Promise<ActiveSession> => {
  const active = await getActiveSession();
  if (!active) {
    clearSessionCookie();
    throw new SessionNotFoundError();
  }

  return active;
};

type UpdateSessionFn = (params: { sessionToken: string; expires: Date }) => Promise<AdapterSession | null | undefined>;
type DeleteSessionFn = (sessionToken: string) => Promise<void>;

const getUpdateSession = async (): Promise<UpdateSessionFn> => {
  const adapter = await getAuthAdapter();
  const updateSession = adapter.updateSession;
  if (typeof updateSession !== 'function') {
    throw new Error('Configured auth adapter does not expose session update operations');
  }

  return (params) => Promise.resolve(updateSession.call(adapter, params));
};

const getDeleteSession = async (): Promise<DeleteSessionFn> => {
  const adapter = await getAuthAdapter();
  const deleteSession = adapter.deleteSession;
  if (typeof deleteSession !== 'function') {
    throw new Error('Configured auth adapter does not expose session deletion operations');
  }

  return (sessionToken) => Promise.resolve(deleteSession.call(adapter, sessionToken)).then(() => undefined);
};

export const refreshSession = async (token?: string | null): Promise<void> => {
  const sessionToken = token ?? readSessionToken();
  if (!sessionToken) {
    throw new SessionTokenMissingError();
  }

  const expires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  const updateSession = await getUpdateSession();
  await updateSession({ sessionToken, expires });
  const logger = getRequestLogger({ route: 'auth.session', sessionId: sessionToken });
  logger.info({ refreshed: true }, 'Session refreshed');
};

export const invalidateSession = async (token?: string | null): Promise<void> => {
  const sessionToken = token ?? readSessionToken();
  if (!sessionToken) {
    clearSessionCookie();
    const logger = getRequestLogger({ route: 'auth.session' });
    logger.info({ invalidated: true, reason: 'missing_token' }, 'Cleared session cookie');
    return;
  }

  const deleteSession = await getDeleteSession();
  await deleteSession(sessionToken);
  clearSessionCookie();
  const logger = getRequestLogger({ route: 'auth.session', sessionId: sessionToken });
  logger.info({ invalidated: true }, 'Session invalidated');
};

export interface SessionContext {
  session: Session;
  user: Session['user'];
  sessionToken: string | null;
  refresh(): Promise<void>;
  invalidate(): Promise<void>;
}

export const withSession = async <T>(handler: (context: SessionContext) => Promise<T>): Promise<T> => {
  const active = await requireSession();
  const context: SessionContext = {
    session: active.session,
    user: active.user,
    sessionToken: active.sessionToken,
    refresh: () => refreshSession(active.sessionToken),
    invalidate: () => invalidateSession(active.sessionToken)
  };

  return handler(context);
};

export const ensureFreshSession = async (): Promise<ActiveSession> => {
  const active = await requireSession();
  if (!active.needsRefresh) {
    return active;
  }

  const logger = getRequestLogger({ route: 'auth.session', sessionId: active.sessionToken ?? undefined });

  try {
    await refreshSession(active.sessionToken);
    logger.info({ autoRefresh: true }, 'Session auto-refreshed');
    return {
      ...active,
      needsRefresh: false
    };
  } catch (error) {
    logger.warn({ refreshFailed: true, error: error instanceof Error ? error.message : error }, 'Session refresh failed');
    await invalidateSession(active.sessionToken);
    throw new SessionNotFoundError('Session refresh failed');
  }
};
