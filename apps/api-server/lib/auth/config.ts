import type { Adapter } from '@auth/core/adapters';
import PostgresAdapter from '@auth/pg-adapter';
import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { SiweMessage } from 'siwe';
import { getEnv } from '@/lib/config/env';
import { getPool } from '@/lib/db/pool';
import { initDatabase } from '@/lib/db/client';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */

const env = getEnv();
const isProduction = env.nodeEnv === 'production';
const SESSION_COOKIE_BASE_NAME = 'cc_session';
const DEFAULT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days
const DEFAULT_SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 6; // 6 hours
const DEFAULT_SESSION_RENEW_THRESHOLD_MS = 1000 * 60 * 15; // 15 minutes

const sessionCookieName = isProduction
  ? `__Secure-${SESSION_COOKIE_BASE_NAME}`
  : SESSION_COOKIE_BASE_NAME;

let resolvedAdapter: Adapter | null = null;
let resolvingAdapter: Promise<Adapter> | null = null;

const resolveAdapter = async (): Promise<Adapter> => {
  if (resolvedAdapter) {
    return resolvedAdapter;
  }

  if (!resolvingAdapter) {
    resolvingAdapter = (async () => {
      await initDatabase();
      const adapter = PostgresAdapter(getPool());
      resolvedAdapter = adapter;
      return adapter;
    })().finally(() => {
      resolvingAdapter = null;
    });
  }

  return resolvingAdapter!;
};

const lazyAdapter = new Proxy<Adapter>({} as Adapter, {
  get(_target, property) {
    if (property === 'displayName') {
      return 'PostgresAdapter';
    }

    return (...args: unknown[]) =>
      resolveAdapter().then((adapter) => {
        const value = (adapter as Record<PropertyKey, unknown>)[property];
        if (typeof value !== 'function') {
          return value;
        }

        return (value as (...params: unknown[]) => unknown).apply(adapter, args);
      });
  }
});

export const getAuthAdapter = (): Adapter => lazyAdapter;

const resolveDomain = (): string | undefined => {
  if (!env.nextAuth.url) {
    return undefined;
  }

  try {
    return new URL(env.nextAuth.url).host;
  } catch {
    return undefined;
  }
};

const credentialsProvider = CredentialsProvider({
  name: 'Sign-In with Ethereum',
  credentials: {
    message: { label: 'Message', type: 'text' },
    signature: { label: 'Signature', type: 'text' },
    nonce: { label: 'Nonce', type: 'text' }
  },
  async authorize(credentials) {
    if (!credentials?.message || !credentials.signature || !credentials.nonce) {
      throw new Error('Missing SIWE parameters');
    }

    let siweMessage: SiweMessage;
    try {
      siweMessage = new SiweMessage(credentials.message);
    } catch (error) {
      throw new Error('Invalid SIWE message');
    }

    const verification = await siweMessage.verify({
      signature: credentials.signature,
      nonce: credentials.nonce,
      domain: resolveDomain()
    });

    if (!verification.success) {
      throw new Error('SIWE verification failed');
    }

    const checksumAddress = verification.data.address;
    const normalizedAddress = checksumAddress.toLowerCase();

    return {
      name: checksumAddress,
      email: `${normalizedAddress}@wallet.chaincontest`,
      walletAddress: normalizedAddress,
      addressChecksum: checksumAddress
    };
  }
});

export const SESSION_COOKIE = {
  name: sessionCookieName,
  options: {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isProduction,
    path: '/'
  }
};

export const SESSION_MAX_AGE_SECONDS = DEFAULT_SESSION_MAX_AGE_SECONDS;
export const SESSION_UPDATE_AGE_SECONDS = DEFAULT_SESSION_UPDATE_AGE_SECONDS;
export const SESSION_RENEW_THRESHOLD_MS = DEFAULT_SESSION_RENEW_THRESHOLD_MS;

const authAdapter = getAuthAdapter();

export const authOptions: NextAuthOptions = {
  adapter: authAdapter,
  secret: env.nextAuth.secret,
  trustHost: true,
  useSecureCookies: isProduction,
  session: {
    strategy: 'database',
    maxAge: SESSION_MAX_AGE_SECONDS,
    updateAge: SESSION_UPDATE_AGE_SECONDS
  },
  cookies: {
    sessionToken: SESSION_COOKIE
  },
  providers: [credentialsProvider],
  callbacks: {
    session({ session, user }) {
      const checksumAddress = (user as { addressChecksum?: string; name?: string }).addressChecksum ?? user?.name ?? '';
      if (!checksumAddress) {
        throw new Error('Session construction failed: wallet address missing');
      }

      const walletAddress = checksumAddress.toLowerCase();
      const userId = 'id' in user ? String(user.id) : walletAddress;

      const previous = session.user ?? {};
      session.user = {
        ...previous,
        id: userId,
        walletAddress,
        addressChecksum: checksumAddress,
        name: checksumAddress
      };

      return session;
    },
    signIn({ user }) {
      if (!user.email && user.name) {
        user.email = `${user.name.toLowerCase()}@wallet.chaincontest`;
      }
      return true;
    }
  }
};
