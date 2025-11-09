import type { ContestAggregate, ContestRecord, QueryContestsResponse } from '@chaincontest/db';
import { database, initDatabase } from '@/lib/db/client';
import { httpErrors } from '@/lib/http/errors';
import { synchronizeContestPhases } from '@/lib/contests/phaseSync';

export interface ContestLeaderboardEntry {
  rank: number;
  walletAddress: string;
  score?: string;
}

export interface ContestLeaderboardSnapshot {
  version: string;
  entries: ContestLeaderboardEntry[];
}

export interface ContestPrizeAsset {
  symbol?: string;
  tokenAddress?: string;
  decimals?: number;
}

export interface ContestSnapshot {
  contestId: string;
  chainId: number;
  phase: string;
  timeline: {
    registrationOpensAt: string;
    registrationClosesAt: string;
  };
  prizePool: {
    currentBalance: string;
    accumulatedInflow?: string;
    valuationAnchor?: {
      price: string;
      currency: string;
      observedAt: string;
    };
    asset?: ContestPrizeAsset | null;
  };
  registrationCapacity: {
    registered: number;
    maximum: number;
    isFull: boolean;
  };
  leaderboard?: ContestLeaderboardSnapshot | null;
  derivedAt: {
    blockNumber: number;
    blockHash?: string;
    timestamp: string;
  };
  contractAddress?: string | null;
  status?: string;
  originTag?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ContestListFilters {
  chainId?: number;
  status?: string;
  cursor?: string | null;
}

export interface ContestListResult {
  items: ContestSnapshot[];
  nextCursor: string | null;
}

const DEFAULT_PAGE_SIZE = 25;

const toNumber = (value: unknown, context: string): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    if (!Number.isFinite(asNumber)) {
      throw httpErrors.internal('Numeric value exceeds safe range', {
        detail: { context, value: value.toString() }
      });
    }
    return asNumber;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw httpErrors.internal('Numeric string is empty', { detail: { context } });
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      throw httpErrors.internal('Unable to parse numeric string', { detail: { context, value } });
    }
    return parsed;
  }

  throw httpErrors.internal('Numeric value is missing or invalid', { detail: { context, value } });
};

const ensureString = (value: unknown, context: string): string => {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  throw httpErrors.internal('Required string value missing', { detail: { context, value } });
};

const asBoolean = (value: unknown, context: string): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }
  throw httpErrors.internal('Required boolean value missing', { detail: { context, value } });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const inferPrizeAsset = (metadata: Record<string, unknown>): ContestPrizeAsset | null => {
  const gateway = metadata.chainGatewayDefinition;
  if (!isRecord(gateway)) {
    return null;
  }

  const registration = gateway.registration;
  if (!isRecord(registration)) {
    return null;
  }

  const requirement = registration.requirement;
  if (!isRecord(requirement)) {
    return null;
  }

  const symbol = typeof requirement.symbol === 'string' ? requirement.symbol : undefined;
  const tokenAddress = typeof requirement.tokenAddress === 'string' ? requirement.tokenAddress : undefined;
  const decimals = typeof requirement.decimals === 'number' ? requirement.decimals : undefined;

  if (!symbol && !tokenAddress && decimals === undefined) {
    return null;
  }

  return { symbol, tokenAddress, decimals };
};

const parsePrizePool = (metadata: Record<string, unknown>): ContestSnapshot['prizePool'] => {
  const raw = metadata.prizePool;
  if (!raw || typeof raw !== 'object') {
    throw httpErrors.internal('Contest metadata missing prize pool');
  }

  const pool = raw as Record<string, unknown>;
  const result: ContestSnapshot['prizePool'] = {
    currentBalance: ensureString(pool.currentBalance, 'prizePool.currentBalance')
  };

  if (pool.accumulatedInflow !== undefined) {
    result.accumulatedInflow = ensureString(pool.accumulatedInflow, 'prizePool.accumulatedInflow');
  }

  if (pool.valuationAnchor !== undefined) {
    const anchor = pool.valuationAnchor;
    if (!anchor || typeof anchor !== 'object') {
      throw httpErrors.internal('Contest metadata valuation anchor malformed');
    }

    const anchorRecord = anchor as Record<string, unknown>;
    result.valuationAnchor = {
      price: ensureString(anchorRecord.price, 'prizePool.valuationAnchor.price'),
      currency: ensureString(anchorRecord.currency, 'prizePool.valuationAnchor.currency'),
      observedAt: ensureString(anchorRecord.observedAt, 'prizePool.valuationAnchor.observedAt')
    };
  }

  const asset = inferPrizeAsset(metadata);
  if (asset) {
    result.asset = asset;
  }

  return result;
};

const parseRegistrationCapacity = (metadata: Record<string, unknown>): ContestSnapshot['registrationCapacity'] => {
  const raw = metadata.registrationCapacity;
  if (!raw || typeof raw !== 'object') {
    throw httpErrors.internal('Contest metadata missing registration capacity');
  }

  const capacity = raw as Record<string, unknown>;
  return {
    registered: toNumber(capacity.registered, 'registrationCapacity.registered'),
    maximum: toNumber(capacity.maximum, 'registrationCapacity.maximum'),
    isFull: asBoolean(capacity.isFull, 'registrationCapacity.isFull')
  };
};

const parseDerivedAt = (metadata: Record<string, unknown>): ContestSnapshot['derivedAt'] => {
  const raw = metadata.derivedAt;
  if (!raw || typeof raw !== 'object') {
    throw httpErrors.internal('Contest metadata missing derivedAt');
  }

  const derived = raw as Record<string, unknown>;
  return {
    blockNumber: toNumber(derived.blockNumber ?? 0, 'derivedAt.blockNumber'),
    blockHash: derived.blockHash === undefined || derived.blockHash === null ? undefined : ensureString(derived.blockHash, 'derivedAt.blockHash'),
    timestamp: ensureString(derived.timestamp, 'derivedAt.timestamp')
  };
};

const parseTimeline = (metadata: Record<string, unknown>, contest: ContestRecord): ContestSnapshot['timeline'] => {
  const raw = metadata.timeline;
  if (raw && typeof raw === 'object') {
    const timeline = raw as Record<string, unknown>;
    const opensAt = timeline.registrationOpensAt ?? contest.timeWindowStart?.toISOString();
    const closesAt = timeline.registrationClosesAt ?? contest.timeWindowEnd?.toISOString();
    return {
      registrationOpensAt: ensureString(opensAt, 'timeline.registrationOpensAt'),
      registrationClosesAt: ensureString(closesAt, 'timeline.registrationClosesAt')
    };
  }

  return {
    registrationOpensAt: contest.timeWindowStart?.toISOString() ?? ensureString(undefined, 'timeline.registrationOpensAt'),
    registrationClosesAt: contest.timeWindowEnd?.toISOString() ?? ensureString(undefined, 'timeline.registrationClosesAt')
  };
};

const mapLeaderboard = (aggregate: ContestAggregate): ContestLeaderboardSnapshot | null => {
  const { leaderboard } = aggregate;
  if (!leaderboard) {
    return null;
  }

  const entries = Array.isArray(leaderboard.entries)
    ? leaderboard.entries.map((entry) => ({
        rank: toNumber(entry.rank, 'leaderboard.entries.rank'),
        walletAddress: ensureString(entry.walletAddress, 'leaderboard.entries.walletAddress'),
        score: entry.score === undefined || entry.score === null ? undefined : String(entry.score)
      }))
    : [];

  return {
    version: String(leaderboard.version),
    entries
  };
};

const normalisePhase = (status: string): string => {
  switch (status) {
    case 'registered':
      return 'registration';
    case 'sealed':
      return 'settled';
    default:
      return status;
  }
};

const parseIsoTimestamp = (value: string | undefined): number | null => {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const toIsoString = (value: unknown): string | undefined => {
  if (!value) {
    return undefined;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return undefined;
};

const canonicalizePhase = (phase: string): string => {
  const value = phase.toLowerCase();
  switch (value) {
    case 'registered':
    case 'registration':
      return 'registration';
    case 'active':
    case 'live':
      return 'active';
    case 'frozen':
      return 'frozen';
    case 'sealed':
    case 'settled':
      return 'settled';
    case 'closed':
      return 'closed';
    default:
      return 'registration';
  }
};

const extractMetadataPhase = (metadata: Record<string, unknown> | null | undefined): string | null => {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }
  const phaseValue = (metadata as Record<string, unknown>).phase;
  if (typeof phaseValue === 'string' && phaseValue.length > 0) {
    return canonicalizePhase(phaseValue);
  }
  const gateway = (metadata as Record<string, unknown>).chainGatewayDefinition;
  if (gateway && typeof gateway === 'object') {
    const nestedPhase = (gateway as Record<string, unknown>).phase;
    if (typeof nestedPhase === 'string' && nestedPhase.length > 0) {
      return canonicalizePhase(nestedPhase);
    }
  }
  return null;
};

const derivePhase = (contest: ContestRecord, timeline: ContestSnapshot['timeline']): string => {
  const metadataPhase = extractMetadataPhase(contest.metadata as Record<string, unknown> | null | undefined);
  if (metadataPhase) {
    return metadataPhase;
  }

  if (contest.status === 'registered') {
    const closesAt = parseIsoTimestamp(timeline.registrationClosesAt);
    if (closesAt && Date.now() >= closesAt) {
      return 'active';
    }
  }
  return canonicalizePhase(ensureString(contest.status, 'contest.status'));
};

export const toContestSnapshot = (aggregate: ContestAggregate): ContestSnapshot => {
  const { contest } = aggregate;
  if (!contest) {
    throw httpErrors.internal('Contest aggregate missing contest payload');
  }

  const metadata = contest.metadata ?? {};

  const derivedAt = parseDerivedAt(metadata);
  const prizePool = parsePrizePool(metadata);
  const registrationCapacity = parseRegistrationCapacity(metadata);
  const timeline = parseTimeline(metadata, contest);
  const leaderboard = mapLeaderboard(aggregate);

  return {
    contestId: ensureString(contest.contestId ?? contest.internalKey ?? contest.contractAddress, 'contest.contestId'),
    chainId: toNumber(contest.chainId, 'contest.chainId'),
    phase: derivePhase(contest, timeline),
    timeline,
    prizePool,
    registrationCapacity,
    leaderboard,
    derivedAt,
    contractAddress: typeof contest.contractAddress === 'string' ? contest.contractAddress.toLowerCase() : undefined,
    status: ensureString(contest.status, 'contest.status'),
    originTag: contest.originTag ?? null,
    metadata: metadata as Record<string, unknown>,
    createdAt: toIsoString(contest.createdAt),
    updatedAt: toIsoString(contest.updatedAt)
  };
};

const queryContests = async (params: Parameters<typeof database.queryContests>[0]): Promise<QueryContestsResponse> => {
  await initDatabase();
  return (await database.queryContests(params)) as QueryContestsResponse;
};

export const listContests = async (filters: ContestListFilters): Promise<ContestListResult> => {
  const { chainId, status, cursor = null } = filters;

  const selector: {
    items?: Array<{ internalId?: string; chainId?: number; contractAddress?: string }>;
    filter?: {
      chainIds?: number[];
      statuses?: string[];
      keyword?: string;
    };
  } = {};

  const filter: {
    chainIds?: number[];
    statuses?: string[];
  } = {};

  if (typeof chainId === 'number') {
    filter.chainIds = [chainId];
  }
  if (typeof status === 'string' && status.length > 0) {
    filter.statuses = [status];
  }
  selector.filter = Object.keys(filter).length > 0 ? filter : {};
  const requestedStatuses = filter.statuses ? new Set(filter.statuses) : null;

  const response = await queryContests({
    selector,
    includes: {
      leaderboard: { mode: 'latest' }
    },
    pagination: {
      cursor: cursor ?? null,
      pageSize: DEFAULT_PAGE_SIZE
    }
  });

  const aggregates = response.items ?? [];
  await synchronizeContestPhases(
    aggregates.map((aggregate) => aggregate.contest).filter(Boolean) as ContestRecord[]
  );

  const filteredAggregates =
    requestedStatuses && requestedStatuses.size > 0
      ? aggregates.filter((aggregate) => requestedStatuses.has(aggregate.contest.status))
      : aggregates;

  const items = filteredAggregates.map(toContestSnapshot);

  return {
    items,
    nextCursor: response.nextCursor ?? null
  };
};

export const getContest = async (contestId: string): Promise<ContestSnapshot> => {
  if (!contestId || contestId.trim().length === 0) {
    throw httpErrors.badRequest('Contest id is required');
  }

  const normalizedContestId = contestId.trim();

  const selectorItems = [
    { contestId: normalizedContestId },
    { internalId: normalizedContestId }
  ];

  const response = await queryContests({
    selector: {
      items: selectorItems
    },
    includes: {
      leaderboard: { mode: 'latest' }
    },
    pagination: {
      pageSize: 1,
      cursor: null
    }
  });

  const aggregate = response.items?.[0];
  if (!aggregate) {
    throw httpErrors.notFound('Contest not found', {
      detail: { contestId }
    });
  }

  await synchronizeContestPhases([aggregate.contest]);

  return toContestSnapshot(aggregate);
};
