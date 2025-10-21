import fs from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import type { ValidationContextOptions } from '@chaincontest/shared-schemas';
import { z } from 'zod';

export interface RpcEndpointConfig {
  id: string;
  url: string;
  priority: number;
  enabled: boolean;
  weight?: number;
  maxConsecutiveFailures?: number;
  cooldownMs?: number;
}

export interface ChainRpcConfig {
  chainId: number;
  label?: string;
  endpoints: RpcEndpointConfig[];
}

export interface ValidationConfig extends ValidationContextOptions {
  registryPath?: string;
  overridesPath?: string;
}

export interface AppConfig {
  environment: string;
  service: {
    port: number;
    pollIntervalMs: number;
    maxBatchSize: number;
  };
  registry: {
    refreshIntervalMs: number;
    sourcePath?: string;
  };
  database: {
    url: string;
  };
  queue: {
    url: string;
  };
  rpc: {
    failureThreshold: number;
    cooldownMs: number;
    chains: ChainRpcConfig[];
  };
  validation: ValidationConfig;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const endpointSchema = z
  .object({
    id: z.string().min(1, 'endpoint.id is required'),
    url: z.string().min(1, 'endpoint.url is required'),
    priority: z.number().int().min(0),
    enabled: z.boolean().optional().default(true),
    weight: z.number().positive().optional(),
    maxConsecutiveFailures: z.number().int().min(1).optional(),
    cooldownMs: z.number().int().min(0).optional(),
  })
  .transform((endpoint) => ({
    ...endpoint,
    enabled: endpoint.enabled ?? true,
  }));

const chainSchema = z.object({
  chainId: z.number().int().nonnegative(),
  label: z.string().optional(),
  endpoints: z.array(endpointSchema).min(1, 'each chain requires at least one endpoint'),
});

const rpcConfigSchema = z.array(chainSchema).min(1, 'INDEXER_EVENT_RPCS requires at least one chain');

const envSchema = z.object({
  NODE_ENV: z.string().optional().default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  PG_BOSS_URL: z.string().optional(),
  INDEXER_EVENT_RPCS: z.string().min(1, 'INDEXER_EVENT_RPCS is required'),
  INDEXER_EVENT_POLL_INTERVAL_MS: z.coerce.number().int().min(500).default(6000),
  INDEXER_EVENT_MAX_BATCH: z.coerce.number().int().min(1).default(200),
  INDEXER_EVENT_PORT: z.coerce.number().int().min(0).max(65535).default(4005),
  INDEXER_EVENT_RPC_FAILURE_THRESHOLD: z.coerce.number().int().min(1).default(3),
  INDEXER_EVENT_RPC_COOLDOWN_MS: z.coerce.number().int().min(1000).default(60_000),
  INDEXER_EVENT_REGISTRY_REFRESH_MS: z.coerce.number().int().min(1_000).default(60_000),
  INDEXER_EVENT_REGISTRY_PATH: z.string().optional(),
  INDEXER_EVENT_VALIDATION_REGISTRY_PATH: z.string().optional(),
  INDEXER_EVENT_VALIDATION_OVERRIDES_PATH: z.string().optional(),
  INDEXER_EVENT_VALIDATION_ENV_ID: z.string().optional(),
});

interface LoadConfigOptions {
  forceReload?: boolean;
  overrides?: Record<string, string | undefined>;
}

let cachedConfig: AppConfig | null = null;
let cacheKey: string | null = null;

export const loadConfig = (options: LoadConfigOptions = {}): AppConfig => {
  const { forceReload = false, overrides = {} } = options;
  const fingerprint = JSON.stringify(overrides);

  if (!forceReload && cachedConfig && cacheKey === fingerprint) {
    return cachedConfig;
  }

  primeEnvironment();

  const mergedEnv: Record<string, string | undefined> = { ...process.env, ...overrides };
  const parsedEnv = envSchema.safeParse(mergedEnv);

  if (!parsedEnv.success) {
    const formatted = parsedEnv.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('\n');
    throw new ConfigError(`Invalid environment configuration:\n${formatted}`);
  }

  const envConfig = parsedEnv.data;

  const rpcChains = parseRpcConfig(envConfig.INDEXER_EVENT_RPCS);
  const queueUrl = envConfig.PG_BOSS_URL?.trim() || envConfig.DATABASE_URL.trim();
  const validation = loadValidationConfig(envConfig);

  const config: AppConfig = {
    environment: envConfig.NODE_ENV,
    service: {
      port: envConfig.INDEXER_EVENT_PORT,
      pollIntervalMs: envConfig.INDEXER_EVENT_POLL_INTERVAL_MS,
      maxBatchSize: envConfig.INDEXER_EVENT_MAX_BATCH,
    },
    registry: {
      refreshIntervalMs: envConfig.INDEXER_EVENT_REGISTRY_REFRESH_MS,
      sourcePath: envConfig.INDEXER_EVENT_REGISTRY_PATH?.trim() || undefined,
    },
    database: {
      url: envConfig.DATABASE_URL.trim(),
    },
    queue: {
      url: queueUrl,
    },
    rpc: {
      failureThreshold: envConfig.INDEXER_EVENT_RPC_FAILURE_THRESHOLD,
      cooldownMs: envConfig.INDEXER_EVENT_RPC_COOLDOWN_MS,
      chains: rpcChains,
    },
    validation,
  };

  if (!forceReload) {
    cachedConfig = config;
    cacheKey = fingerprint;
  }

  return config;
};

const primeEnvironment = (): void => {
  const searchPaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'apps/indexer/event/.env'),
  ];

  searchPaths
    .filter((envPath) => fs.existsSync(envPath))
    .forEach((envPath) => {
      loadEnv({ path: envPath, override: true });
    });
};

const parseRpcConfig = (raw: string): ChainRpcConfig[] => {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(raw);
  } catch (error) {
    throw new ConfigError('INDEXER_EVENT_RPCS must be valid JSON');
  }

  const result = rpcConfigSchema.safeParse(parsedJson);
  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'rpc'}: ${issue.message}`)
      .join('\n');
    throw new ConfigError(`Invalid RPC configuration:\n${formatted}`);
  }

  return result.data.map((chain) => ({
    chainId: chain.chainId,
    label: chain.label,
    endpoints: chain.endpoints.map((endpoint) => ({
      id: endpoint.id,
      url: endpoint.url,
      priority: endpoint.priority,
      enabled: endpoint.enabled,
      weight: endpoint.weight,
      maxConsecutiveFailures: endpoint.maxConsecutiveFailures,
      cooldownMs: endpoint.cooldownMs,
    })),
  }));
};

const loadValidationConfig = (envConfig: z.infer<typeof envSchema>): ValidationConfig => {
  const registryPath = envConfig.INDEXER_EVENT_VALIDATION_REGISTRY_PATH?.trim();
  const overridesPath = envConfig.INDEXER_EVENT_VALIDATION_OVERRIDES_PATH?.trim();
  const registry = registryPath ? readJsonFile(registryPath, 'validation registry') : [];
  const overrides = overridesPath
    ? readJsonFile(overridesPath, 'validation overrides')
    : undefined;

  const validationOptions: ValidationConfig = {
    registry,
    environmentOverrides: overrides,
    environmentId: envConfig.INDEXER_EVENT_VALIDATION_ENV_ID?.trim() || envConfig.NODE_ENV,
  };

  if (registryPath) {
    validationOptions.registryPath = resolveAbsolutePath(registryPath);
  }
  if (overridesPath) {
    validationOptions.overridesPath = resolveAbsolutePath(overridesPath);
  }

  return validationOptions;
};

const readJsonFile = (inputPath: string, description: string): unknown => {
  const filePath = resolveAbsolutePath(inputPath);

  if (!fs.existsSync(filePath)) {
    throw new ConfigError(`Unable to locate ${description} at ${filePath}`);
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    throw new ConfigError(`Failed to parse ${description} at ${filePath}: ${(error as Error).message}`);
  }
};

const resolveAbsolutePath = (inputPath: string): string =>
  path.isAbsolute(inputPath) ? inputPath : path.resolve(process.cwd(), inputPath);

export const resetConfigCache = (): void => {
  cachedConfig = null;
  cacheKey = null;
};
