import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().optional(),
  INDEXER_TASKS_LOG_LEVEL: z.string().optional(),
  INDEXER_TASKS_PRETTY_LOGS: z.coerce.boolean().optional(),
  INDEXER_TASKS_ADMIN_TOKEN: z.string().optional(),
  DATABASE_URL: z.string({ required_error: 'DATABASE_URL is required' }),
  PG_BOSS_URL: z.string({ required_error: 'PG_BOSS_URL is required' }),
  TASKS_VALIDATION_REGISTRY_PATH: z.string({
    required_error: 'TASKS_VALIDATION_REGISTRY_PATH is required'
  }),
  TASKS_VALIDATION_OVERRIDES_PATH: z.string({
    required_error: 'TASKS_VALIDATION_OVERRIDES_PATH is required'
  }),
  INDEXER_TASKS_VALIDATION_ENV_ID: z.string().optional(),
  INDEXER_TASKS_PORT: z.coerce
    .number({ invalid_type_error: 'INDEXER_TASKS_PORT must be a number' })
    .int()
    .min(0)
    .max(65535)
    .default(3040),
  INDEXER_TASKS_METRICS_PORT: z.coerce
    .number({ invalid_type_error: 'INDEXER_TASKS_METRICS_PORT must be a number' })
    .int()
    .min(0)
    .max(65535)
    .default(9440),
  INDEXER_TASKS_RPC_FAILURE_THRESHOLD: z.coerce
    .number({ invalid_type_error: 'INDEXER_TASKS_RPC_FAILURE_THRESHOLD must be a number' })
    .int()
    .min(1)
    .default(3),
  INDEXER_TASKS_QUEUE_CONCURRENCY: z.coerce
    .number({ invalid_type_error: 'INDEXER_TASKS_QUEUE_CONCURRENCY must be a number' })
    .int()
    .min(1)
    .default(1),
  INDEXER_TASKS_QUEUE_FETCH_INTERVAL_MS: z.coerce
    .number({ invalid_type_error: 'INDEXER_TASKS_QUEUE_FETCH_INTERVAL_MS must be a number' })
    .int()
    .min(100)
    .default(1_000),
  INDEXER_TASKS_SHUTDOWN_TIMEOUT_MS: z.coerce
    .number({ invalid_type_error: 'INDEXER_TASKS_SHUTDOWN_TIMEOUT_MS must be a number' })
    .int()
    .min(1_000)
    .default(30_000),
  INDEXER_TASKS_DISABLE_NOTIFICATIONS: z.coerce.boolean().optional()
}).superRefine((env, context) => {
  const token = env.INDEXER_TASKS_ADMIN_TOKEN?.trim();
  if (env.NODE_ENV !== 'development' && (!token || token.length === 0)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['INDEXER_TASKS_ADMIN_TOKEN'],
      message: 'INDEXER_TASKS_ADMIN_TOKEN is required when NODE_ENV is not development'
    });
  }
});

const configSchema = envSchema.transform((env) => {
  const adminToken = env.INDEXER_TASKS_ADMIN_TOKEN?.trim();
  const level = env.INDEXER_TASKS_LOG_LEVEL ?? env.LOG_LEVEL ?? 'info';
  const pretty = env.INDEXER_TASKS_PRETTY_LOGS ?? env.NODE_ENV === 'development';

  return {
    env: env.NODE_ENV,
    logging: {
      level,
      pretty
    },
    database: {
      url: env.DATABASE_URL
    },
    queue: {
      url: env.PG_BOSS_URL,
      concurrency: env.INDEXER_TASKS_QUEUE_CONCURRENCY,
      fetchIntervalMs: env.INDEXER_TASKS_QUEUE_FETCH_INTERVAL_MS,
      singletonGroup: 'indexer.tasks'
    },
    http: {
      port: env.INDEXER_TASKS_PORT,
      metricsPort: env.INDEXER_TASKS_METRICS_PORT
    },
    validation: {
      registryPath: env.TASKS_VALIDATION_REGISTRY_PATH,
      overridesPath: env.TASKS_VALIDATION_OVERRIDES_PATH,
      environmentId: env.INDEXER_TASKS_VALIDATION_ENV_ID ?? env.NODE_ENV
    },
    thresholds: {
      rpcFailure: env.INDEXER_TASKS_RPC_FAILURE_THRESHOLD
    },
    timeouts: {
      gracefulShutdownMs: env.INDEXER_TASKS_SHUTDOWN_TIMEOUT_MS
    },
    features: {
      notificationsEnabled: !(env.INDEXER_TASKS_DISABLE_NOTIFICATIONS ?? false)
    },
    auth: {
      adminBearerToken: adminToken && adminToken.length > 0 ? adminToken : null
    }
  } as const;
});

export type TasksConfig = z.infer<typeof configSchema>;

let cachedConfig: TasksConfig | null = null;

const coerceEnv = (overrides: Record<string, string | undefined> = {}): Record<string, string> => {
  const merged = { ...process.env, ...overrides } as Record<string, string | undefined>;
  return Object.entries(merged).reduce<Record<string, string>>((acc, [key, value]) => {
    if (typeof value === 'string') {
      acc[key] = value;
    }
    return acc;
  }, {});
};

export const loadConfig = (overrides: Record<string, string | undefined> = {}): TasksConfig => {
  const parsed = configSchema.parse(coerceEnv(overrides));
  cachedConfig = Object.freeze(parsed);
  return cachedConfig;
};

export const getConfig = (): TasksConfig => {
  if (!cachedConfig) {
    return loadConfig();
  }

  return cachedConfig;
};

export const resetConfig = (): void => {
  cachedConfig = null;
};
