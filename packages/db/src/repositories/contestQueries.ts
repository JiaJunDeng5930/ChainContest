import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { DrizzleDatabase } from '../adapters/connection.js';
import { DbError, DbErrorCode } from '../instrumentation/metrics.js';
import { contests, leaderboardVersions, participants, rewardClaims, userIdentities, walletBindings } from '../schema/index.js';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

// Temporary supported chain list until shared schemas export an authoritative catalogue.
const SUPPORTED_CHAIN_IDS = new Set([1, 5, 10, 11155111, 42161]);

export interface ContestItemSelector {
  internalId?: string;
  chainId?: number;
  contractAddress?: string;
}

export interface ContestFilter {
  chainIds?: number[];
  statuses?: string[];
  timeRange?: { from: string; to: string };
  keyword?: string;
}

export interface ContestSelector {
  items?: ContestItemSelector[];
  filter?: ContestFilter;
}

export type LeaderboardInclude =
  | { mode: 'latest' }
  | { mode: 'version'; version: number | string | bigint };

export interface ContestIncludes {
  participants?: boolean;
  leaderboard?: LeaderboardInclude;
  rewards?: boolean;
  creatorSummary?: boolean;
}

export interface PaginationOptions {
  pageSize?: number;
  cursor?: string | null;
}

export interface ContestQueryParams {
  selector: ContestSelector;
  includes?: ContestIncludes;
  pagination?: PaginationOptions;
}

export interface ContestRecord {
  contestId: string;
  chainId: number;
  contractAddress: string;
  internalKey: string | null;
  status: string;
  timeWindowStart: Date;
  timeWindowEnd: Date;
  originTag: string;
  sealedAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ParticipantRecord {
  contestId: string;
  walletAddress: string;
  vaultReference: string | null;
  amount: string;
  occurredAt: Date;
}

export interface LeaderboardRecord {
  contestId: string;
  version: string;
  entries: Array<{ rank: number; walletAddress: string; score?: string }>; // score optional for flexibility
  asOf: Date;
}

export interface RewardClaimRecord {
  contestId: string;
  walletAddress: string;
  amount: string;
  claimedAt: Date;
}

export interface CreatorSummaryRecord {
  contestId: string;
  creatorWallet: string | null;
  contestsHosted: number;
  totalRewards: string;
}

export interface ContestAggregate {
  contest: ContestRecord;
  participants?: ParticipantRecord[];
  leaderboard?: LeaderboardRecord | null;
  rewards?: RewardClaimRecord[];
  creatorSummary?: CreatorSummaryRecord | null;
}

export interface ContestQueryResult {
  items: ContestAggregate[];
  nextCursor: string | null;
}

export interface UserContestQueryFilters {
  chainIds?: number[];
  statuses?: string[];
  timeRange?: { from: string; to: string };
}

export interface UserContestQueryParams {
  userId: string;
  filters?: UserContestQueryFilters;
  pagination?: PaginationOptions;
}

export interface UserContestQueryResult {
  items: Array<{
    contest: ContestRecord;
    participations: ParticipantRecord[];
    rewardClaims: RewardClaimRecord[];
    lastActivity: Date | null;
  }>;
  nextCursor: string | null;
}

interface CursorPayload {
  sortKey: string;
  tieBreaker: string;
}

const BASE_ORDER = [desc(contests.timeWindowEnd), desc(contests.id)] as const;

export async function queryContests(
  db: DrizzleDatabase,
  params: ContestQueryParams
): Promise<ContestQueryResult> {
  const pagination = normalisePagination(params.pagination);
  const baseConditions = buildContestConditions(params.selector);

  const predicates = [...baseConditions];
  if (pagination.cursor !== null) {
    predicates.push(applyCursorCondition(pagination.cursor));
  }

  let orderedQuery = db
    .select({
      id: contests.id,
      chainId: contests.chainId,
      contractAddress: contests.contractAddress,
      internalKey: contests.internalKey,
      status: contests.status,
      timeWindowStart: contests.timeWindowStart,
      timeWindowEnd: contests.timeWindowEnd,
      originTag: contests.originTag,
      sealedAt: contests.sealedAt,
      metadata: contests.metadata,
      createdAt: contests.createdAt,
      updatedAt: contests.updatedAt
    })
    .from(contests);

  if (predicates.length > 0) {
    orderedQuery = orderedQuery.where(and(...predicates));
  }

  orderedQuery = orderedQuery.orderBy(...BASE_ORDER).limit(pagination.pageSize + 1);

  const rows = await orderedQuery;

  const hasNextPage = rows.length > pagination.pageSize;
  const slicedRows = hasNextPage ? rows.slice(0, pagination.pageSize) : rows;

  const contestAggregates = await hydrateContestAggregates(db, slicedRows, params.includes ?? {});

  const nextCursor = hasNextPage ? encodeContestCursor(rows[pagination.pageSize]) : null;

  return {
    items: contestAggregates,
    nextCursor
  };
}

export async function queryUserContests(
  db: DrizzleDatabase,
  params: UserContestQueryParams
): Promise<UserContestQueryResult> {
  if (!params.userId || params.userId.trim().toLowerCase() === 'unknown') {
    return { items: [], nextCursor: null };
  }

  const normalizedUser = params.userId.trim();
  const identity = await db.query.userIdentities.findFirst({
    where: eq(userIdentities.externalId, normalizedUser)
  });

  if (!identity) {
    return { items: [], nextCursor: null };
  }

  const wallets = await db
    .select({
      wallet: walletBindings.walletAddress
    })
    .from(walletBindings)
    .where(and(eq(walletBindings.userId, identity.id), isNull(walletBindings.unboundAt)));

  const activeWallets = wallets.map((entry) => entry.wallet.toLowerCase());
  if (activeWallets.length === 0) {
    return { items: [], nextCursor: null };
  }

  const pagination = normalisePagination(params.pagination);
  const candidateContests = await loadUserContestCandidates(db, activeWallets, params.filters, pagination);

  if (candidateContests.rows.length === 0) {
    return { items: [], nextCursor: null };
  }

  const contestRows = candidateContests.rows.map((row) => row.contest);
  const hydrations = await hydrateContestAggregates(db, contestRows, {
    participants: true,
    rewards: true
  });

  const participationMap = await loadParticipantsForWallets(db, activeWallets, contestRows.map((row) => row.id));
  const rewardMap = await loadRewardsForWallets(db, activeWallets, contestRows.map((row) => row.id));

  const items = hydrations.map((aggregate) => {
    const contestId = aggregate.contest.contestId;
    const participations = participationMap.get(contestId) ?? [];
    const rewards = rewardMap.get(contestId) ?? [];
    const lastActivity = determineLastActivity(participations, rewards);

    return {
      contest: aggregate.contest,
      participations,
      rewardClaims: rewards,
      lastActivity
    };
  });

  const nextCursor = candidateContests.nextCursor;

  return { items, nextCursor };
}

function normalisePagination(options?: PaginationOptions): { pageSize: number; cursor: CursorPayload | null } {
  const rawSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;
  const pageSize = Math.max(1, Math.min(rawSize, MAX_PAGE_SIZE));
  const cursor = options?.cursor ? decodeCursorPayload(options.cursor) : null;
  return { pageSize, cursor };
}

function buildContestConditions(selector: ContestSelector): SQL[] {
  const conditions: SQL[] = [];

  if (selector.items && selector.items.length > 0) {
    const directConditions = selector.items.map((item) => {
      if (item.internalId) {
        return eq(contests.internalKey, item.internalId);
      }

      if (item.chainId && item.contractAddress) {
        ensureSupportedChains([item.chainId]);
        return and(
          eq(contests.chainId, item.chainId),
          eq(contests.contractAddress, item.contractAddress.toLowerCase())
        );
      }

      throw new DbError(DbErrorCode.INPUT_INVALID, 'Invalid contest selector item');
    });

    conditions.push(
      directConditions.length === 1 ? directConditions[0]! : or(...directConditions)
    );
  }

  if (selector.filter) {
    const filter = selector.filter;

    if (filter.chainIds && filter.chainIds.length > 0) {
      ensureSupportedChains(filter.chainIds);
      conditions.push(inArray(contests.chainId, filter.chainIds));
    }

    if (filter.statuses && filter.statuses.length > 0) {
      conditions.push(inArray(contests.status, filter.statuses));
    }

    if (filter.timeRange) {
      const { from, to } = filter.timeRange;
      const start = new Date(from);
      const end = new Date(to);

      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
        throw new DbError(DbErrorCode.INPUT_INVALID, 'Invalid time range provided for contest filter', {
          detail: {
            reason: 'contest_time_range_invalid',
            context: { from, to }
          }
        });
      }

      conditions.push(and(gte(contests.timeWindowEnd, start), lte(contests.timeWindowStart, end)));
    }

    if (filter.keyword && filter.keyword.trim().length > 0) {
      const keyword = `%${filter.keyword.trim().toLowerCase()}%`;
      conditions.push(ilike(sql`metadata ->> 'keywords'`, keyword));
    }
  }

  return conditions;
}

function ensureSupportedChains(chainIds: number[]): void {
  const unsupported = chainIds.filter((id) => !SUPPORTED_CHAIN_IDS.has(id));
  if (unsupported.length > 0) {
    throw new DbError(DbErrorCode.RESOURCE_UNSUPPORTED, 'Unsupported chain in contest query', {
      detail: {
        reason: 'unsupported_chain',
        context: { chainIds: unsupported }
      }
    });
  }
}

function applyCursorCondition(cursor: CursorPayload): SQL {
  const cursorDate = new Date(cursor.sortKey);
  if (Number.isNaN(cursorDate.getTime())) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'Invalid pagination cursor for contests');
  }

  return or(
    ltDate(contests.timeWindowEnd, cursorDate),
    and(eq(contests.timeWindowEnd, cursorDate), ltUuid(contests.id, cursor.tieBreaker))
  );
}

function ltDate(column: typeof contests.timeWindowEnd, value: Date): SQL {
  return sql`${column} < ${value}`;
}

function ltUuid(column: typeof contests.id, value: string): SQL {
  return sql`${column} < ${value}`;
}

async function hydrateContestAggregates(
  db: DrizzleDatabase,
  contestRows: Array<{
    id: string;
    chainId: number;
    contractAddress: string;
    internalKey: string | null;
    status: string;
    timeWindowStart: Date;
    timeWindowEnd: Date;
    originTag: string;
    sealedAt: Date | null;
    metadata: unknown;
    createdAt: Date;
    updatedAt: Date;
  }>,
  includes: ContestIncludes
): Promise<ContestAggregate[]> {
  if (contestRows.length === 0) {
    return [];
  }

  const contestIds = contestRows.map((row) => row.id);
  const aggregates: ContestAggregate[] = contestRows.map((row) => ({
    contest: {
      contestId: row.id,
      chainId: row.chainId,
      contractAddress: row.contractAddress.toLowerCase(),
      internalKey: row.internalKey,
      status: row.status,
      timeWindowStart: row.timeWindowStart,
      timeWindowEnd: row.timeWindowEnd,
      originTag: row.originTag,
      sealedAt: row.sealedAt,
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }
  }));

  if (includes.participants) {
    const participantMap = await loadParticipants(db, contestIds);
    aggregates.forEach((aggregate) => {
      aggregate.participants = participantMap.get(aggregate.contest.contestId) ?? [];
    });
  }

  if (includes.rewards) {
    const rewardMap = await loadRewards(db, contestIds);
    aggregates.forEach((aggregate) => {
      aggregate.rewards = rewardMap.get(aggregate.contest.contestId) ?? [];
    });
  }

  if (includes.leaderboard) {
    const leaderboardMap = await loadLeaderboard(db, contestIds, includes.leaderboard);
    aggregates.forEach((aggregate) => {
      aggregate.leaderboard = leaderboardMap.get(aggregate.contest.contestId) ?? null;
    });
  }

  if (includes.creatorSummary) {
    aggregates.forEach((aggregate) => {
      const metadata = aggregate.contest.metadata ?? {};
      const creatorWallet = typeof metadata.creatorWallet === 'string' ? metadata.creatorWallet : null;
      const contestsHostedRaw = metadata.contestsHosted ?? metadata.creatorContests;
      const contestsHosted = typeof contestsHostedRaw === 'number'
        ? contestsHostedRaw
        : Number.parseInt(String(contestsHostedRaw ?? 0), 10) || 0;

      let totalRewards = '0';
      if (aggregate.rewards && aggregate.rewards.length > 0) {
        totalRewards = sumRewardAmounts(aggregate.rewards);
      } else if (metadata.totalRewards !== undefined) {
        if (typeof metadata.totalRewards === 'string') {
          totalRewards = metadata.totalRewards;
        } else if (typeof metadata.totalRewards === 'number' || typeof metadata.totalRewards === 'bigint') {
          totalRewards = metadata.totalRewards.toString();
        }
      }

      aggregate.creatorSummary = {
        contestId: aggregate.contest.contestId,
        creatorWallet,
        contestsHosted,
        totalRewards
      };
    });
  }

  return aggregates;
}

async function loadParticipants(db: DrizzleDatabase, contestIds: string[]): Promise<Map<string, ParticipantRecord[]>> {
  const rows = await db
    .select({
      contestId: participants.contestId,
      walletAddress: participants.walletAddress,
      vaultReference: participants.vaultReference,
      amount: participants.amountWei,
      occurredAt: participants.occurredAt
    })
    .from(participants)
    .where(inArray(participants.contestId, contestIds))
    .orderBy(asc(participants.occurredAt));

  const map = new Map<string, ParticipantRecord[]>();
  rows.forEach((row) => {
    const entry = map.get(row.contestId) ?? [];
    entry.push({
      contestId: row.contestId,
      walletAddress: row.walletAddress.toLowerCase(),
      vaultReference: row.vaultReference,
      amount: row.amount.toString(),
      occurredAt: row.occurredAt
    });
    map.set(row.contestId, entry);
  });
  return map;
}

async function loadRewards(db: DrizzleDatabase, contestIds: string[]): Promise<Map<string, RewardClaimRecord[]>> {
  const rows = await db
    .select({
      contestId: rewardClaims.contestId,
      walletAddress: rewardClaims.walletAddress,
      amount: rewardClaims.amountWei,
      claimedAt: rewardClaims.claimedAt
    })
    .from(rewardClaims)
    .where(inArray(rewardClaims.contestId, contestIds))
    .orderBy(asc(rewardClaims.claimedAt));

  const map = new Map<string, RewardClaimRecord[]>();
  rows.forEach((row) => {
    const entry = map.get(row.contestId) ?? [];
    entry.push({
      contestId: row.contestId,
      walletAddress: row.walletAddress.toLowerCase(),
      amount: row.amount.toString(),
      claimedAt: row.claimedAt
    });
    map.set(row.contestId, entry);
  });
  return map;
}

async function loadLeaderboard(
  db: DrizzleDatabase,
  contestIds: string[],
  include: LeaderboardInclude
): Promise<Map<string, LeaderboardRecord>> {
  const map = new Map<string, LeaderboardRecord>();

  if (include.mode === 'latest') {
    const rows = await db
      .select({
        contestId: leaderboardVersions.contestId,
        version: leaderboardVersions.version,
        entries: leaderboardVersions.entries,
        writtenAt: leaderboardVersions.writtenAt
      })
      .from(leaderboardVersions)
      .where(inArray(leaderboardVersions.contestId, contestIds))
      .orderBy(desc(leaderboardVersions.contestId), desc(leaderboardVersions.version));

    for (const row of rows) {
      if (map.has(row.contestId)) {
        continue;
      }
      map.set(row.contestId, {
        contestId: row.contestId,
        version: row.version.toString(),
        entries: normaliseLeaderboardEntries(row.entries),
        asOf: row.writtenAt
      });
    }
  } else {
    const versionValue = BigInt(include.version);
    const rows = await db
      .select({
        contestId: leaderboardVersions.contestId,
        version: leaderboardVersions.version,
        entries: leaderboardVersions.entries,
        writtenAt: leaderboardVersions.writtenAt
      })
      .from(leaderboardVersions)
      .where(
        and(inArray(leaderboardVersions.contestId, contestIds), eq(leaderboardVersions.version, versionValue))
      );

    const missing = contestIds.filter((id) => !rows.some((row) => row.contestId === id));
    if (missing.length > 0) {
      throw new DbError(DbErrorCode.NOT_FOUND, 'Requested leaderboard version not found for contest', {
        detail: {
          reason: 'leaderboard_version_not_found',
          context: { contestIds: missing, version: versionValue.toString() }
        }
      });
    }

    for (const row of rows) {
      map.set(row.contestId, {
        contestId: row.contestId,
        version: row.version.toString(),
        entries: normaliseLeaderboardEntries(row.entries),
        asOf: row.writtenAt
      });
    }
  }

  return map;
}

function sumRewardAmounts(rewards: RewardClaimRecord[]): string {
  return rewards.reduce((total, reward) => total + BigInt(reward.amount), BigInt(0)).toString();
}

function normaliseLeaderboardEntries(raw: unknown): Array<{ rank: number; walletAddress: string; score?: string }> {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const rank = Number((entry as Record<string, unknown>).rank);
      const walletAddress = String((entry as Record<string, unknown>).walletAddress ?? '');
      const score = (entry as Record<string, unknown>).score;

      if (!Number.isFinite(rank) || walletAddress.length === 0) {
        return null;
      }

      const normalizedEntry: { rank: number; walletAddress: string; score?: string } = {
        rank,
        walletAddress: walletAddress.toLowerCase()
      };

      if (typeof score === 'string' || typeof score === 'number' || typeof score === 'bigint') {
        normalizedEntry.score = score.toString();
      }

      return normalizedEntry;
    })
    .filter((entry): entry is { rank: number; walletAddress: string; score?: string } => entry !== null)
    .sort((a, b) => a.rank - b.rank);
}

function encodeContestCursor(row: { timeWindowEnd: Date; id: string }): string {
  const payload: CursorPayload = {
    sortKey: row.timeWindowEnd.toISOString(),
    tieBreaker: row.id
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursorPayload(raw: string): CursorPayload {
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as CursorPayload;
    if (!parsed.sortKey || !parsed.tieBreaker) {
      throw new Error('Invalid cursor payload');
    }
    return parsed;
  } catch (error) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'Invalid pagination cursor encoding', { cause: error });
  }
}

function encodeActivityCursor(sortKey: Date, contestId: string): string {
  const payload: CursorPayload = {
    sortKey: sortKey.toISOString(),
    tieBreaker: contestId
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function isRowAfterCursor(sortKey: Date, contestId: string, cursor: CursorPayload): number {
  const cursorDate = new Date(cursor.sortKey);
  if (Number.isNaN(cursorDate.getTime())) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'Invalid pagination cursor for user contests');
  }

  if (sortKey.getTime() === cursorDate.getTime()) {
    return contestId.localeCompare(cursor.tieBreaker);
  }

  return sortKey.getTime() - cursorDate.getTime();
}

interface UserContestCandidateRow {
  contest: {
    id: string;
    chainId: number;
    contractAddress: string;
    internalKey: string | null;
    status: string;
    timeWindowStart: Date;
    timeWindowEnd: Date;
    originTag: string;
    sealedAt: Date | null;
    metadata: unknown;
    createdAt: Date;
    updatedAt: Date;
  };
  sortKey: Date;
}

async function loadUserContestCandidates(
  db: DrizzleDatabase,
  wallets: string[],
  filters: UserContestQueryFilters | undefined,
  pagination: { pageSize: number; cursor: CursorPayload | null }
): Promise<{ rows: UserContestCandidateRow[]; nextCursor: string | null }> {
  const participationActivity = await db
    .select({
      contestId: participants.contestId,
      lastParticipation: sql<Date>`MAX(${participants.occurredAt})`
    })
    .from(participants)
    .where(inArray(participants.walletAddress, wallets))
    .groupBy(participants.contestId);

  const rewardActivity = await db
    .select({
      contestId: rewardClaims.contestId,
      lastReward: sql<Date>`MAX(${rewardClaims.claimedAt})`
    })
    .from(rewardClaims)
    .where(inArray(rewardClaims.walletAddress, wallets))
    .groupBy(rewardClaims.contestId);

  const activityMap = new Map<string, Date>();

  participationActivity.forEach((row) => {
    const timestamp = coerceActivityTimestamp(row.lastParticipation);
    if (timestamp) {
      activityMap.set(row.contestId, timestamp);
    }
  });

  rewardActivity.forEach((row) => {
    const timestamp = coerceActivityTimestamp(row.lastReward);
    if (!timestamp) {
      return;
    }
    const current = activityMap.get(row.contestId);
    if (!current || timestamp > current) {
      activityMap.set(row.contestId, timestamp);
    }
  });

  if (activityMap.size === 0) {
    return { rows: [], nextCursor: null };
  }

  const baseContestIds = Array.from(activityMap.keys());
  const conditions: SQL[] = [inArray(contests.id, baseContestIds)];

  if (filters?.chainIds && filters.chainIds.length > 0) {
    ensureSupportedChains(filters.chainIds);
    conditions.push(inArray(contests.chainId, filters.chainIds));
  }

  if (filters?.statuses && filters.statuses.length > 0) {
    conditions.push(inArray(contests.status, filters.statuses));
  }

  if (filters?.timeRange) {
    const { from, to } = filters.timeRange;
    const start = new Date(from);
    const end = new Date(to);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      throw new DbError(DbErrorCode.INPUT_INVALID, 'Invalid time range provided for user contest filter', {
        detail: {
          reason: 'user_contest_time_range_invalid',
          context: { from, to }
        }
      });
    }
    conditions.push(and(gte(contests.timeWindowEnd, start), lte(contests.timeWindowStart, end)));
  }

  const contestRows = await db
    .select({
      id: contests.id,
      chainId: contests.chainId,
      contractAddress: contests.contractAddress,
      internalKey: contests.internalKey,
      status: contests.status,
      timeWindowStart: contests.timeWindowStart,
      timeWindowEnd: contests.timeWindowEnd,
      originTag: contests.originTag,
      sealedAt: contests.sealedAt,
      metadata: contests.metadata,
      createdAt: contests.createdAt,
      updatedAt: contests.updatedAt
    })
    .from(contests)
    .where(conditions.length === 1 ? conditions[0]! : and(...conditions));

  const annotatedRows: UserContestCandidateRow[] = contestRows
    .map((contest) => {
      const sortKey = activityMap.get(contest.id);
      if (!sortKey) {
        return null;
      }
      return {
        contest,
        sortKey
      } satisfies UserContestCandidateRow;
    })
    .filter((value): value is UserContestCandidateRow => value !== null);

  annotatedRows.sort((a, b) => {
    if (a.sortKey.getTime() === b.sortKey.getTime()) {
      return b.contest.id.localeCompare(a.contest.id);
    }
    return b.sortKey.getTime() - a.sortKey.getTime();
  });

  const cursor = pagination.cursor;
  const filtered = cursor
    ? annotatedRows.filter((row) => isRowAfterCursor(row.sortKey, row.contest.id, cursor) < 0)
    : annotatedRows;

  const limited = filtered.slice(0, pagination.pageSize + 1);
  const hasNextPage = limited.length > pagination.pageSize;
  const rows = hasNextPage ? limited.slice(0, pagination.pageSize) : limited;

  const nextCursor = hasNextPage
    ? encodeActivityCursor(limited[pagination.pageSize]!.sortKey, limited[pagination.pageSize]!.contest.id)
    : null;

  return { rows, nextCursor };
}

function coerceActivityTimestamp(value: unknown): Date | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

async function loadParticipantsForWallets(
  db: DrizzleDatabase,
  wallets: string[],
  contestIds: string[]
): Promise<Map<string, ParticipantRecord[]>> {
  if (contestIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      contestId: participants.contestId,
      walletAddress: participants.walletAddress,
      vaultReference: participants.vaultReference,
      amount: participants.amountWei,
      occurredAt: participants.occurredAt
    })
    .from(participants)
    .where(and(inArray(participants.walletAddress, wallets), inArray(participants.contestId, contestIds)))
    .orderBy(asc(participants.occurredAt));

  const map = new Map<string, ParticipantRecord[]>();
  rows.forEach((row) => {
    const entry = map.get(row.contestId) ?? [];
    entry.push({
      contestId: row.contestId,
      walletAddress: row.walletAddress,
      vaultReference: row.vaultReference,
      amount: row.amount.toString(),
      occurredAt: row.occurredAt
    });
    map.set(row.contestId, entry);
  });
  return map;
}

async function loadRewardsForWallets(
  db: DrizzleDatabase,
  wallets: string[],
  contestIds: string[]
): Promise<Map<string, RewardClaimRecord[]>> {
  if (contestIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      contestId: rewardClaims.contestId,
      walletAddress: rewardClaims.walletAddress,
      amount: rewardClaims.amountWei,
      claimedAt: rewardClaims.claimedAt
    })
    .from(rewardClaims)
    .where(and(inArray(rewardClaims.walletAddress, wallets), inArray(rewardClaims.contestId, contestIds)))
    .orderBy(asc(rewardClaims.claimedAt));

  const map = new Map<string, RewardClaimRecord[]>();
  rows.forEach((row) => {
    const entry = map.get(row.contestId) ?? [];
    entry.push({
      contestId: row.contestId,
      walletAddress: row.walletAddress,
      amount: row.amount.toString(),
      claimedAt: row.claimedAt
    });
    map.set(row.contestId, entry);
  });
  return map;
}

function determineLastActivity(participations: ParticipantRecord[], rewards: RewardClaimRecord[]): Date | null {
  const lastParticipation = participations.length > 0 ? participations[participations.length - 1]!.occurredAt : null;
  const lastReward = rewards.length > 0 ? rewards[rewards.length - 1]!.claimedAt : null;

  if (lastParticipation && lastReward) {
    return lastParticipation > lastReward ? lastParticipation : lastReward;
  }

  return lastParticipation ?? lastReward ?? null;
}
