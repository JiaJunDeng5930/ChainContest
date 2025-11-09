import { z } from 'zod';
import { getEnv } from '@/lib/config/env';
import { database, initDatabase } from '@/lib/db/client';
import { httpErrors } from '@/lib/http/errors';

const contractSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  abiPath: z.string().min(1),
  tags: z.array(z.string().min(1)).optional()
});

const runtimeConfigSchema = z.object({
  rpcUrl: z.string().url(),
  chainId: z.coerce.number().int().positive(),
  devPort: z.coerce.number().int().min(1024).max(65535),
  defaultAccount: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
  contracts: z.array(contractSchema).min(1)
});

const resolveNumberOverride = (value, name) => {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw httpErrors.internal('Invalid numeric override for runtime configuration', {
      detail: { field: name, value }
    });
  }

  return parsed;
};

const buildOverrides = () => {
  const env = getEnv();
  const overrides = {};

  const publicRpc = env.chain.publicRpc ?? env.chain.primaryRpc;
  if (publicRpc) {
    overrides.rpcUrl = publicRpc;
  }

  const envChainId = resolveNumberOverride(process.env.RUNTIME_CHAIN_ID, 'RUNTIME_CHAIN_ID');
  if (typeof envChainId === 'number') {
    overrides.chainId = envChainId;
  }

  const envDevPort = resolveNumberOverride(process.env.RUNTIME_DEV_PORT, 'RUNTIME_DEV_PORT');
  if (typeof envDevPort === 'number') {
    overrides.devPort = envDevPort;
  }

  if (process.env.RUNTIME_DEFAULT_ACCOUNT) {
    overrides.defaultAccount = process.env.RUNTIME_DEFAULT_ACCOUNT;
  }

  if (process.env.RUNTIME_CONTRACTS_JSON) {
    try {
      const parsed = JSON.parse(process.env.RUNTIME_CONTRACTS_JSON);
      overrides.contracts = runtimeConfigSchema.shape.contracts.parse(parsed);
    } catch (error) {
      throw httpErrors.internal('Failed to parse RUNTIME_CONTRACTS_JSON', {
        cause: error instanceof Error ? error : undefined
      });
    }
  }

  return overrides;
};

const normaliseRuntimeConfig = (raw) => {
  try {
    return runtimeConfigSchema.parse(raw);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw httpErrors.internal('Runtime configuration payload invalid', {
        detail: error.issues
      });
    }
    throw error;
  }
};

const ANY_STATUS_FILTER = ['registered', 'active', 'sealed', 'settled'];

const fetchRuntimeConfigFromDatabase = async () => {
  await initDatabase();

  const response = await database.queryContests({
    selector: {
      filter: {
        statuses: [...ANY_STATUS_FILTER]
      }
    },
    includes: undefined,
    pagination: {
      pageSize: 1,
      cursor: null
    }
  });

  for (const aggregate of response.items ?? []) {
    const metadata = aggregate.contest?.metadata ?? {};
    const candidate = metadata.runtimeConfig ?? metadata.runtime ?? null;
    if (!candidate) {
      continue;
    }

    try {
      return normaliseRuntimeConfig(candidate);
    } catch {
      continue;
    }
  }

  return null;
};

export const loadRuntimeConfig = async () => {
  const overrides = buildOverrides();
  const base = await fetchRuntimeConfigFromDatabase();

  if (base) {
    const merged = {
      ...base,
      ...overrides,
      contracts: overrides.contracts ?? base.contracts
    };

    return normaliseRuntimeConfig(merged);
  }

  const fallbackContracts = overrides.contracts;
  if (!fallbackContracts) {
    return null;
  }

  const env = getEnv();
  const rpcUrl = overrides.rpcUrl ?? env.chain.publicRpc ?? env.chain.primaryRpc;
  const chainId = overrides.chainId;
  const devPort = overrides.devPort;

  if (!rpcUrl || chainId === undefined || devPort === undefined) {
    return null;
  }

  const fallback = {
    rpcUrl,
    chainId,
    devPort,
    defaultAccount: overrides.defaultAccount,
    contracts: fallbackContracts
  };

  return normaliseRuntimeConfig(fallback);
};
