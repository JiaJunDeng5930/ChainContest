import { z } from 'zod';

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  NEXTAUTH_SECRET: z.string().min(16, 'NEXTAUTH_SECRET must be at least 16 characters'),
  NEXTAUTH_URL: z.string().url().optional(),
  PG_BOSS_SCHEMA: z.string().min(1, 'PG_BOSS_SCHEMA is required').default('boss'),
  CHAIN_RPC_PRIMARY: z.string().url('CHAIN_RPC_PRIMARY must be a valid URL'),
  CHAIN_RPC_FALLBACK: z.string().url().optional(),
  RATE_LIMIT_WINDOW: z.coerce
    .number({ invalid_type_error: 'RATE_LIMIT_WINDOW must be a number' })
    .int('RATE_LIMIT_WINDOW must be an integer')
    .positive('RATE_LIMIT_WINDOW must be greater than zero')
    .default(60_000),
  RATE_LIMIT_MAX: z.coerce
    .number({ invalid_type_error: 'RATE_LIMIT_MAX must be a number' })
    .int('RATE_LIMIT_MAX must be an integer')
    .positive('RATE_LIMIT_MAX must be greater than zero')
    .default(60),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .optional()
    .default('info'),
  CHAIN_RPC_PUBLIC_URL: z.string().url().optional()
});

export type RawEnv = z.infer<typeof rawEnvSchema>;

export interface AppEnv {
  readonly nodeEnv: RawEnv['NODE_ENV'];
  readonly databaseUrl: string;
  readonly nextAuth: {
    readonly secret: string;
    readonly url?: string;
  };
  readonly queue: {
    readonly schema: string;
  };
  readonly chain: {
    readonly primaryRpc: string;
    readonly fallbackRpc?: string;
    readonly publicRpc?: string;
  };
  readonly rateLimit: {
    readonly windowMs: number;
    readonly maxRequests: number;
  };
  readonly logging: {
    readonly level: RawEnv['LOG_LEVEL'];
  };
}

let cachedEnv: AppEnv | null = null;

const normaliseEnv = (raw: RawEnv): AppEnv => ({
  nodeEnv: raw.NODE_ENV,
  databaseUrl: raw.DATABASE_URL,
  nextAuth: {
    secret: raw.NEXTAUTH_SECRET,
    url: raw.NEXTAUTH_URL
  },
  queue: {
    schema: raw.PG_BOSS_SCHEMA
  },
  chain: {
    primaryRpc: raw.CHAIN_RPC_PRIMARY,
    fallbackRpc: raw.CHAIN_RPC_FALLBACK,
    publicRpc: raw.CHAIN_RPC_PUBLIC_URL
  },
  rateLimit: {
    windowMs: raw.RATE_LIMIT_WINDOW,
    maxRequests: raw.RATE_LIMIT_MAX
  },
  logging: {
    level: raw.LOG_LEVEL ?? 'info'
  }
});

const formatErrors = (issues: z.ZodIssue[]): string =>
  issues
    .map((issue) => {
      const path = issue.path.join('.') || 'root';
      return `${path}: ${issue.message}`;
    })
    .join('; ');

export const loadEnv = (input: NodeJS.ProcessEnv = process.env): AppEnv => {
  const parsed = rawEnvSchema.safeParse({
    NODE_ENV: input.NODE_ENV,
    DATABASE_URL: input.DATABASE_URL,
    NEXTAUTH_SECRET: input.NEXTAUTH_SECRET,
    NEXTAUTH_URL: input.NEXTAUTH_URL,
    PG_BOSS_SCHEMA: input.PG_BOSS_SCHEMA,
    CHAIN_RPC_PRIMARY: input.CHAIN_RPC_PRIMARY,
    CHAIN_RPC_FALLBACK: input.CHAIN_RPC_FALLBACK,
    RATE_LIMIT_WINDOW: input.RATE_LIMIT_WINDOW,
    RATE_LIMIT_MAX: input.RATE_LIMIT_MAX,
    LOG_LEVEL: input.LOG_LEVEL,
    CHAIN_RPC_PUBLIC_URL: input.CHAIN_RPC_PUBLIC_URL
  });

  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${formatErrors(parsed.error.issues)}`);
  }

  return normaliseEnv(parsed.data);
};

export const getEnv = (): AppEnv => {
  if (!cachedEnv) {
    cachedEnv = loadEnv();
  }
  return cachedEnv;
};

export const resetEnvCache = (): void => {
  cachedEnv = null;
};

export const isProduction = (): boolean => getEnv().nodeEnv === 'production';
