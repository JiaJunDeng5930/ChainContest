import { getAddress, JsonRpcProvider } from "ethers";

import type { EnvironmentConfig } from "../lib/types";

export class ProviderConnectionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProviderConnectionError";
  }
}

export class ProviderAccountError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProviderAccountError";
  }
}

export class ProviderChainMismatchError extends Error {
  readonly expected: number;
  readonly received: number;

  constructor(expected: number, received: number) {
    super(
      `Connected RPC network chainId ${received} does not match expected ${expected}`,
    );
    this.name = "ProviderChainMismatchError";
    this.expected = expected;
    this.received = received;
  }
}

export interface ProviderFactoryOptions {
  skipAccountCheck?: boolean;
}

async function verifyChain(
  provider: JsonRpcProvider,
  expectedChainId: number,
): Promise<void> {
  try {
    const network = await provider.getNetwork();
    const received = Number(network.chainId);

    if (Number.isNaN(received)) {
      throw new ProviderConnectionError("Unable to derive provider chainId");
    }

    if (received !== expectedChainId) {
      throw new ProviderChainMismatchError(expectedChainId, received);
    }
  } catch (error) {
    if (error instanceof ProviderChainMismatchError) {
      throw error;
    }

    throw new ProviderConnectionError(
      "Failed to read chain information from provider",
      error instanceof Error ? { cause: error } : undefined,
    );
  }
}

async function listAccounts(provider: JsonRpcProvider): Promise<string[]> {
  const normalized = new Set<string>();

  try {
    const accounts = await provider.send<string[]>("eth_accounts", []);

    accounts
      .filter((account) => typeof account === "string")
      .map((account) => {
        try {
          return getAddress(account);
        } catch {
          return null;
        }
      })
      .filter((account): account is string => Boolean(account))
      .forEach((account) => normalized.add(account));
  } catch (error) {
    // Ignore method-not-found errors and fall back to personal_listAccounts.
    const message =
      error instanceof Error ? error.message : "Failed calling eth_accounts";

    if (!/method not found/i.test(message)) {
      throw new ProviderConnectionError(
        "Unexpected failure while calling eth_accounts",
        error instanceof Error ? { cause: error } : undefined,
      );
    }
  }

  if (normalized.size > 0) {
    return Array.from(normalized);
  }

  try {
    const accounts = await provider.send<string[]>(
      "personal_listAccounts",
      [],
    );

    accounts
      .filter((account) => typeof account === "string")
      .map((account) => {
        try {
          return getAddress(account);
        } catch {
          return null;
        }
      })
      .filter((account): account is string => Boolean(account))
      .forEach((account) => normalized.add(account));
  } catch (error) {
    throw new ProviderConnectionError(
      "Unable to verify unlocked accounts via personal_listAccounts",
      error instanceof Error ? { cause: error } : undefined,
    );
  }

  return Array.from(normalized);
}

export async function createRpcProvider(
  config: Pick<EnvironmentConfig, "rpcUrl" | "chainId">,
  options: ProviderFactoryOptions = {},
): Promise<JsonRpcProvider> {
  let provider: JsonRpcProvider;

  try {
    provider = new JsonRpcProvider(config.rpcUrl, undefined, {
      staticNetwork: true,
    });
  } catch (error) {
    throw new ProviderConnectionError(
      "Failed to initialise JSON-RPC provider",
      error instanceof Error ? { cause: error } : undefined,
    );
  }

  await verifyChain(provider, config.chainId);

  if (options.skipAccountCheck) {
    return provider;
  }

  const accounts = await listAccounts(provider);

  if (accounts.length === 0) {
    throw new ProviderAccountError(
      "RPC node exposes no unlocked accounts; unlock an account before continuing",
    );
  }

  return provider;
}
