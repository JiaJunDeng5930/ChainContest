/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/require-await */
import type { Logger } from 'pino';
import {
  createContestChainGateway,
  createContestChainError,
  createGatewayValidationContext,
  createRpcClientFactory,
  type ContestChainError,
  type ContestChainGateway,
  type RpcClientFactoryOptions,
} from '@chaincontest/chain';
import { defineChain, type Chain } from 'viem';
import type { ValidationContextOptions } from '@chaincontest/shared-schemas';
import type { AppConfig } from '../config/loadConfig.js';
import { createRpcContestDataProvider } from '../services/rpcContestDataProvider.js';

export interface ContestGatewayFactoryOptions {
  config: AppConfig;
  logger?: Logger;
}

export const createContestGateway = (
  options: ContestGatewayFactoryOptions,
): ContestChainGateway => {
  const { config, logger } = options;

  if (!config.rpc.chains.length) {
    throw new Error('Contest gateway requires at least one configured RPC chain');
  }

  const validationOptions: ValidationContextOptions = {
    registry: config.validation.registry,
    environmentOverrides: config.validation.environmentOverrides,
    environmentId: config.validation.environmentId,
  };

  const validators = createGatewayValidationContext(validationOptions);

  const chains: Record<number, Chain> = {};
  const defaultRpcUrls: Record<number, readonly string[]> = {};

  config.rpc.chains.forEach((entry) => {
    const urls = entry.endpoints
      .filter((endpoint) => endpoint.enabled !== false)
      .sort((left, right) => left.priority - right.priority)
      .map((endpoint) => endpoint.url);

    if (!urls.length) {
      throw new Error(`Chain ${entry.chainId} requires at least one enabled RPC endpoint`);
    }

    defaultRpcUrls[entry.chainId] = urls;
    chains[entry.chainId] = defineChain({
      id: entry.chainId,
      name: entry.label ?? `chain-${entry.chainId}`,
      network: toNetworkSlug(entry.label, entry.chainId),
      nativeCurrency: {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
      },
      rpcUrls: {
        default: { http: urls },
        public: { http: urls },
      },
    });
  });

  const rpcFactoryOptions: RpcClientFactoryOptions = {
    chains,
    defaultRpcUrls,
  };

  const rpcClientFactory = createRpcClientFactory(rpcFactoryOptions);

  const dataProvider = createRpcContestDataProvider({
    config,
    rpcClientFactory,
    logger,
  });

  const signerLocator = () =>
    Promise.reject(
      createContestChainError({
        code: 'AUTHORIZATION_REQUIRED',
        message: 'Signer locator is not configured for indexer contest gateway',
        retryable: false,
      }),
    );

  return createContestChainGateway({
    validators,
    rpcClientFactory,
    signerLocator,
    dataProvider,
    errorLogger: (error: ContestChainError) => {
      logger?.error(
        {
          code: error.code,
          retryable: error.retryable,
          source: error.source,
          detail: error.details,
        },
        error.message,
      );
    },
  });
};

const toNetworkSlug = (label: string | undefined, chainId: number): string => {
  if (!label) {
    return `chain-${chainId}`;
  }
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `chain-${chainId}`;
};
