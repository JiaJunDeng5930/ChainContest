import { z } from 'zod';
import { createPublicClient, erc20Abi, http } from 'viem';
import type { PublicClient } from 'viem';
import { getCreationGateway } from '@/lib/chain/creationGateway';
import { database } from '@/lib/db/client';
import { httpErrors } from '@/lib/http/errors';
import type {
  ContestCreationRequestRecord,
  ContestDeploymentArtifactRecord,
  OrganizerComponentRecord
} from '@chaincontest/db';
import type { ContestCreationReceipt } from '@chaincontest/chain';
import { lowercaseAddress } from '@/lib/runtime/address';
import { logContestDeployment } from '@/lib/observability/logger';
import { getEnv } from '@/lib/config/env';

const bigintSchema = z
  .union([z.string(), z.number(), z.bigint()])
  .transform((value) => (typeof value === 'bigint' ? value : BigInt(value)));

const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/u, { message: 'Invalid address format' })
  .transform((value) => lowercaseAddress(value));

const contestIdSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/u, { message: 'contestId must be bytes32 hex string' })
  .transform((value) => value as `0x${string}`);

const configSchema = z.object({
  entryAsset: addressSchema,
  entryAmount: bigintSchema,
  entryFee: bigintSchema,
  priceSource: addressSchema,
  swapPool: addressSchema,
  priceToleranceBps: z.number().int().nonnegative(),
  settlementWindow: z.number().int().positive(),
  maxParticipants: z.number().int().positive(),
  topK: z.number().int().positive()
});

const timelineSchema = z.object({
  registeringEnds: bigintSchema,
  liveEnds: bigintSchema,
  claimEnds: bigintSchema
});

const payloadSchema = z.object({
  contestId: contestIdSchema,
  vaultComponentId: z.string().uuid(),
  priceSourceComponentId: z.string().uuid(),
  vaultImplementation: addressSchema,
  config: configSchema,
  timeline: timelineSchema,
  initialPrizeAmount: bigintSchema,
  payoutSchedule: z.array(z.number().int().nonnegative()).max(32),
  metadata: z.record(z.string(), z.unknown()).optional()
});

const createChainDescriptor = (networkId: number, rpcUrl: string) => ({
  id: networkId,
  name: `chain-${networkId}`,
  network: `chain-${networkId}`,
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18
  },
  rpcUrls: {
    default: { http: [rpcUrl] },
    public: { http: [rpcUrl] }
  }
} as const);

const createRpcClient = (networkId: number, rpcUrl: string): PublicClient =>
  createPublicClient({
    chain: createChainDescriptor(networkId, rpcUrl),
    transport: http(rpcUrl)
  });

const toIsoString = (value: unknown): string | undefined => {
  if (!value) {
    return undefined;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'number') {
    const millis = Math.abs(value) < 1e12 ? value * 1000 : value;
    const computed = new Date(millis);
    return Number.isNaN(computed.getTime()) ? undefined : computed.toISOString();
  }
  if (typeof value === 'bigint') {
    return new Date(Number(value) * 1000).toISOString();
  }
  if (typeof value === 'string') {
    if (value.length === 0) {
      return undefined;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      const millis = Math.abs(numeric) < 1e12 ? numeric * 1000 : numeric;
      const computed = new Date(millis);
      if (!Number.isNaN(computed.getTime())) {
        return computed.toISOString();
      }
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  }
  return undefined;
};

const secondsToIsoString = (value: bigint | number | string | null | undefined): string | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }
  try {
    const seconds = typeof value === 'bigint' ? value : BigInt(value);
    return new Date(Number(seconds) * 1000).toISOString();
  } catch {
    return undefined;
  }
};

const sanitizeMetadata = (value: Record<string, unknown>): Record<string, unknown> =>
  JSON.parse(JSON.stringify(value));

const resolveTokenMetadata = async (
  client: PublicClient,
  tokenAddress: `0x${string}`
): Promise<{ symbol?: string; decimals?: number }> => {
  try {
    const [symbol, decimals] = await Promise.all([
      client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'symbol' }).catch(() => undefined),
      client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'decimals' }).catch(() => undefined)
    ]);

    return {
      symbol: typeof symbol === 'string' && symbol.length > 0 ? symbol : undefined,
      decimals: typeof decimals === 'number' ? decimals : undefined
    };
  } catch {
    return {};
  }
};

const resolveBlockInfo = async (
  client: PublicClient,
  txHash: `0x${string}`
): Promise<{ blockHash: string; blockNumber: string; timestamp?: string }> => {
  const receipt = await client.getTransactionReceipt({ hash: txHash });
  const block = await client.getBlock({ blockHash: receipt.blockHash });
  return {
    blockHash: receipt.blockHash,
    blockNumber: receipt.blockNumber.toString(),
    timestamp: block.timestamp ? new Date(Number(block.timestamp) * 1000).toISOString() : undefined
  };
};

const buildRuntimeConfigSnapshot = (networkId: number): Record<string, unknown> | undefined => {
  const rpcEnv = getEnv();
  const rpcUrl = rpcEnv.chain.publicRpc ?? rpcEnv.chain.primaryRpc;
  if (!rpcUrl) {
    return undefined;
  }

  let contracts: unknown = undefined;
  if (process.env.RUNTIME_CONTRACTS_JSON) {
    try {
      contracts = JSON.parse(process.env.RUNTIME_CONTRACTS_JSON);
    } catch {
      contracts = undefined;
    }
  }

  if (!Array.isArray(contracts) || contracts.length === 0) {
    return undefined;
  }

  const devPort = process.env.RUNTIME_DEV_PORT ? Number.parseInt(process.env.RUNTIME_DEV_PORT, 10) : undefined;
  if (devPort !== undefined && !Number.isFinite(devPort)) {
    return undefined;
  }

  return {
    rpcUrl,
    chainId: networkId,
    devPort: devPort ?? 43000,
    defaultAccount: process.env.RUNTIME_DEFAULT_ACCOUNT ?? undefined,
    contracts
  } satisfies Record<string, unknown>;
};

interface DomainRegistrationContext {
  request: ContestCreationRequestRecord;
  receipt: ContestCreationReceipt;
  artifact: ContestDeploymentArtifactRecord | null;
  payload: z.infer<typeof payloadSchema>;
  networkId: number;
}

const registerContestInDomain = async (
  context: DomainRegistrationContext
): Promise<{ contestId: string | null; metadata: Record<string, unknown> } | null> => {
  const { artifact, receipt, payload, networkId } = context;

  if (!artifact || !artifact.contestAddress) {
    return null;
  }

  const contestAddress = lowercaseAddress(artifact.contestAddress) as `0x${string}`;
  const vaultFactoryAddress = artifact.vaultFactoryAddress
    ? lowercaseAddress(artifact.vaultFactoryAddress)
    : undefined;

  const rpcEnv = getEnv();
  const rpcUrl = rpcEnv.chain.publicRpc ?? rpcEnv.chain.primaryRpc;
  if (!rpcUrl) {
    throw httpErrors.internal('RPC endpoint is not configured for contest registration', {
      detail: { networkId }
    });
  }

  const client = createRpcClient(networkId, rpcUrl);

  const registrationOpensAt = toIsoString(artifact.confirmedAt?.toISOString() ?? receipt.artifact?.confirmedAt) ?? new Date().toISOString();
  const registrationClosesAt = secondsToIsoString(payload.timeline.registeringEnds);
  if (!registrationClosesAt) {
    throw httpErrors.internal('Contest registration close time missing', {
      detail: { registeringEnds: String(payload.timeline.registeringEnds) }
    });
  }

  const liveEndsAt = secondsToIsoString(payload.timeline.liveEnds);
  const claimEndsAt = secondsToIsoString(payload.timeline.claimEnds);

  const transactionsMetadata = (receipt.artifact?.metadata?.transactions
    ?? (artifact.metadata?.transactions as Record<string, unknown> | undefined)) ?? {};
  const initializationTx = (transactionsMetadata as Record<string, unknown>).initialize as Record<string, unknown> | undefined;

  let blockHash = initializationTx?.blockHash as string | undefined;
  let blockNumber = initializationTx?.blockNumber as string | undefined;
  let derivedTimestamp = toIsoString(initializationTx?.confirmedAt) ?? registrationOpensAt;

  const transactionHash = (receipt.artifact?.transactionHash ?? artifact.transactionHash) as `0x${string}` | null;

  if ((!blockHash || !blockNumber) && transactionHash) {
    try {
      const blockInfo = await resolveBlockInfo(client, transactionHash);
      blockHash = blockInfo.blockHash;
      blockNumber = blockInfo.blockNumber;
      derivedTimestamp = blockInfo.timestamp ?? derivedTimestamp;
    } catch (error) {
      throw httpErrors.internal('Unable to resolve contest deployment block info', {
        detail: { transactionHash, cause: error instanceof Error ? error.message : String(error) }
      });
    }
  }

  if (!blockHash || !blockNumber) {
    throw httpErrors.internal('Contest deployment is missing block metadata', {
      detail: { transactionHash }
    });
  }

  const entryAsset = lowercaseAddress(payload.config.entryAsset) as `0x${string}`;
  const entryAmount = payload.config.entryAmount;
  const entryFee = payload.config.entryFee;
  const requiredAmount = (entryAmount + entryFee).toString();

  const tokenMetadata = await resolveTokenMetadata(client, entryAsset);
  const requirementSymbol = tokenMetadata.symbol ?? 'ETH';
  const requirementDecimals = tokenMetadata.decimals ?? 18;

  const runtimeConfig = buildRuntimeConfigSnapshot(networkId);

  const [vaultComponent, priceSourceComponent] = await Promise.all([
    database.getOrganizerComponent({
      userId: context.request.request.userId,
      componentId: payload.vaultComponentId
    }) as Promise<OrganizerComponentRecord | null>,
    database.getOrganizerComponent({
      userId: context.request.request.userId,
      componentId: payload.priceSourceComponentId
    }) as Promise<OrganizerComponentRecord | null>
  ]);

  const vaultConfig = vaultComponent?.config ?? {};
  const priceSourceConfig = priceSourceComponent?.config ?? {};

  const configuredBaseAsset =
    typeof vaultConfig.baseAsset === 'string' ? (lowercaseAddress(vaultConfig.baseAsset) as `0x${string}`) : entryAsset;
  const configuredQuoteAsset =
    typeof vaultConfig.quoteAsset === 'string' ? (lowercaseAddress(vaultConfig.quoteAsset) as `0x${string}`) : entryAsset;
  const configuredPoolAddress =
    typeof priceSourceConfig.poolAddress === 'string'
      ? (lowercaseAddress(priceSourceConfig.poolAddress) as `0x${string}`)
      : undefined;
  const configuredTwapSeconds = (() => {
    const raw = priceSourceConfig.twapSeconds;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return raw;
    }
    if (typeof raw === 'string' && raw.trim().length > 0) {
      const parsed = Number.parseInt(raw, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  })();

  const rebalanceWhitelist = Array.from(
    new Set<string>([entryAsset, configuredQuoteAsset].map((value) => value.toLowerCase()))
  );

  const rebalanceMetadata = sanitizeMetadata({
    whitelist: rebalanceWhitelist,
    maxTradeAmount: (payload.config.entryAmount * 10n).toString(),
    cooldownSeconds: 0,
    priceFreshnessSeconds: configuredTwapSeconds,
    lastPriceUpdatedAt: derivedTimestamp,
    spender: contestAddress,
    router: contestAddress,
    slippageBps: 100,
    deadlineSeconds: 900,
    rollbackAdvice: 'Rebalance temporarily unavailable. Please retry after refreshing price data.',
    approvals: [] as Array<Record<string, unknown>>,
    defaultRoute: {
      steps: [`${entryAsset.toLowerCase()}->${configuredQuoteAsset.toLowerCase()}`],
      minimumOutput: '0',
      maximumSlippageBps: 100
    },
    baseAsset: configuredBaseAsset,
    quoteAsset: configuredQuoteAsset,
    poolAddress: configuredPoolAddress ?? undefined
  });

  const chainGatewayDefinition = sanitizeMetadata({
    contest: {
      contestId: payload.contestId,
      chainId: networkId,
      gatewayVersion: 'creation-gateway/v1',
      addresses: {
        registrar: contestAddress,
        vaultFactory: vaultFactoryAddress ?? null,
        treasury: artifact.treasuryAddress ? lowercaseAddress(artifact.treasuryAddress) : contestAddress,
        settlement: artifact.settlementAddress ? lowercaseAddress(artifact.settlementAddress) : contestAddress,
        rewards: artifact.rewardsAddress ? lowercaseAddress(artifact.rewardsAddress) : contestAddress
      }
    },
    phase: 'registering',
      timeline: {
        registrationOpensAt,
        registrationClosesAt,
        tradingOpensAt: registrationClosesAt,
        tradingClosesAt: liveEndsAt,
        rewardAvailableAt: claimEndsAt,
        redemptionAvailableAt: claimEndsAt
      },
      prizePool: {
        currentBalance: payload.initialPrizeAmount.toString(),
        accumulatedInflow: payload.initialPrizeAmount.toString()
      },
      rebalance: rebalanceMetadata,
      registrationCapacity: {
        registered: 0,
        maximum: payload.config.maxParticipants,
        isFull: false
      },
    qualificationVerdict: {
      result: 'pass'
    },
    derivedAt: {
      blockNumber,
      blockHash,
      timestamp: derivedTimestamp
    },
    registration: {
      window: {
        opensAt: registrationOpensAt,
        closesAt: registrationClosesAt
      },
      requirement: {
        tokenAddress: entryAsset,
        amount: requiredAmount,
        spender: contestAddress,
        symbol: requirementSymbol,
        decimals: requirementDecimals,
        reason: 'contest-entry'
      },
      template: {
        call: {
          to: contestAddress,
          data: '0x1aa3a008',
          value: '0'
        },
        estimatedFees: {
          currency: 'ETH',
          estimatedCost: '0'
        }
      },
      approvals: [
        {
          tokenAddress: entryAsset,
          spender: contestAddress,
          amount: requiredAmount,
          symbol: requirementSymbol,
          decimals: requirementDecimals,
          reason: 'contest-entry'
        }
      ]
    },
    participants: {},
    events: { events: [] }
  });

  const metadata = sanitizeMetadata({
    runtimeConfig: runtimeConfig ?? undefined,
    prizePool: {
      currentBalance: payload.initialPrizeAmount.toString(),
      accumulatedInflow: payload.initialPrizeAmount.toString()
    },
    rebalance: rebalanceMetadata,
    registrationCapacity: {
      registered: 0,
      maximum: payload.config.maxParticipants,
      isFull: false
    },
    derivedAt: {
      blockNumber,
      blockHash,
      timestamp: derivedTimestamp
    },
    timeline: {
      registrationOpensAt,
      registrationClosesAt
    },
    chainGatewayDefinition
  });

  const trackResult = (await database.writeContestDomain({
    action: 'track',
    payload: {
      chainId: networkId,
      contractAddress: contestAddress,
      internalKey: payload.contestId,
      status: 'registered',
      timeWindow: {
        start: registrationOpensAt,
        end: claimEndsAt ?? registrationClosesAt
      },
      metadata
    }
  })) as { status: 'applied' | 'noop'; contestId?: string };

  const contestId = trackResult.contestId ?? null;

  return { contestId, metadata };
};

const lookupContestId = async (
  contestInternalKey: string,
  contractAddress: string,
  _networkId: number
): Promise<string | null> => {
  const response = (await database.queryContests({
    selector: {
      items: [
        { internalId: contestInternalKey },
        { contestId: contestInternalKey },
        { contractAddress }
      ]
    },
    includes: undefined,
    pagination: {
      pageSize: 1,
      cursor: null
    }
  })) as { items?: Array<{ contest?: { contestId?: string } }> };

  const aggregate = response.items?.[0];
  return aggregate?.contest?.contestId ?? null;
};

export interface ContestDeploymentServiceInput {
  userId: string;
  organizerAddress: string;
  networkId: number;
  payload: unknown;
}

export interface ContestDeploymentServiceResult {
  request: ContestCreationRequestRecord;
  artifact: ContestDeploymentArtifactRecord | null;
  receipt: ContestCreationReceipt;
}

const toSerializablePayload = (
  payload: z.infer<typeof payloadSchema>
): Record<string, unknown> => ({
  contestId: payload.contestId,
  vaultComponentId: payload.vaultComponentId,
  priceSourceComponentId: payload.priceSourceComponentId,
  vaultImplementation: lowercaseAddress(payload.vaultImplementation),
  config: {
    ...payload.config,
    entryAsset: lowercaseAddress(payload.config.entryAsset),
    priceSource: lowercaseAddress(payload.config.priceSource),
    swapPool: lowercaseAddress(payload.config.swapPool),
    entryAmount: payload.config.entryAmount.toString(),
    entryFee: payload.config.entryFee.toString()
  },
  timeline: {
    registeringEnds: payload.timeline.registeringEnds.toString(),
    liveEnds: payload.timeline.liveEnds.toString(),
    claimEnds: payload.timeline.claimEnds.toString()
  },
  initialPrizeAmount: payload.initialPrizeAmount.toString(),
  payoutSchedule: payload.payoutSchedule,
  metadata: payload.metadata ?? {}
});

const toContestPayload = async (
  userId: string,
  organizerAddress: string,
  networkId: number,
  payload: z.infer<typeof payloadSchema>
) => {
  const [vaultComponent, priceSourceComponent] = (await Promise.all([
    database.getOrganizerComponent({ userId, componentId: payload.vaultComponentId }),
    database.getOrganizerComponent({ userId, componentId: payload.priceSourceComponentId })
  ])) as [OrganizerComponentRecord | null, OrganizerComponentRecord | null];

  if (!vaultComponent) {
    throw httpErrors.notFound('Vault component not found', {
      detail: { componentId: payload.vaultComponentId }
    });
  }

  if (!priceSourceComponent) {
    throw httpErrors.notFound('PriceSource component not found', {
      detail: { componentId: payload.priceSourceComponentId }
    });
  }

  if (vaultComponent.componentType !== 'vault_implementation') {
    throw httpErrors.conflict('Selected component is not a vault implementation', {
      detail: { componentId: vaultComponent.id, componentType: vaultComponent.componentType }
    });
  }

  if (priceSourceComponent.componentType !== 'price_source') {
    throw httpErrors.conflict('Selected component is not a price source', {
      detail: { componentId: priceSourceComponent.id, componentType: priceSourceComponent.componentType }
    });
  }

  if (vaultComponent.networkId !== networkId || priceSourceComponent.networkId !== networkId) {
    throw httpErrors.conflict('Component network mismatch', {
      detail: {
        networkId,
        vaultComponentNetwork: vaultComponent.networkId,
        priceSourceComponentNetwork: priceSourceComponent.networkId
      }
    });
  }

  if (vaultComponent.status !== 'confirmed' || priceSourceComponent.status !== 'confirmed') {
    throw httpErrors.conflict('Components must be confirmed before deployment');
  }

  const vaultContractAddress = lowercaseAddress(vaultComponent.contractAddress) as `0x${string}`;
  const priceSourceContractAddress = lowercaseAddress(priceSourceComponent.contractAddress) as `0x${string}`;

  const requestedVaultImplementation = lowercaseAddress(payload.vaultImplementation);
  if (requestedVaultImplementation !== vaultContractAddress) {
    throw httpErrors.conflict('Vault implementation address must match selected component', {
      detail: {
        provided: requestedVaultImplementation,
        expected: vaultContractAddress,
        componentId: payload.vaultComponentId
      }
    });
  }

  const requestedPriceSource = lowercaseAddress(payload.config.priceSource);
  if (requestedPriceSource !== priceSourceContractAddress) {
    throw httpErrors.conflict('Price source address must match selected component', {
      detail: {
        provided: requestedPriceSource,
        expected: priceSourceContractAddress,
        componentId: payload.priceSourceComponentId
      }
    });
  }

  const toComponentReference = (
    component: typeof vaultComponent,
    componentId: string
  ) => ({
    componentId,
    owner: organizerAddress as `0x${string}`,
    walletAddress: (component.walletAddress
      ? lowercaseAddress(component.walletAddress)
      : organizerAddress) as `0x${string}`,
    contractAddress: lowercaseAddress(component.contractAddress) as `0x${string}`,
    configHash: component.configHash
  });

  return {
    contestId: payload.contestId,
    owner: organizerAddress as `0x${string}`,
    vaultImplementation: vaultContractAddress,
    vaultComponent: toComponentReference(vaultComponent, payload.vaultComponentId),
    priceSourceComponent: toComponentReference(priceSourceComponent, payload.priceSourceComponentId),
    config: {
      ...payload.config,
      entryAsset: lowercaseAddress(payload.config.entryAsset) as `0x${string}`,
      priceSource: priceSourceContractAddress,
      swapPool: lowercaseAddress(payload.config.swapPool) as `0x${string}`
    },
    timeline: payload.timeline,
    initialPrizeAmount: payload.initialPrizeAmount,
    payoutSchedule: payload.payoutSchedule,
    metadata: payload.metadata ?? {}
  };
};

export const deployContest = async (
  input: ContestDeploymentServiceInput
): Promise<ContestDeploymentServiceResult> => {
  const startedAt = Date.now();
  const parsedPayload = payloadSchema.safeParse(input.payload);
  if (!parsedPayload.success) {
    throw httpErrors.badRequest('Invalid contest deployment payload', {
      detail: parsedPayload.error.flatten().fieldErrors
    });
  }

  const organizerAddress = lowercaseAddress(input.organizerAddress);
  const chainPayload = await toContestPayload(input.userId, organizerAddress, input.networkId, parsedPayload.data);

  const storedPayload = toSerializablePayload(parsedPayload.data);

  const creation = (await database.createContestCreationRequest({
    userId: input.userId,
    networkId: input.networkId,
    payload: storedPayload,
    vaultComponentId: parsedPayload.data.vaultComponentId,
    priceSourceComponentId: parsedPayload.data.priceSourceComponentId,
    status: 'deploying'
  })) as ContestCreationRequestRecord;

  const gateway = getCreationGateway();

  try {
    const receipt = await gateway.executeContestDeployment({
      organizer: organizerAddress as `0x${string}`,
      networkId: input.networkId,
      payload: chainPayload
    });

    let artifactRecord: ContestDeploymentArtifactRecord | null = null;

    if (receipt.artifact) {
      const artifactMetadata = {
        ...(receipt.artifact.metadata ?? {}),
        contestBytes32: parsedPayload.data.contestId
      };

      artifactRecord = (await database.recordContestDeploymentArtifact({
        requestId: creation.request.requestId,
        contestId: null,
        networkId: receipt.artifact.networkId,
        contestAddress: receipt.artifact.contestAddress,
        vaultFactoryAddress: receipt.artifact.vaultFactoryAddress,
        registrarAddress: receipt.artifact.registrarAddress,
        treasuryAddress: receipt.artifact.treasuryAddress,
        settlementAddress: receipt.artifact.settlementAddress,
        rewardsAddress: receipt.artifact.rewardsAddress,
        transactionHash: receipt.artifact.transactionHash ?? null,
        confirmedAt: receipt.artifact.confirmedAt ? new Date(receipt.artifact.confirmedAt) : null,
        metadata: artifactMetadata
      })) as ContestDeploymentArtifactRecord;
    }

    const persistedStatus = (() => {
      switch (receipt.status) {
        case 'confirmed':
          return 'confirmed';
        case 'failed':
          return 'failed';
        case 'noop':
          return 'accepted';
        case 'accepted':
          return 'accepted';
        case 'deploying':
        default:
          return 'deploying';
      }
    })();

    if (persistedStatus === 'failed') {
      throw httpErrors.conflict('Contest deployment did not complete successfully', {
        detail: {
          status: receipt.status,
          reason: receipt.reason ?? null
        }
      });
    }

    const updated = (await database.updateContestCreationRequestStatus({
      requestId: creation.request.requestId,
      status: persistedStatus,
      transactionHash: receipt.artifact?.transactionHash ?? null,
      confirmedAt: receipt.artifact?.confirmedAt ? new Date(receipt.artifact.confirmedAt) : null,
      failureReason: null
    })) as ContestCreationRequestRecord;

    const domainRegistration = await registerContestInDomain({
      request: updated,
      receipt,
      artifact: artifactRecord,
      payload: parsedPayload.data,
      networkId: input.networkId
    });

    let resolvedContestId = domainRegistration?.contestId ?? null;
    let updatedArtifactRecord = artifactRecord;

    if (!resolvedContestId && artifactRecord?.contestAddress) {
      resolvedContestId = await lookupContestId(parsedPayload.data.contestId, artifactRecord.contestAddress, input.networkId);
    }

    if (resolvedContestId && artifactRecord) {
      updatedArtifactRecord = (await database.recordContestDeploymentArtifact({
        requestId: creation.request.requestId,
        contestId: resolvedContestId,
        networkId: artifactRecord.networkId,
        contestAddress: artifactRecord.contestAddress,
        vaultFactoryAddress: artifactRecord.vaultFactoryAddress,
        registrarAddress: artifactRecord.registrarAddress,
        treasuryAddress: artifactRecord.treasuryAddress,
        settlementAddress: artifactRecord.settlementAddress,
        rewardsAddress: artifactRecord.rewardsAddress,
        transactionHash: artifactRecord.transactionHash,
        confirmedAt: artifactRecord.confirmedAt,
        metadata: artifactRecord.metadata
      })) as ContestDeploymentArtifactRecord;
    }

    const logStatus: 'pending' | 'confirmed' =
      persistedStatus === 'confirmed' ? 'confirmed' : 'pending';

    logContestDeployment({
      status: logStatus,
      networkId: input.networkId,
      organizer: organizerAddress,
      requestId: creation.request.requestId,
      contestId: parsedPayload.data.contestId,
      vaultComponentId: parsedPayload.data.vaultComponentId,
      priceSourceComponentId: parsedPayload.data.priceSourceComponentId,
      contestAddress: updatedArtifactRecord?.contestAddress ?? null,
      vaultFactoryAddress: updatedArtifactRecord?.vaultFactoryAddress ?? null,
      transactionHash: receipt.artifact?.transactionHash ?? null,
      durationMs: Date.now() - startedAt,
      metadata: {
        receiptMetadata: receipt.metadata ?? {},
        ingestion: updatedArtifactRecord?.metadata ?? {},
        domainRegistration
      },
      failureReason: null
    });

    return {
      request: updated,
      artifact: updatedArtifactRecord ?? updated.artifact,
      receipt
    };
  } catch (error) {
    await database.updateContestCreationRequestStatus({
      requestId: creation.request.requestId,
      status: 'failed',
      failureReason: {
        message: error instanceof Error ? error.message : 'Contest deployment failed'
      },
      transactionHash: null,
      confirmedAt: null
    });

    logContestDeployment(
      {
        status: 'failed',
        networkId: input.networkId,
        organizer: organizerAddress,
        requestId: creation.request.requestId,
        contestId: parsedPayload.data.contestId,
        vaultComponentId: parsedPayload.data.vaultComponentId,
        priceSourceComponentId: parsedPayload.data.priceSourceComponentId,
        transactionHash: null,
        durationMs: Date.now() - startedAt,
        metadata: {
          payload: storedPayload,
          error: error instanceof Error ? { message: error.message } : { message: String(error) }
        },
        failureReason: {
          message: error instanceof Error ? error.message : 'Contest deployment failed'
        }
      },
      error
    );
    throw error;
  }
};
