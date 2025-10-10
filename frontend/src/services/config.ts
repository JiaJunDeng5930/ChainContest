import { z } from "zod";

export class ConfigLoadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ConfigLoadError";
  }
}

export class ConfigValidationError extends Error {
  readonly issues: z.ZodIssue[];

  constructor(message: string, issues: z.ZodIssue[], options?: ErrorOptions) {
    super(message, options);
    this.name = "ConfigValidationError";
    this.issues = issues;
  }
}

const addressPattern = /^0x[a-fA-F0-9]{40}$/;

const envSchema = z.object({
  VITE_RPC_URL: z.string().url().optional(),
  VITE_CHAIN_ID: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.coerce.number().int().positive())
    .optional(),
  VITE_DEV_PORT: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.coerce.number().int().min(1024).max(65535))
    .optional(),
  VITE_DEFAULT_ACCOUNT: z
    .string()
    .transform((value) => value.trim())
    .refine((value) => addressPattern.test(value), {
      message: "defaultAccount must be an EOA address",
    })
    .optional(),
  VITE_CONTRACTS_PATH: z.string().min(1).optional(),
});

const contractDescriptorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  address: z
    .string()
    .transform((value) => value.trim())
    .refine((value) => addressPattern.test(value), {
      message: "address must be 0x-prefixed checksum address",
    }),
  abiPath: z.string().min(1),
  tags: z.array(z.string().min(1)).optional(),
});

const runtimeSchema = z.object({
  rpcUrl: z.string().url(),
  chainId: z.coerce.number().int().positive(),
  devPort: z.coerce
    .number()
    .int()
    .min(1024)
    .max(65535),
  defaultAccount: z
    .string()
    .transform((value) => value.trim())
    .refine((value) => addressPattern.test(value), {
      message: "defaultAccount must be an EOA address",
    })
    .optional(),
  contracts: z.array(contractDescriptorSchema).min(1),
});

export type EnvironmentConfig = z.infer<typeof runtimeSchema>;
export type ContractDescriptor = z.infer<typeof contractDescriptorSchema>;

export interface ConfigLoadOptions {
  signal?: AbortSignal;
  requestConfig?: typeof fetch;
}

export interface ConfigLoadResult {
  config: EnvironmentConfig;
  meta: {
    runtimeIncluded: boolean;
    overrides: Partial<EnvironmentConfig>;
    contractsPath?: string;
  };
}

function readEnvOverrides(): {
  overrides: Partial<EnvironmentConfig>;
  contractsPath?: string;
} {
  const parsed = envSchema.safeParse(import.meta.env);

  if (!parsed.success) {
    throw new ConfigValidationError(
      "Environment variables are invalid",
      parsed.error.issues,
    );
  }

  const {
    VITE_RPC_URL,
    VITE_CHAIN_ID,
    VITE_DEV_PORT,
    VITE_DEFAULT_ACCOUNT,
    VITE_CONTRACTS_PATH,
  } = parsed.data;

  const overrides: Partial<EnvironmentConfig> = {};

  if (VITE_RPC_URL) {
    overrides.rpcUrl = VITE_RPC_URL;
  }

  if (typeof VITE_CHAIN_ID === "number") {
    overrides.chainId = VITE_CHAIN_ID;
  }

  if (typeof VITE_DEV_PORT === "number") {
    overrides.devPort = VITE_DEV_PORT;
  }

  if (VITE_DEFAULT_ACCOUNT) {
    overrides.defaultAccount = VITE_DEFAULT_ACCOUNT;
  }

  return {
    overrides,
    contractsPath: VITE_CONTRACTS_PATH,
  };
}

async function fetchRuntimeConfig(
  request: typeof fetch,
  signal?: AbortSignal,
): Promise<EnvironmentConfig | null> {
  let response: Response;

  try {
    response = await request("/api/runtime/config", { signal });
  } catch (error) {
    throw new ConfigLoadError(
      "Failed to reach /api/runtime/config endpoint",
      error instanceof Error ? { cause: error } : undefined,
    );
  }

  if (response.status === 204) {
    return null;
  }

  if (response.status === 503) {
    throw new ConfigLoadError(
      "Runtime configuration unavailable (503 Service Unavailable)",
    );
  }

  if (!response.ok) {
    throw new ConfigLoadError(
      `Unexpected response while fetching runtime configuration: ${response.status}`,
    );
  }

  let json: unknown;

  try {
    json = await response.json();
  } catch (error) {
    throw new ConfigLoadError(
      "Runtime configuration payload is not valid JSON",
      error instanceof Error ? { cause: error } : undefined,
    );
  }

  const parsed = runtimeSchema.safeParse(json);

  if (!parsed.success) {
    throw new ConfigValidationError(
      "Runtime configuration does not satisfy required schema",
      parsed.error.issues,
    );
  }

  return parsed.data;
}

function validateCombinedConfig(
  merged: EnvironmentConfig,
  overrides: Partial<EnvironmentConfig>,
): EnvironmentConfig {
  const parsed = runtimeSchema.safeParse(merged);

  if (!parsed.success) {
    throw new ConfigValidationError(
      "Merged configuration is invalid",
      parsed.error.issues,
    );
  }

  // Extra guard: ensure overrides do not remove required fields inadvertently.
  if (!parsed.data.contracts.length) {
    throw new ConfigValidationError("contracts list cannot be empty", []);
  }

  if (!parsed.data.rpcUrl) {
    throw new ConfigValidationError("rpcUrl is required", []);
  }

  if (overrides.defaultAccount && !addressPattern.test(overrides.defaultAccount)) {
    throw new ConfigValidationError("defaultAccount override must be address", []);
  }

  return parsed.data;
}

export async function loadEnvironmentConfig(
  options: ConfigLoadOptions = {},
): Promise<ConfigLoadResult> {
  const request = options.requestConfig ?? fetch;
  const { overrides, contractsPath } = readEnvOverrides();
  const runtime = await fetchRuntimeConfig(request, options.signal);

  if (!runtime) {
    throw new ConfigLoadError("Runtime configuration payload is empty");
  }

  const merged: EnvironmentConfig = {
    ...runtime,
    ...overrides,
    contracts: runtime.contracts,
  };

  const config = validateCombinedConfig(merged, overrides);

  return {
    config,
    meta: {
      runtimeIncluded: true,
      overrides,
      contractsPath,
    },
  };
}
