import { createPublicClient, erc20Abi, http, type PublicClient } from 'viem';
import type {
  ContestDefinition,
  ContestIdentifier,
  ContestParticipantProfile,
  ContestRebalanceConfig,
  ContestSettlementConfig,
  ContestRewardConfigEntry,
  ContestRedemptionConfigEntry,
  ContestEventEnvelopeShape
} from '@chaincontest/chain';
import type { ParticipantRecord } from '@chaincontest/db';
import { httpErrors } from '@/lib/http/errors';
import { database, initDatabase } from '@/lib/db/client';
import { getEnv } from '@/lib/config/env';

type UnknownRecord = Record<string, unknown>;
type Address = `0x${string}`;
type HexString = `0x${string}`;

interface ContestAggregateRow {
  readonly contest?: {
    readonly contestId?: string;
    readonly chainId: number;
    readonly metadata?: unknown;
  };
  readonly participants?: readonly ParticipantRecord[];
}

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const HEX_PATTERN = /^0x[0-9a-fA-F]+$/;

const ensureObject = (value: unknown, context: string): UnknownRecord => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as UnknownRecord;
  }
  throw httpErrors.internal('Contest metadata malformed', {
    detail: { field: context, value }
  });
};

const ensureString = (value: unknown, context: string): string => {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  throw httpErrors.internal('Contest metadata missing string value', {
    detail: { field: context, value }
  });
};

const ensureOptionalString = (value: unknown, context: string): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  return ensureString(value, context);
};

const ensureAddress = (value: unknown, context: string): Address => {
  const address = ensureString(value, context);
  if (!ADDRESS_PATTERN.test(address)) {
    throw httpErrors.internal('Contest metadata contains invalid address', {
      detail: { field: context, value: address }
    });
  }
  return address.toLowerCase() as Address;
};

const ensureHex = (value: unknown, context: string): HexString | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  const hex = ensureString(value, context);
  if (!HEX_PATTERN.test(hex)) {
    throw httpErrors.internal('Contest metadata contains invalid hex value', {
      detail: { field: context, value: hex }
    });
  }
  return hex.toLowerCase() as HexString;
};

const ensureBoolean = (value: unknown, context: string): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }
  throw httpErrors.internal('Contest metadata missing boolean value', {
    detail: { field: context, value }
  });
};

const toBigInt = (value: unknown, context: string): bigint => {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(value);
  }
  if (typeof value === 'string' && value.length > 0) {
    try {
      const normalized = value.trim();
      if (normalized.length === 0) {
        throw new Error('Empty string');
      }
      return BigInt(normalized);
    } catch (error) {
      throw httpErrors.internal('Contest metadata numeric field invalid', {
        detail: { field: context, value },
        cause: error instanceof Error ? error : undefined
      });
    }
  }
  throw httpErrors.internal('Contest metadata numeric field missing', {
    detail: { field: context, value }
  });
};

const toNumber = (value: unknown, context: string): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'bigint') {
    const converted = Number(value);
    if (!Number.isFinite(converted)) {
      throw httpErrors.internal('Contest metadata numeric value exceeds range', {
        detail: { field: context, value: value.toString() }
      });
    }
    return converted;
  }
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  throw httpErrors.internal('Contest metadata numeric field missing', {
    detail: { field: context, value }
  });
};

const parseStringRecord = (raw: unknown, context: string): Record<string, string> => {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const source = raw as UnknownRecord;
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    const normalizedKey = key.toLowerCase();
    output[normalizedKey] = ensureString(value, `${context}.${key}`);
  }
  return output;
};

const parseContestIdentifier = (
  raw: UnknownRecord | undefined,
  fallback: { contestId: string; chainId: number }
): ContestIdentifier => {
  const source = raw ?? {};
  const addressesRaw = ensureObject(source.addresses ?? {}, 'contest.addresses');
  const addresses = Object.fromEntries(
    Object.entries(addressesRaw).map(([key, value]) => [key, ensureAddress(value, `contest.addresses.${key}`)])
  ) as ContestIdentifier['addresses'];

  return Object.freeze({
    contestId: ensureString(source.contestId ?? fallback.contestId, 'contest.contestId'),
    chainId: toNumber(source.chainId ?? fallback.chainId, 'contest.chainId'),
    gatewayVersion: ensureOptionalString(source.gatewayVersion, 'contest.gatewayVersion'),
    addresses
  });
};

const parseTimeline = (raw: unknown): ContestDefinition['timeline'] => {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const timeline = raw as UnknownRecord;
  const output: ContestDefinition['timeline'] = {};
  for (const [key, value] of Object.entries(timeline)) {
    if (value === undefined || value === null) {
      continue;
    }
    output[key as keyof ContestDefinition['timeline']] = ensureString(value, `timeline.${key}`);
  }
  return output;
};

const parsePrizePool = (raw: unknown): ContestDefinition['prizePool'] => {
  const source = ensureObject(raw, 'prizePool');
  const pool: ContestDefinition['prizePool'] = {
    currentBalance: ensureString(source.currentBalance, 'prizePool.currentBalance'),
    accumulatedInflow: ensureString(source.accumulatedInflow ?? source.totalInflow ?? '0', 'prizePool.accumulatedInflow')
  };

  if (source.valuationAnchor) {
    const anchor = ensureObject(source.valuationAnchor, 'prizePool.valuationAnchor');
    pool.valuationAnchor = {
      price: ensureString(anchor.price, 'prizePool.valuationAnchor.price'),
      currency: ensureString(anchor.currency, 'prizePool.valuationAnchor.currency'),
      observedAt: ensureString(anchor.observedAt, 'prizePool.valuationAnchor.observedAt'),
      source: ensureOptionalString(anchor.source, 'prizePool.valuationAnchor.source')
    };
  }

  return pool;
};

const parseRegistrationCapacity = (raw: unknown): ContestDefinition['registrationCapacity'] => {
  const source = ensureObject(raw, 'registrationCapacity');
  return {
    registered: toNumber(source.registered, 'registrationCapacity.registered'),
    maximum: toNumber(source.maximum, 'registrationCapacity.maximum'),
    isFull: ensureBoolean(source.isFull, 'registrationCapacity.isFull')
  };
};

const parseBlockAnchor = (raw: unknown, context: string): ContestDefinition['derivedAt'] => {
  const source = ensureObject(raw, context);
  const blockHash = ensureHex(source.blockHash, `${context}.blockHash`);
  if (!blockHash) {
    throw httpErrors.internal('Contest metadata missing block hash', {
      detail: { field: `${context}.blockHash`, value: source.blockHash }
    });
  }
  return {
    blockNumber: toBigInt(source.blockNumber, `${context}.blockNumber`),
    blockHash,
    timestamp: ensureOptionalString(source.timestamp, `${context}.timestamp`)
  };
};

const parseQualificationVerdict = (raw: unknown): ContestDefinition['qualificationVerdict'] => {
  const source = ensureObject(raw, 'qualificationVerdict');
  const verdict = ensureString(source.result ?? source.status, 'qualificationVerdict.result');
  return {
    result: verdict as ContestDefinition['qualificationVerdict']['result'],
    reason: ensureOptionalString(source.reason, 'qualificationVerdict.reason'),
    ruleIds: Array.isArray(source.ruleIds) ? source.ruleIds.map(String) : undefined
  };
};

const parseRegistrationRequirement = (
  raw: unknown
): ContestDefinition['registration']['requirement'] => {
  const source = ensureObject(raw, 'registration.requirement');
  return {
    tokenAddress: ensureAddress(source.tokenAddress, 'registration.requirement.tokenAddress'),
    amount: ensureString(source.amount, 'registration.requirement.amount'),
    spender: ensureAddress(source.spender, 'registration.requirement.spender'),
    symbol: ensureOptionalString(source.symbol, 'registration.requirement.symbol'),
    decimals: source.decimals === undefined ? undefined : toNumber(source.decimals, 'registration.requirement.decimals'),
    reason: ensureOptionalString(source.reason, 'registration.requirement.reason')
  };
};

const parseExecutionCall = (raw: unknown, context: string): ContestDefinition['registration']['template']['call'] => {
  const source = ensureObject(raw, context);
  const call = {
    to: ensureAddress(source.to, `${context}.to`),
    data: ensureHex(source.data ?? '0x', `${context}.data`) ?? '0x',
    value: source.value === undefined ? undefined : toBigInt(source.value, `${context}.value`),
    gasLimit: source.gasLimit === undefined ? undefined : toBigInt(source.gasLimit, `${context}.gasLimit`),
    maxFeePerGas: source.maxFeePerGas === undefined ? undefined : toBigInt(source.maxFeePerGas, `${context}.maxFeePerGas`),
    maxPriorityFeePerGas:
      source.maxPriorityFeePerGas === undefined
        ? undefined
        : toBigInt(source.maxPriorityFeePerGas, `${context}.maxPriorityFeePerGas`),
    deadline: ensureOptionalString(source.deadline, `${context}.deadline`)
  };

  return call;
};

const parsePlanRejectionReason = (raw: unknown, context: string): ContestSettlementConfig['rejectionReason'] => {
  if (raw === undefined || raw === null) {
    return undefined;
  }

  const source = ensureObject(raw, context);
  return {
    code: ensureString(source.code ?? 'unknown_reason', `${context}.code`),
    message: ensureString(source.message ?? 'Contest operation rejected', `${context}.message`),
    detail: source.detail ? ensureObject(source.detail, `${context}.detail`) : undefined
  };
};

const parsePayoutDescriptor = (raw: unknown, context: string): ContestRewardConfigEntry['payout'] => {
  if (raw === undefined || raw === null) {
    return undefined;
  }

  const source = ensureObject(raw, context);
  return {
    amount: ensureString(source.amount, `${context}.amount`),
    currency: ensureString(source.currency, `${context}.currency`),
    tokenAddress: source.tokenAddress ? ensureAddress(source.tokenAddress, `${context}.tokenAddress`) : undefined,
    destination: ensureAddress(source.destination, `${context}.destination`)
  };
};

const parseRouteDescriptor = (raw: unknown, context: string): ContestRebalanceConfig['defaultRoute'] => {
  if (raw === undefined || raw === null) {
    return undefined;
  }

  const source = ensureObject(raw, context);
  const steps = Array.isArray(source.steps)
    ? source.steps.map((step, index) => ensureString(step, `${context}.steps[${index}]`))
    : (() => {
        throw httpErrors.internal('Contest metadata route missing steps', {
          detail: { field: `${context}.steps`, value: source.steps }
        });
      })();

  return {
    steps,
    minimumOutput: ensureOptionalString(source.minimumOutput, `${context}.minimumOutput`),
    maximumSlippageBps:
      source.maximumSlippageBps === undefined
        ? undefined
        : toNumber(source.maximumSlippageBps, `${context}.maximumSlippageBps`),
    expiresAt: ensureOptionalString(source.expiresAt, `${context}.expiresAt`),
    metadata: source.metadata ? ensureObject(source.metadata, `${context}.metadata`) : undefined
  };
};

const parseEstimatedFees = (raw: unknown): ContestDefinition['registration']['template']['estimatedFees'] | undefined => {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const source = raw as UnknownRecord;
  return {
    currency: ensureString(source.currency, 'estimatedFees.currency'),
    estimatedCost: ensureString(source.estimatedCost, 'estimatedFees.estimatedCost'),
    gasPrice: ensureOptionalString(source.gasPrice, 'estimatedFees.gasPrice'),
    maxFeePerGas: ensureOptionalString(source.maxFeePerGas, 'estimatedFees.maxFeePerGas'),
    maxPriorityFeePerGas: ensureOptionalString(source.maxPriorityFeePerGas, 'estimatedFees.maxPriorityFeePerGas')
  };
};

const parseRegistrationTemplate = (raw: unknown): ContestDefinition['registration']['template'] => {
  const source = ensureObject(raw, 'registration.template');
  return {
    call: parseExecutionCall(source.call, 'registration.template.call'),
    estimatedFees: parseEstimatedFees(source.estimatedFees)
  };
};

const parseRegistrationApprovals = (raw: unknown): ContestDefinition['registration']['approvals'] => {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  return raw.map((entry, index) => {
    const source = ensureObject(entry, `registration.approvals[${index}]`);
    return {
      tokenAddress: ensureAddress(source.tokenAddress, `registration.approvals[${index}].tokenAddress`),
      spender: ensureAddress(source.spender, `registration.approvals[${index}].spender`),
      amount: ensureString(source.amount, `registration.approvals[${index}].amount`),
      symbol: ensureOptionalString(source.symbol, `registration.approvals[${index}].symbol`),
      decimals: source.decimals === undefined ? undefined : toNumber(source.decimals, `registration.approvals[${index}].decimals`),
      reason: ensureOptionalString(source.reason, `registration.approvals[${index}].reason`)
    };
  });
};

const parseRegistrationWindow = (
  raw: unknown
): ContestDefinition['registration']['window'] => {
  const source = ensureObject(raw, 'registration.window');
  return {
    opensAt: ensureString(source.opensAt, 'registration.window.opensAt'),
    closesAt: ensureString(source.closesAt, 'registration.window.closesAt')
  };
};

const parseRegistration = (raw: unknown): ContestDefinition['registration'] => {
  const source = ensureObject(raw, 'registration');
  return {
    window: parseRegistrationWindow(source.window),
    requirement: parseRegistrationRequirement(source.requirement),
    template: parseRegistrationTemplate(source.template),
    approvals: parseRegistrationApprovals(source.approvals)
  };
};

const parseRebalanceConfig = (raw: unknown): ContestRebalanceConfig | undefined => {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }

  const source = raw as UnknownRecord;
  const approvalsRaw = Array.isArray(source.approvals) ? source.approvals : [];

  return {
    whitelist: Array.isArray(source.whitelist)
      ? source.whitelist.map((value, index) => ensureAddress(value, `rebalance.whitelist[${index}]`))
      : [],
    maxTradeAmount: ensureString(source.maxTradeAmount ?? '0', 'rebalance.maxTradeAmount'),
    cooldownSeconds: toNumber(source.cooldownSeconds ?? 0, 'rebalance.cooldownSeconds'),
    priceFreshnessSeconds: toNumber(source.priceFreshnessSeconds ?? 0, 'rebalance.priceFreshnessSeconds'),
    lastPriceUpdatedAt: ensureString(source.lastPriceUpdatedAt ?? new Date().toISOString(), 'rebalance.lastPriceUpdatedAt'),
    spender: ensureAddress(source.spender, 'rebalance.spender'),
    router: ensureAddress(source.router, 'rebalance.router'),
    slippageBps: toNumber(source.slippageBps ?? 0, 'rebalance.slippageBps'),
    deadlineSeconds: toNumber(source.deadlineSeconds ?? 0, 'rebalance.deadlineSeconds'),
    rollbackAdvice: ensureOptionalString(source.rollbackAdvice, 'rebalance.rollbackAdvice'),
    approvals: approvalsRaw.map((entry, index) => {
      const approval = ensureObject(entry, `rebalance.approvals[${index}]`);
      return {
        tokenAddress: ensureAddress(approval.tokenAddress, `rebalance.approvals[${index}].tokenAddress`),
        spender: ensureAddress(approval.spender, `rebalance.approvals[${index}].spender`),
        amount: ensureString(approval.amount, `rebalance.approvals[${index}].amount`),
        decimals: approval.decimals === undefined ? undefined : toNumber(approval.decimals, `rebalance.approvals[${index}].decimals`),
        symbol: ensureOptionalString(approval.symbol, `rebalance.approvals[${index}].symbol`),
        reason: ensureOptionalString(approval.reason, `rebalance.approvals[${index}].reason`)
      };
    }),
    defaultRoute: parseRouteDescriptor(source.defaultRoute, 'rebalance.defaultRoute')
  };
};

const parseSettlementConfig = (raw: unknown): ContestSettlementConfig | undefined => {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const source = raw as UnknownRecord;
  return {
    ready: Boolean(source.ready ?? source.status === 'ready'),
    executed: Boolean(source.executed ?? source.status === 'applied'),
    settlementCall: source.settlementCall ? parseExecutionCall(source.settlementCall, 'settlement.settlementCall') : undefined,
    rejectionReason: parsePlanRejectionReason(source.rejectionReason, 'settlement.rejectionReason'),
    frozenAt: parseBlockAnchor(source.frozenAt ?? source.derivedAt ?? source.anchor ?? {}, 'settlement.frozenAt'),
    leaderboardVersion: ensureString(source.leaderboardVersion ?? source.version ?? '0', 'settlement.leaderboardVersion'),
    snapshotHash: ensureOptionalString(source.snapshotHash, 'settlement.snapshotHash'),
    operator: source.operator ? ensureAddress(source.operator, 'settlement.operator') : undefined,
    detail: source.detail ? ensureObject(source.detail, 'settlement.detail') : undefined
  } satisfies ContestSettlementConfig;
};

const parseRewardEntries = (raw: unknown): ContestDefinition['rewards'] => {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const source = raw as UnknownRecord;
  const output: Record<string, ContestRewardConfigEntry> = {};
  for (const [key, value] of Object.entries(source)) {
    const entry = ensureObject(value, `rewards.${key}`);
    output[key.toLowerCase()] = {
      status: ensureString(entry.status ?? 'eligible', `rewards.${key}.status`) as ContestRewardConfigEntry['status'],
      payout: parsePayoutDescriptor(entry.payout, `rewards.${key}.payout`),
      claimCall: entry.claimCall ? parseExecutionCall(entry.claimCall, `rewards.${key}.claimCall`) : undefined,
      reason: parsePlanRejectionReason(entry.reason, `rewards.${key}.reason`),
      derivedAt: parseBlockAnchor(entry.derivedAt ?? entry.anchor ?? entry.blockAnchor ?? {}, `rewards.${key}.derivedAt`)
    } satisfies ContestRewardConfigEntry;
  }
  return output;
};

const parseRedemptionEntries = (raw: unknown): ContestDefinition['redemption'] => {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const source = raw as UnknownRecord;
  const output: Record<string, ContestRedemptionConfigEntry> = {};
  for (const [key, value] of Object.entries(source)) {
    const entry = ensureObject(value, `redemption.${key}`);
    output[key.toLowerCase()] = {
      status: ensureString(entry.status ?? 'eligible', `redemption.${key}.status`) as ContestRedemptionConfigEntry['status'],
      payout: parsePayoutDescriptor(entry.payout, `redemption.${key}.payout`),
      redemptionCall: entry.redemptionCall ? parseExecutionCall(entry.redemptionCall, `redemption.${key}.redemptionCall`) : undefined,
      reason: parsePlanRejectionReason(entry.reason, `redemption.${key}.reason`),
      derivedAt: parseBlockAnchor(entry.derivedAt ?? entry.anchor ?? {}, `redemption.${key}.derivedAt`)
    } satisfies ContestRedemptionConfigEntry;
  }
  return output;
};

const parseParticipants = (raw: unknown): Record<string, ContestParticipantProfile> => {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const source = raw as UnknownRecord;
  const output: Record<string, ContestParticipantProfile> = {};
  for (const [key, value] of Object.entries(source)) {
    const participant = ensureObject(value, `participants.${key}`);
    const lowerKey = key.toLowerCase();
    const balances = parseStringRecord(participant.balances, `participants.${key}.balances`);
    const allowancesRaw = participant.allowances && typeof participant.allowances === 'object' ? participant.allowances as UnknownRecord : {};
    const allowances: Record<string, Record<string, string>> = {};
    for (const [token, approvals] of Object.entries(allowancesRaw)) {
      const approvalRecord = ensureObject(approvals, `participants.${key}.allowances.${token}`);
      allowances[token.toLowerCase()] = parseStringRecord(approvalRecord, `participants.${key}.allowances.${token}`);
    }

    output[lowerKey] = {
      address: ensureAddress(participant.address ?? key, `participants.${key}.address`),
      balances,
      allowances,
      registered: Boolean(participant.registered),
      lastRebalanceAt: ensureOptionalString(participant.lastRebalanceAt, `participants.${key}.lastRebalanceAt`),
      cooldownEndsAt: ensureOptionalString(participant.cooldownEndsAt, `participants.${key}.cooldownEndsAt`),
      totalRebalanced: ensureOptionalString(participant.totalRebalanced, `participants.${key}.totalRebalanced`),
      rewardStatus: ensureOptionalString(participant.rewardStatus, `participants.${key}.rewardStatus`) as ContestParticipantProfile['rewardStatus'],
      rewardPayout: parsePayoutDescriptor(participant.rewardPayout, `participants.${key}.rewardPayout`),
      rewardReason: parsePlanRejectionReason(participant.rewardReason, `participants.${key}.rewardReason`),
      rewardCall: participant.rewardCall ? parseExecutionCall(participant.rewardCall, `participants.${key}.rewardCall`) : undefined,
      redemptionStatus: ensureOptionalString(participant.redemptionStatus, `participants.${key}.redemptionStatus`) as ContestParticipantProfile['redemptionStatus'],
      redemptionPayout: parsePayoutDescriptor(participant.redemptionPayout, `participants.${key}.redemptionPayout`),
      redemptionReason: parsePlanRejectionReason(participant.redemptionReason, `participants.${key}.redemptionReason`),
      redemptionCall: participant.redemptionCall ? parseExecutionCall(participant.redemptionCall, `participants.${key}.redemptionCall`) : undefined
    } satisfies ContestParticipantProfile;
  }
  return output;
};

const parseEventCursor = (raw: unknown, context: string): { blockNumber: bigint; logIndex: number } => {
  const source = ensureObject(raw ?? {}, context);
  return {
    blockNumber: toBigInt(source.blockNumber, `${context}.blockNumber`),
    logIndex: toNumber(source.logIndex, `${context}.logIndex`)
  };
};

const parseEvents = (raw: unknown): ContestDefinition['events'] => {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const source = raw as UnknownRecord;
  if (!Array.isArray(source.events)) {
    return undefined;
  }
  const events = source.events.map((entry, index) => {
    const event = ensureObject(entry, `events[${index}]`);
    const type = ensureString(event.type, `events[${index}].type`);
    return {
      type: type as ContestEventEnvelopeShape['type'],
      blockNumber: toBigInt(event.blockNumber, `events[${index}].blockNumber`),
      logIndex: toNumber(event.logIndex, `events[${index}].logIndex`),
      txHash: ensureHex(event.txHash, `events[${index}].txHash`) ?? '0x',
      cursor: parseEventCursor(event.cursor, `events[${index}].cursor`),
      payload: event.payload ? ensureObject(event.payload, `events[${index}].payload`) : {},
      reorgFlag: Boolean(event.reorgFlag),
      derivedAt: parseBlockAnchor(event.derivedAt ?? {}, `events[${index}].derivedAt`)
    };
  });
  return {
    events
  } satisfies ContestDefinition['events'];
};

const normalizeAddress = (value: unknown): Address | null => {
  if (typeof value !== 'string') {
    return null;
  }
  return ADDRESS_PATTERN.test(value) ? (value.toLowerCase() as Address) : null;
};

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
}) as const;

const createRpcClient = (networkId: number, rpcUrl: string): PublicClient =>
  createPublicClient({
    chain: createChainDescriptor(networkId, rpcUrl),
    transport: http(rpcUrl)
  });

const resolveRuntimeRpcUrl = (metadata: UnknownRecord): string | null => {
  const select = (source: unknown): string | null => {
    if (!source || typeof source !== 'object') {
      return null;
    }
    const candidate = (source as UnknownRecord).rpcUrl;
    return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
  };

  const direct = select(metadata.runtimeConfig);
  if (direct) {
    return direct;
  }

  const gateway = metadata.chainGatewayDefinition;
  if (gateway && typeof gateway === 'object') {
    const nested = select((gateway as UnknownRecord).runtimeConfig);
    if (nested) {
      return nested;
    }
  }

  const env = getEnv();
  if (env.chain.primaryRpc && env.chain.primaryRpc.length > 0) {
    return env.chain.primaryRpc;
  }
  if (env.chain.publicRpc && env.chain.publicRpc.length > 0) {
    return env.chain.publicRpc;
  }
  return null;
};

type MutableParticipantProfile = Omit<
  ContestParticipantProfile,
  'balances' | 'allowances' | 'registered'
> & {
  balances: Record<string, string>;
  allowances: Record<string, Record<string, string>>;
  registered: boolean;
};

const cloneAllowances = (
  allowances: Readonly<Record<string, Readonly<Record<string, string>>>>
): Record<string, Record<string, string>> => {
  const output: Record<string, Record<string, string>> = {};
  for (const [token, approvals] of Object.entries(allowances)) {
    output[token] = { ...approvals };
  }
  return output;
};

const cloneParticipantProfiles = (
  participants: Readonly<Record<string, ContestParticipantProfile>>
): Record<string, MutableParticipantProfile> => {
  const output: Record<string, MutableParticipantProfile> = {};
  for (const [key, profile] of Object.entries(participants)) {
    output[key] = {
      ...profile,
      balances: { ...profile.balances },
      allowances: cloneAllowances(profile.allowances)
    };
  }
  return output;
};

const createMutableParticipant = (address: Address): MutableParticipantProfile => ({
  address,
  balances: {},
  allowances: {},
  registered: false
});

const freezeAllowances = (
  allowances: Record<string, Record<string, string>>
): Readonly<Record<string, Readonly<Record<string, string>>>> => {
  const entries = Object.entries(allowances).map(([token, approvals]) => [token, Object.freeze({ ...approvals })]);
  return Object.freeze(Object.fromEntries(entries));
};

const freezeParticipantProfiles = (
  participants: Record<string, MutableParticipantProfile>
): ContestDefinition['participants'] => {
  const entries = Object.entries(participants).map(([key, profile]) => {
    const balances = Object.freeze({ ...profile.balances });
    const allowances = freezeAllowances(profile.allowances);
    const frozenProfile = Object.freeze({
      ...profile,
      balances,
      allowances
    }) as ContestParticipantProfile;
    return [key, frozenProfile];
  });
  return Object.freeze(Object.fromEntries(entries));
};

const collectTokenTargets = (
  definition: ContestDefinition
): { tokens: Set<string>; allowances: Map<string, Set<string>> } => {
  const tokens = new Set<string>();
  const allowances = new Map<string, Set<string>>();

  const addToken = (token?: Address) => {
    if (token) {
      tokens.add(token.toLowerCase());
    }
  };

  const addAllowance = (token?: Address, spender?: Address) => {
    if (!token || !spender) {
      return;
    }
    const tokenKey = token.toLowerCase();
    const spenderKey = spender.toLowerCase();
    const existing = allowances.get(tokenKey) ?? new Set<string>();
    existing.add(spenderKey);
    allowances.set(tokenKey, existing);
  };

  const requirement = definition.registration.requirement;
  addToken(requirement.tokenAddress);
  addAllowance(requirement.tokenAddress, requirement.spender);

  for (const approval of definition.registration.approvals ?? []) {
    addToken(approval.tokenAddress as Address | undefined);
    addAllowance(approval.tokenAddress as Address | undefined, approval.spender as Address | undefined);
  }

  return { tokens, allowances };
};

const hydrateParticipantProfile = async (
  client: PublicClient,
  tokens: Set<string>,
  allowances: Map<string, Set<string>>,
  address: Address,
  profile: MutableParticipantProfile
): Promise<void> => {
  for (const token of tokens) {
    const tokenAddress = token as Address;
    try {
      const balance = await client.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address]
      });
      profile.balances[token] = typeof balance === 'bigint' ? balance.toString() : String(balance);
    } catch {
      profile.balances[token] = profile.balances[token] ?? '0';
    }

    const spenderSet = allowances.get(token);
    if (!spenderSet || spenderSet.size === 0) {
      continue;
    }

    const allowanceRecord = profile.allowances[token] ?? {};
    for (const spender of spenderSet) {
      try {
        const allowanceValue = await client.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [address, spender as Address]
        });
        allowanceRecord[spender] =
          typeof allowanceValue === 'bigint' ? allowanceValue.toString() : String(allowanceValue);
      } catch {
        allowanceRecord[spender] = allowanceRecord[spender] ?? '0';
      }
    }
    profile.allowances[token] = allowanceRecord;
  }
};

const enrichContestDefinition = async (
  definition: ContestDefinition,
  aggregate: ContestAggregateRow,
  metadata: UnknownRecord,
  participantAddress?: string
): Promise<ContestDefinition> => {
  const mutableParticipants = cloneParticipantProfiles(definition.participants);
  const registeredAddresses = new Set<Address>();

  for (const record of aggregate.participants ?? []) {
    const normalized = normalizeAddress(record.walletAddress);
    if (!normalized) {
      continue;
    }
    const profile = mutableParticipants[normalized] ?? createMutableParticipant(normalized);
    profile.registered = true;
    mutableParticipants[normalized] = profile;
    registeredAddresses.add(normalized);
  }

  let requestAddress: Address | null = null;
  if (participantAddress) {
    const normalized = normalizeAddress(participantAddress);
    if (normalized) {
      requestAddress = normalized;
      if (!mutableParticipants[normalized]) {
        mutableParticipants[normalized] = createMutableParticipant(normalized);
      }
    }
  }

  const { tokens, allowances } = collectTokenTargets(definition);
  const rpcUrl = tokens.size > 0 ? resolveRuntimeRpcUrl(metadata) : null;

  if (rpcUrl) {
    try {
      const client = createRpcClient(definition.contest.chainId, rpcUrl);
      const targets = new Set<Address>(registeredAddresses);
      if (requestAddress) {
        targets.add(requestAddress);
      }

      await Promise.all(
        Array.from(targets).map(async (address) => {
          const profile = mutableParticipants[address];
          if (profile) {
            await hydrateParticipantProfile(client, tokens, allowances, address, profile);
          }
        })
      );
    } catch {
      // ignore RPC failures, retain existing metadata
    }
  }

  const registeredCount = registeredAddresses.size;
  const updatedCapacity = Object.freeze({
    ...definition.registrationCapacity,
    registered: registeredCount,
    isFull: registeredCount >= definition.registrationCapacity.maximum
  });

  const participants = freezeParticipantProfiles(mutableParticipants);

  return Object.freeze({
    ...definition,
    registrationCapacity: updatedCapacity,
    participants
  });
};

const resolveDefinitionSource = (metadata: UnknownRecord): UnknownRecord => {
  const candidates = [
    metadata.chainGatewayDefinition,
    metadata.gatewayDefinition,
    metadata.contestDefinition,
    metadata.definition
  ];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object') {
      return candidate as UnknownRecord;
    }
  }

  throw httpErrors.serviceUnavailable('Contest definition is not ready', {
    detail: {
      reason: 'metadata_missing_gateway_definition'
    },
    expose: true
  });
};

const buildDefinition = (
  rawDefinition: UnknownRecord,
  fallback: { contestId: string; chainId: number }
): ContestDefinition => {
  const contest = parseContestIdentifier(rawDefinition.contest as UnknownRecord | undefined, fallback);
  const phase = ensureString(rawDefinition.phase ?? 'registering', 'definition.phase') as ContestDefinition['phase'];
  const timeline = parseTimeline(rawDefinition.timeline);
  const prizePool = parsePrizePool(rawDefinition.prizePool);
  const registrationCapacity = parseRegistrationCapacity(rawDefinition.registrationCapacity);
  const qualificationVerdict = parseQualificationVerdict(rawDefinition.qualificationVerdict ?? { result: 'pass' });
  const derivedAt = parseBlockAnchor(rawDefinition.derivedAt ?? rawDefinition.blockAnchor ?? {}, 'definition.derivedAt');
  const registration = parseRegistration(rawDefinition.registration);
  const rebalance = parseRebalanceConfig(rawDefinition.rebalance);
  const settlement = parseSettlementConfig(rawDefinition.settlement);
  const rewards = parseRewardEntries(rawDefinition.rewards);
  const redemption = parseRedemptionEntries(rawDefinition.redemption);
  const participants = parseParticipants(rawDefinition.participants);
  const events = parseEvents(rawDefinition.events);

  return Object.freeze({
    contest,
    phase,
    timeline,
    prizePool,
    registrationCapacity,
    qualificationVerdict,
    derivedAt,
    registration,
    rebalance,
    settlement,
    rewards,
    redemption,
    participants,
    events
  });
};

export interface ContestDefinitionRequest {
  contestId: string;
  participant?: string;
  blockTag?: number | bigint | 'latest';
}

export interface ContestDefinitionContext {
  session: {
    userId: string;
    walletAddress: string;
    addressChecksum?: string;
    sessionToken?: string;
  };
}

export const buildContestDefinition = async (
  request: ContestDefinitionRequest,
  _context: ContestDefinitionContext
): Promise<ContestDefinition> => {
  const contestId = request.contestId?.trim();
  if (!contestId) {
    throw httpErrors.badRequest('Contest id is required');
  }

  await initDatabase();

  const response = (await database.queryContests({
    selector: {
      items: [
        { contestId },
        { internalId: contestId }
      ]
    },
    includes: {
      participants: true,
      rewards: true,
      leaderboard: { mode: 'latest' }
    },
    pagination: {
      pageSize: 1,
      cursor: null
    }
  })) as { items?: ContestAggregateRow[] };

  const aggregate = response.items?.[0];
  if (!aggregate || !aggregate.contest) {
    throw httpErrors.notFound('Contest not found', {
      detail: { contestId }
    });
  }

  const metadata = (aggregate.contest.metadata ?? {}) as UnknownRecord;
  const definitionSource = resolveDefinitionSource(metadata);
  const definition = buildDefinition(definitionSource, {
    contestId: aggregate.contest.contestId ?? contestId,
    chainId: aggregate.contest.chainId
  });

  return enrichContestDefinition(definition, aggregate, metadata, request.participant);
};
