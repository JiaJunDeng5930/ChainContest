import { and, desc, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { DrizzleDatabase, DrizzleTransaction } from '../adapters/connection.js';
import { DbError, DbErrorCode } from '../instrumentation/metrics.js';
import {
  contests,
  contestOriginEnum,
  contestStatusEnum,
  contestSnapshots,
  leaderboardVersions,
  participants,
  rewardClaims,
  ingestionCursors,
  ingestionEvents,
  type DbSchema
} from '../schema/index.js';

type ContestStatus = (typeof contestStatusEnum.enumValues)[number];
type ContestOrigin = (typeof contestOriginEnum.enumValues)[number];

export type ContestDomainWriteAction =
  | 'track'
  | 'ingest_snapshot'
  | 'register_participation'
  | 'write_leaders_version'
  | 'seal'
  | 'append_reward_claim'
  | 'update_phase'
  | 'update_participant';

export interface ContestDomainWriteParams {
  action: ContestDomainWriteAction;
  payload: Record<string, unknown>;
  actorContext?: Record<string, unknown> | null;
}

export interface ContestDomainWriteResult {
  status: 'applied' | 'noop';
  contestId?: string;
}

const CONTEST_STATUS_SET = new Set<ContestStatus>(
  contestStatusEnum.enumValues as readonly ContestStatus[]
);

const cloneJson = <T>(value: T): T => {
  if (value === undefined || value === null) {
    return value;
  }
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDateInput(value: unknown): value is string | Date {
  return typeof value === 'string' || value instanceof Date;
}

function isAmountValue(value: unknown): value is string | number | bigint {
  return (
    typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint'
  );
}

function assertTrackContestPayload(payload: unknown): asserts payload is TrackContestPayload {
  if (!isRecord(payload)) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'track payload must be an object');
  }

  const { chainId, contractAddress, timeWindow, internalKey, status, metadata } = payload;

  if (typeof chainId !== 'number' || Number.isNaN(chainId)) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'track payload requires numeric chainId');
  }

  if (typeof contractAddress !== 'string' || contractAddress.trim().length === 0) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'track payload requires contractAddress');
  }

  if (!isRecord(timeWindow) || !isDateInput(timeWindow.start) || !isDateInput(timeWindow.end)) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'track payload requires valid timeWindow');
  }

  if (internalKey !== undefined && internalKey !== null && typeof internalKey !== 'string') {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'track payload internalKey must be string when provided');
  }

  if (
    status !== undefined
    && (typeof status !== 'string' || !CONTEST_STATUS_SET.has(status as ContestStatus))
  ) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'track payload status is invalid');
  }

  if (metadata !== undefined && !isRecord(metadata)) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'track payload metadata must be an object when provided');
  }
}

function assertSnapshotPayload(payload: unknown): asserts payload is SnapshotPayload {
  if (!isRecord(payload)) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'snapshot payload must be an object');
  }

  const { contestId, cursorHeight, effectiveAt } = payload;

  if (typeof contestId !== 'string' || contestId.trim().length === 0) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'snapshot payload requires contestId');
  }

  if (!isAmountValue(cursorHeight)) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'snapshot payload requires cursorHeight');
  }

  if (!isDateInput(effectiveAt)) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'snapshot payload requires effectiveAt');
  }
}

function assertParticipationPayload(payload: unknown): asserts payload is ParticipationPayload {
  if (!isRecord(payload)) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'participation payload must be an object');
  }

  const { contestId, walletAddress, amountWei, occurredAt, event } = payload;

  if (typeof contestId !== 'string' || contestId.trim().length === 0) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'participation payload requires contestId');
  }

  if (typeof walletAddress !== 'string' || walletAddress.trim().length === 0) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'participation payload requires walletAddress');
  }

  if (!isAmountValue(amountWei)) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'participation payload requires amountWei');
  }

  if (!isDateInput(occurredAt)) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'participation payload requires occurredAt');
  }

  if (!isRecord(event)) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'participation payload requires event metadata');
  }

  const { chainId, txHash, logIndex } = event;
  if (typeof chainId !== 'number' || typeof txHash !== 'string' || typeof logIndex !== 'number') {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'participation event is invalid');
  }
}

function assertLeaderboardPayload(payload: unknown): asserts payload is LeaderboardPayload {
  if (!isRecord(payload)) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'leaderboard payload must be an object');
  }

  const { contestId, version, entries, writtenAt } = payload;

  if (typeof contestId !== 'string' || contestId.trim().length === 0) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'leaderboard payload requires contestId');
  }

  if (!isAmountValue(version)) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'leaderboard payload requires version');
  }

  if (!Array.isArray(entries)) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'leaderboard payload requires entries array');
  }

  if (!isDateInput(writtenAt)) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'leaderboard payload requires writtenAt');
  }
}

function assertSealContestPayload(payload: unknown): asserts payload is SealContestPayload {
  if (!isRecord(payload)) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'seal payload must be an object');
  }

  const { contestId, sealedAt, status } = payload;

  if (typeof contestId !== 'string' || contestId.trim().length === 0) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'seal payload requires contestId');
  }

  if (!isDateInput(sealedAt)) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'seal payload requires sealedAt');
  }

  if (status !== undefined && status !== 'sealed' && status !== 'settled') {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'seal payload status must be sealed or settled when provided');
  }
}

function assertRewardClaimPayload(payload: unknown): asserts payload is RewardClaimPayload {
  if (!isRecord(payload)) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'reward payload must be an object');
  }

  const { contestId, walletAddress, amountWei, claimedAt, event } = payload;

  if (typeof contestId !== 'string' || contestId.trim().length === 0) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'reward payload requires contestId');
  }

  if (typeof walletAddress !== 'string' || walletAddress.trim().length === 0) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'reward payload requires walletAddress');
  }

  if (!isAmountValue(amountWei)) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'reward payload requires amountWei');
  }

  if (!isDateInput(claimedAt)) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'reward payload requires claimedAt');
  }

  if (!isRecord(event)) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'reward payload requires event metadata');
  }

  const { chainId, txHash, logIndex } = event;
  if (typeof chainId !== 'number' || typeof txHash !== 'string' || typeof logIndex !== 'number') {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'reward payload event is invalid');
  }
}

function assertUpdatePhasePayload(payload: unknown): asserts payload is UpdatePhasePayload {
  if (!isRecord(payload)) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'update phase payload must be an object');
  }

  if (typeof payload.contestId !== 'string' || payload.contestId.trim().length === 0) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'update phase payload requires contestId');
  }

  if (typeof payload.phase !== 'string' || payload.phase.trim().length === 0) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'update phase payload requires phase');
  }

  if (payload.status !== undefined && typeof payload.status !== 'string') {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'update phase payload status must be string when provided');
  }
}

function assertUpdateParticipantPayload(payload: unknown): asserts payload is UpdateParticipantPayload {
  if (!isRecord(payload)) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'update participant payload must be an object');
  }

  if (typeof payload.contestId !== 'string' || payload.contestId.trim().length === 0) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'update participant payload requires contestId');
  }

  if (typeof payload.walletAddress !== 'string' || payload.walletAddress.trim().length === 0) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'update participant payload requires walletAddress');
  }

  if (!isRecord(payload.updates)) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'update participant payload requires updates object');
  }
}

export type ContestDomainWriteExecutor = (
  tx: DrizzleTransaction<DbSchema>,
  params: ContestDomainWriteParams
) => Promise<ContestDomainWriteResult>;

export interface TrackContestPayload {
  chainId: number;
  contractAddress: string;
  internalKey?: string | null;
  status?: ContestStatus;
  timeWindow: { start: string | Date; end: string | Date };
  originTag?: ContestOrigin;
  metadata?: Record<string, unknown>;
}

export interface SnapshotPayload {
  contestId: string;
  cursorHeight: bigint | number | string;
  payload: unknown;
  effectiveAt: string | Date;
}

export interface ParticipationPayload {
  contestId: string;
  walletAddress: string;
  vaultReference?: string | null;
  vaultId?: string | null;
  amountWei: string | number | bigint;
  occurredAt: string | Date;
  event: {
    chainId: number;
    txHash: string;
    logIndex: number;
  };
}

export interface LeaderboardPayload {
  contestId: string;
  version: bigint | number | string;
  entries: Array<{ rank: number; walletAddress: string; score?: string | number | bigint }>;
  writtenAt: string | Date;
}

export interface SealContestPayload {
  contestId: string;
  sealedAt: string | Date;
  status?: Extract<ContestStatus, 'sealed' | 'settled'>;
}

export interface RewardClaimPayload {
  contestId: string;
  walletAddress: string;
  amountWei: string | number | bigint;
  claimedAt: string | Date;
  event: {
    chainId: number;
    txHash: string;
    logIndex: number;
  };
}

export interface UpdatePhasePayload {
  contestId: string;
  phase: string;
  status?: Extract<ContestStatus, 'registered' | 'active' | 'sealed' | 'settled'>;
  sealedAt?: string | Date;
}

export interface UpdateParticipantPayload {
  contestId: string;
  walletAddress: string;
  updates: Record<string, unknown>;
}

export interface CursorState {
  status: 'tracked' | 'untracked';
  cursorHeight: string | null;
  cursorLogIndex: number | null;
  cursorHash: string | null;
  updatedAt: Date | null;
  contestId?: string | null;
  chainId?: number | null;
  contractAddress?: string | null;
}

export interface ReadIngestionStatusParams {
  contestId?: string;
  chainId?: number;
  contractAddress?: string;
}

export interface IngestionWriteAdvancePayload {
  contestId?: string;
  chainId: number;
  contractAddress: string;
  cursorHeight: bigint | number | string;
  cursorLogIndex?: number;
  cursorHash?: string | null;
}

export interface IngestionWriteRecordPayload {
  contestId: string;
  chainId: number;
  txHash: string;
  logIndex: number;
  eventType: string;
  occurredAt: string | Date;
}

export type IngestionWriteAction =
  | { action: 'advance_cursor'; payload: IngestionWriteAdvancePayload; actorContext?: Record<string, unknown> | null }
  | { action: 'record_event'; payload: IngestionWriteRecordPayload; actorContext?: Record<string, unknown> | null };

export interface IngestionWriteResult {
  status: 'applied' | 'noop';
  cursorHeight?: string;
  cursorLogIndex?: number;
  cursorHash?: string | null;
}

export const writeContestDomain: ContestDomainWriteExecutor = async (tx, params) => {
  switch (params.action) {
    case 'track': {
      const payload = params.payload;
      assertTrackContestPayload(payload);
      return trackContest(tx, payload, params.actorContext ?? null);
    }
    case 'ingest_snapshot': {
      const payload = params.payload;
      assertSnapshotPayload(payload);
      return ingestSnapshot(tx, payload, params.actorContext ?? null);
    }
    case 'register_participation': {
      const payload = params.payload;
      assertParticipationPayload(payload);
      return registerParticipation(tx, payload, params.actorContext ?? null);
    }
    case 'write_leaders_version': {
      const payload = params.payload;
      assertLeaderboardPayload(payload);
      return writeLeaderboardVersion(tx, payload, params.actorContext ?? null);
    }
    case 'seal': {
      const payload = params.payload;
      assertSealContestPayload(payload);
      return sealContest(tx, payload, params.actorContext ?? null);
    }
    case 'append_reward_claim': {
      const payload = params.payload;
      assertRewardClaimPayload(payload);
      return appendRewardClaim(tx, payload, params.actorContext ?? null);
    }
    case 'update_phase': {
      const payload = params.payload;
      assertUpdatePhasePayload(payload);
      return updateContestPhase(tx, payload, params.actorContext ?? null);
    }
    case 'update_participant': {
      const payload = params.payload;
      assertUpdateParticipantPayload(payload);
      return updateParticipantMetadata(tx, payload, params.actorContext ?? null);
    }
    default:
      throw new DbError(DbErrorCode.INPUT_INVALID, `Unsupported contest domain action "${params.action}"`, {
        detail: {
          reason: 'unsupported_action',
          context: { action: params.action }
        }
      });
  }
};

export async function readIngestionStatus(
  db: DrizzleDatabase<DbSchema>,
  params: ReadIngestionStatusParams
): Promise<CursorState> {
  if (!params.contestId && !(params.chainId && params.contractAddress)) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'Ingestion status request requires contestId or chain locator', {
      detail: { reason: 'missing_locator' }
    });
  }

  const normalizedAddress = params.contractAddress ? normalizeAddress(params.contractAddress) : null;

  const cursorRow = await db
    .select({
      id: ingestionCursors.id,
      contestId: ingestionCursors.contestId,
      chainId: ingestionCursors.chainId,
      contractAddress: ingestionCursors.contractAddress,
      cursorHeight: ingestionCursors.cursorHeight,
      cursorLogIndex: ingestionCursors.cursorLogIndex,
      cursorHash: ingestionCursors.cursorHash,
      updatedAt: ingestionCursors.updatedAt
    })
    .from(ingestionCursors)
    .where(
      params.contestId
        ? eq(ingestionCursors.contestId, params.contestId)
        : and(eq(ingestionCursors.chainId, params.chainId!), eq(ingestionCursors.contractAddress, normalizedAddress!))
    )
    .limit(1);

  if (cursorRow.length === 0) {
    return {
      status: 'untracked',
      cursorHeight: null,
      cursorLogIndex: null,
      cursorHash: null,
      updatedAt: null,
      contestId: params.contestId ?? null,
      chainId: params.chainId ?? null,
      contractAddress: normalizedAddress ?? null
    };
  }

  const row = cursorRow[0]!;
  return {
    status: 'tracked',
    cursorHeight: row.cursorHeight.toString(),
    cursorLogIndex: row.cursorLogIndex ?? 0,
    cursorHash: row.cursorHash ?? null,
    updatedAt: row.updatedAt,
    contestId: row.contestId,
    chainId: row.chainId,
    contractAddress: row.contractAddress
  };
}

export async function writeIngestionEvent(
  tx: DrizzleTransaction<DbSchema>,
  request: IngestionWriteAction
): Promise<IngestionWriteResult> {
  switch (request.action) {
    case 'advance_cursor':
      return advanceCursor(tx, request.payload, request.actorContext ?? null);
    case 'record_event':
      return recordEvent(tx, request.payload, request.actorContext ?? null);
    default:
      throw new DbError(DbErrorCode.INPUT_INVALID, `Unsupported ingestion action "${(request as IngestionWriteAction).action}"`, {
        detail: { reason: 'unsupported_action', context: { action: (request as IngestionWriteAction).action } }
      });
  }
}

async function trackContest(
  tx: DrizzleTransaction<DbSchema>,
  payload: TrackContestPayload,
  actorContext: Record<string, unknown> | null
): Promise<ContestDomainWriteResult> {
  const chainId = ensurePositiveInteger(payload.chainId, 'chainId');
  const contractAddress = normalizeAddress(payload.contractAddress);
  const internalKey = payload.internalKey?.trim() || null;
  const status = coerceContestStatus(payload.status ?? 'registered');
  const originTag = coerceContestOrigin(payload.originTag ?? contestOriginEnum.enumValues[0]!);
  const windowStart = coerceDate(payload.timeWindow?.start, 'timeWindow.start');
  const windowEnd = coerceDate(payload.timeWindow?.end, 'timeWindow.end');

  if (windowStart > windowEnd) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'Contest time window must not be inverted', {
      detail: {
        reason: 'time_window_invalid',
        context: { start: windowStart.toISOString(), end: windowEnd.toISOString() }
      }
    });
  }

  const actor = resolveActor(actorContext);

  const existing = await findContestByIdentifiers(tx, internalKey, chainId, contractAddress);

  if (!existing) {
    const [inserted] = await tx
      .insert(contests)
      .values({
        id: randomUUID(),
        chainId,
        contractAddress,
        internalKey,
        status,
        timeWindowStart: windowStart,
        timeWindowEnd: windowEnd,
        originTag,
        metadata: payload.metadata ?? {},
        createdBy: actor,
        updatedBy: actor
      })
      .returning({ id: contests.id });

    if (!inserted) {
      throw new Error('Failed to insert contest record during track action.');
    }

    return { status: 'applied', contestId: inserted.id };
  }

  const updates: Partial<typeof contests.$inferInsert> = {};
  if (existing.status !== status) {
    updates.status = status;
  }
  if (existing.originTag !== originTag) {
    updates.originTag = originTag;
  }
  if (existing.timeWindowStart.getTime() !== windowStart.getTime() || existing.timeWindowEnd.getTime() !== windowEnd.getTime()) {
    updates.timeWindowStart = windowStart;
    updates.timeWindowEnd = windowEnd;
  }
  const currentMetadata = (existing.metadata ?? {}) as Record<string, unknown>;
  if (payload.metadata && !deepEquals(currentMetadata, payload.metadata)) {
    updates.metadata = payload.metadata;
  }

  if (Object.keys(updates).length === 0) {
    return { status: 'noop', contestId: existing.id };
  }

  updates.updatedBy = actor;

  await tx
    .update(contests)
    .set(updates)
    .where(eq(contests.id, existing.id));

  return { status: 'applied', contestId: existing.id };
}

async function ingestSnapshot(
  tx: DrizzleTransaction<DbSchema>,
  payload: SnapshotPayload,
  actorContext: Record<string, unknown> | null
): Promise<ContestDomainWriteResult> {
  const contestId = ensureUuid(payload.contestId, 'contestId');
  const cursorHeight = coerceBigInt(payload.cursorHeight, 'cursorHeight');
  const effectiveAt = coerceDate(payload.effectiveAt, 'effectiveAt');
  const actor = resolveActor(actorContext);

  try {
    await tx.insert(contestSnapshots).values({
      id: randomUUID(),
      contestId,
      cursorHeight,
      payload: payload.payload ?? {},
      effectiveAt,
      createdBy: actor,
      updatedBy: actor
    });
    return { status: 'applied', contestId };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { status: 'noop', contestId };
    }
    throw error;
  }
}

async function registerParticipation(
  tx: DrizzleTransaction<DbSchema>,
  payload: ParticipationPayload,
  actorContext: Record<string, unknown> | null
): Promise<ContestDomainWriteResult> {
  const contestId = ensureUuid(payload.contestId, 'contestId');
  const walletAddress = normalizeAddress(payload.walletAddress);
  const amount = coerceNumericString(payload.amountWei, 'amountWei');
  const occurredAt = coerceDate(payload.occurredAt, 'occurredAt');
  const actor = resolveActor(actorContext);

  validateEventLocator(payload.event);

  const applyMetadataUpdate = async (): Promise<void> => {
    const [countRow] = await tx
      .select({ value: sql<number>`count(*)` })
      .from(participants)
      .where(eq(participants.contestId, contestId));
    const registeredCount = Number(countRow?.value ?? 0);

    const contestRecord = await tx.query.contests.findFirst({
      where: eq(contests.id, contestId)
    });

    if (!contestRecord) {
      return;
    }

    const metadataSource = cloneJson(contestRecord.metadata ?? {});
    const metadata = isRecord(metadataSource) ? metadataSource : {};

    const updateCapacity = (candidate: unknown): Record<string, unknown> => {
      const capacity = isRecord(candidate) ? { ...(candidate as Record<string, unknown>) } : {};
      const readInteger = (input: unknown): number => {
        if (typeof input === 'number' && Number.isFinite(input)) {
          return Math.trunc(input);
        }
        if (typeof input === 'bigint') {
          return Number(input);
        }
        if (typeof input === 'string' && input.trim().length > 0) {
          const parsed = Number.parseInt(input, 10);
          return Number.isFinite(parsed) ? parsed : 0;
        }
        return 0;
      };

      const maximum = readInteger(capacity.maximum);
      capacity.maximum = maximum;
      capacity.registered = registeredCount;
      capacity.isFull = maximum > 0 ? registeredCount >= maximum : Boolean(capacity.isFull);
      return capacity;
    };

    const participantKey = walletAddress;
    const updateParticipantsMetadata = (container: unknown): Record<string, unknown> => {
        const registry = isRecord(container) ? { ...(container as Record<string, unknown>) } : {};
        const currentEntry = isRecord(registry[participantKey])
          ? { ...(registry[participantKey] as Record<string, unknown>) }
          : {};
        currentEntry.address = walletAddress;
        currentEntry.registered = true;
        currentEntry.amount = amount;
        currentEntry.lastRegisteredAt = occurredAt.toISOString();
        if (payload.vaultReference) {
          currentEntry.vaultReference = payload.vaultReference;
        }
        if (payload.vaultId) {
          currentEntry.vaultId = payload.vaultId;
        }
        registry[participantKey] = currentEntry;
        return registry;
      };

    metadata.registrationCapacity = updateCapacity(metadata.registrationCapacity);
    metadata.participants = updateParticipantsMetadata(metadata.participants);

    const gatewayDefinition = isRecord(metadata.chainGatewayDefinition)
      ? { ...(metadata.chainGatewayDefinition as Record<string, unknown>) }
      : null;

    if (gatewayDefinition) {
      gatewayDefinition.registrationCapacity = updateCapacity(gatewayDefinition.registrationCapacity);
      gatewayDefinition.participants = updateParticipantsMetadata(gatewayDefinition.participants);
      metadata.chainGatewayDefinition = gatewayDefinition;
    }

    await tx
      .update(contests)
      .set({
        metadata,
        updatedBy: actor
      })
      .where(eq(contests.id, contestId));
  };

  try {
    await tx.insert(participants).values({
      id: randomUUID(),
      contestId,
      walletAddress,
      vaultReference: payload.vaultReference ?? null,
      amountWei: amount,
      eventLocator: buildEventLocator(payload.event),
      occurredAt,
      createdBy: actor,
      updatedBy: actor
    });

    await applyMetadataUpdate();

    return { status: 'applied', contestId };
  } catch (error) {
    if (isUniqueViolation(error)) {
      await applyMetadataUpdate();
      return { status: 'noop', contestId };
    }
    throw error;
  }
}

async function writeLeaderboardVersion(
  tx: DrizzleTransaction<DbSchema>,
  payload: LeaderboardPayload,
  actorContext: Record<string, unknown> | null
): Promise<ContestDomainWriteResult> {
  const contestId = ensureUuid(payload.contestId, 'contestId');
  const version = coerceBigInt(payload.version, 'version');
  const writtenAt = coerceDate(payload.writtenAt, 'writtenAt');
  const actor = resolveActor(actorContext);

  const latest = await tx
    .select({ version: leaderboardVersions.version })
    .from(leaderboardVersions)
    .where(eq(leaderboardVersions.contestId, contestId))
    .orderBy(desc(leaderboardVersions.version))
    .limit(1);

  if (latest.length > 0 && version < latest[0]!.version) {
    throw new DbError(DbErrorCode.ORDER_VIOLATION, 'Leaderboard version must increase monotonically', {
      detail: {
        reason: 'non_monotonic_version',
        context: { contestId, attempted: version.toString(), current: latest[0]!.version.toString() }
      }
    });
  }

  try {
    await tx.insert(leaderboardVersions).values({
      id: randomUUID(),
      contestId,
      version,
      entries: payload.entries.map((entry) => ({
        rank: entry.rank,
        walletAddress: normalizeAddress(entry.walletAddress),
        score: entry.score !== undefined ? entry.score.toString() : undefined
      })),
      writtenAt,
      createdBy: actor,
      updatedBy: actor
    });
    return { status: 'applied', contestId };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { status: 'noop', contestId };
    }
    throw error;
  }
}

async function sealContest(
  tx: DrizzleTransaction<DbSchema>,
  payload: SealContestPayload,
  actorContext: Record<string, unknown> | null
): Promise<ContestDomainWriteResult> {
  const contestId = ensureUuid(payload.contestId, 'contestId');
  const sealedAt = coerceDate(payload.sealedAt, 'sealedAt');
  const status = payload.status ?? 'sealed';
  const actor = resolveActor(actorContext);

  if (!['sealed', 'settled'].includes(status)) {
    throw new DbError(DbErrorCode.INPUT_INVALID, `Unsupported sealed status "${status}"`, {
      detail: { reason: 'unsupported_status', context: { status } }
    });
  }

  const current = await tx.query.contests.findFirst({ where: eq(contests.id, contestId) });
  if (!current) {
    throw new DbError(DbErrorCode.NOT_FOUND, `Contest ${contestId} not found`, {
      detail: { reason: 'contest_not_found', context: { contestId } }
    });
  }

  if (sealedAt < current.timeWindowStart) {
    throw new DbError(DbErrorCode.ORDER_VIOLATION, 'Seal time cannot precede contest window start', {
      detail: {
        reason: 'seal_before_window_start',
        context: { sealedAt: sealedAt.toISOString(), windowStart: current.timeWindowStart.toISOString() }
      }
    });
  }

  if (sealedAt < current.timeWindowEnd) {
    throw new DbError(DbErrorCode.ORDER_VIOLATION, 'Seal time cannot precede contest window end', {
      detail: {
        reason: 'seal_before_window_end',
        context: { sealedAt: sealedAt.toISOString(), windowEnd: current.timeWindowEnd.toISOString() }
      }
    });
  }

  if (current.sealedAt && current.sealedAt.getTime() >= sealedAt.getTime() && current.status === status) {
    return { status: 'noop', contestId };
  }

  await tx
    .update(contests)
    .set({
      status,
      sealedAt,
      updatedBy: actor
    })
    .where(eq(contests.id, contestId));

  return { status: 'applied', contestId };
}

async function appendRewardClaim(
  tx: DrizzleTransaction<DbSchema>,
  payload: RewardClaimPayload,
  actorContext: Record<string, unknown> | null
): Promise<ContestDomainWriteResult> {
  const contestId = ensureUuid(payload.contestId, 'contestId');
  const walletAddress = normalizeAddress(payload.walletAddress);
  const amount = coerceNumericString(payload.amountWei, 'amountWei');
  const claimedAt = coerceDate(payload.claimedAt, 'claimedAt');
  const actor = resolveActor(actorContext);

  validateEventLocator(payload.event);

  try {
    await tx.insert(rewardClaims).values({
      id: randomUUID(),
      contestId,
      walletAddress,
      amountWei: amount,
      eventLocator: buildEventLocator(payload.event),
      claimedAt,
      createdBy: actor,
      updatedBy: actor
    });
    return { status: 'applied', contestId };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { status: 'noop', contestId };
    }
    throw error;
  }
}

async function updateContestPhase(
  tx: DrizzleTransaction<DbSchema>,
  payload: UpdatePhasePayload,
  actorContext: Record<string, unknown> | null
): Promise<ContestDomainWriteResult> {
  const contestId = ensureUuid(payload.contestId, 'contestId');
  const phase = payload.phase ?? '';
  if (phase.length === 0) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'update_phase payload requires phase', {
      detail: { reason: 'phase_missing', context: { contestId } }
    });
  }

  const contest = await tx.query.contests.findFirst({ where: eq(contests.id, contestId) });
  if (!contest) {
    throw new DbError(DbErrorCode.NOT_FOUND, `Contest ${contestId} not found`, {
      detail: { reason: 'contest_not_found', context: { contestId } }
    });
  }

  const actor = resolveActor(actorContext);
  const metadataSource = cloneJson(contest.metadata ?? {});
  const metadata = isRecord(metadataSource) ? metadataSource : {};

  metadata.phase = phase;

  const gateway = isRecord(metadata.chainGatewayDefinition)
    ? { ...(metadata.chainGatewayDefinition as Record<string, unknown>) }
    : {};
  gateway.phase = phase;
  metadata.chainGatewayDefinition = gateway;

  const updates: Partial<typeof contests.$inferInsert> = {
    metadata,
    updatedBy: actor
  };

  if (payload.status && contest.status !== payload.status) {
    updates.status = payload.status;
  }

  if (payload.sealedAt) {
    const sealedAt = coerceDate(payload.sealedAt, 'sealedAt');
    updates.sealedAt = sealedAt;
  }

  await tx
    .update(contests)
    .set(updates)
    .where(eq(contests.id, contestId));

  return { status: 'applied', contestId };
}

async function updateParticipantMetadata(
  tx: DrizzleTransaction<DbSchema>,
  payload: UpdateParticipantPayload,
  actorContext: Record<string, unknown> | null
): Promise<ContestDomainWriteResult> {
  const contestId = ensureUuid(payload.contestId, 'contestId');
  const walletAddress = normalizeAddress(payload.walletAddress);
  const updatesPatch = payload.updates ?? {};

  const contest = await tx.query.contests.findFirst({ where: eq(contests.id, contestId) });
  if (!contest) {
    throw new DbError(DbErrorCode.NOT_FOUND, `Contest ${contestId} not found`, {
      detail: { reason: 'contest_not_found', context: { contestId } }
    });
  }

  const actor = resolveActor(actorContext);
  const metadataSource = cloneJson(contest.metadata ?? {});
  const metadata = isRecord(metadataSource) ? metadataSource : {};

  const participantKey = walletAddress;
  const applyPatch = (container: unknown): Record<string, unknown> => {
    const registry = isRecord(container) ? { ...(container as Record<string, unknown>) } : {};
    let currentEntry: Record<string, unknown>;
    if (isRecord(registry[participantKey])) {
      currentEntry = { ...(registry[participantKey] as Record<string, unknown>) };
    } else {
      currentEntry = { address: walletAddress };
    }
    currentEntry.address = walletAddress;
    Object.entries(updatesPatch).forEach(([key, value]) => {
      currentEntry[key] = value;
    });
    registry[participantKey] = currentEntry;
    return registry;
  };

  metadata.participants = applyPatch(metadata.participants);

  const gateway = isRecord(metadata.chainGatewayDefinition)
    ? { ...(metadata.chainGatewayDefinition as Record<string, unknown>) }
    : {};
  gateway.participants = applyPatch(gateway.participants);
  metadata.chainGatewayDefinition = gateway;

  await tx
    .update(contests)
    .set({
      metadata,
      updatedBy: actor
    })
    .where(eq(contests.id, contestId));

  return { status: 'applied', contestId };
}

async function advanceCursor(
  tx: DrizzleTransaction<DbSchema>,
  payload: IngestionWriteAdvancePayload,
  actorContext: Record<string, unknown> | null
): Promise<IngestionWriteResult> {
  const chainId = ensurePositiveInteger(payload.chainId, 'chainId');
  const contractAddress = normalizeAddress(payload.contractAddress);
  const actor = resolveActor(actorContext);
  const cursorHeight = coerceBigInt(payload.cursorHeight, 'cursorHeight');
  const cursorLogIndex = ensureNonNegativeInteger(payload.cursorLogIndex ?? 0, 'cursorLogIndex');
  const cursorHash = payload.cursorHash ?? null;

  let contestId = payload.contestId ?? null;
  if (!contestId) {
    const contest = await tx
      .select({ id: contests.id })
      .from(contests)
      .where(and(eq(contests.chainId, chainId), eq(contests.contractAddress, contractAddress)))
      .limit(1);

    contestId = contest.length > 0 ? contest[0]!.id : null;
  }

  if (!contestId) {
    throw new DbError(DbErrorCode.NOT_FOUND, 'Contest not tracked for cursor advance', {
      detail: { reason: 'contest_not_found', context: { chainId, contractAddress } }
    });
  }

  const current = await tx
    .select({
      id: ingestionCursors.id,
      cursorHeight: ingestionCursors.cursorHeight,
      cursorLogIndex: ingestionCursors.cursorLogIndex
    })
    .from(ingestionCursors)
    .where(eq(ingestionCursors.contestId, contestId))
    .limit(1);

  if (current.length === 0) {
    await tx.insert(ingestionCursors).values({
      id: randomUUID(),
      contestId,
      chainId,
      contractAddress,
      cursorHeight,
      cursorLogIndex,
      cursorHash,
      createdBy: actor,
      updatedBy: actor
    });
    return { status: 'applied', cursorHeight: cursorHeight.toString(), cursorLogIndex, cursorHash };
  }

  const existing = current[0]!;
  if (cursorHeight < existing.cursorHeight) {
    throw new DbError(DbErrorCode.ORDER_VIOLATION, 'Cursor height must not regress', {
      detail: {
        reason: 'cursor_height_regressed',
        context: { current: existing.cursorHeight.toString(), attempted: cursorHeight.toString() }
      }
    });
  }

  if (cursorHeight === existing.cursorHeight) {
    if (cursorLogIndex <= (existing.cursorLogIndex ?? 0)) {
      throw new DbError(DbErrorCode.ORDER_VIOLATION, 'Cursor log index must strictly increase for identical heights', {
        detail: {
          reason: 'cursor_not_monotonic',
          context: {
            currentHeight: existing.cursorHeight.toString(),
            currentLogIndex: existing.cursorLogIndex ?? 0,
            attemptedHeight: cursorHeight.toString(),
            attemptedLogIndex: cursorLogIndex
          }
        }
      });
    }
  }

  const nextCursor = {
    cursorHeight,
    cursorLogIndex,
    cursorHash,
    updatedBy: actor
  };

  await tx
    .update(ingestionCursors)
    .set(nextCursor)
    .where(eq(ingestionCursors.id, existing.id));

  return {
    status: 'applied',
    cursorHeight: cursorHeight.toString(),
    cursorLogIndex,
    cursorHash
  };
}

async function recordEvent(
  tx: DrizzleTransaction<DbSchema>,
  payload: IngestionWriteRecordPayload,
  actorContext: Record<string, unknown> | null
): Promise<IngestionWriteResult> {
  const contestId = ensureUuid(payload.contestId, 'contestId');
  const chainId = ensurePositiveInteger(payload.chainId, 'chainId');
  const txHash = normalizeTxHash(payload.txHash);
  const logIndex = ensureNonNegativeInteger(payload.logIndex, 'logIndex');
  const eventType = payload.eventType?.trim();
  const occurredAt = coerceDate(payload.occurredAt, 'occurredAt');
  const actor = resolveActor(actorContext);

  if (!eventType) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'Event type must be provided', {
      detail: { reason: 'event_type_required' }
    });
  }

  try {
    await tx.insert(ingestionEvents).values({
      id: randomUUID(),
      contestId,
      chainId,
      txHash,
      logIndex,
      eventType,
      occurredAt,
      createdBy: actor,
      updatedBy: actor
    });
    return { status: 'applied' };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { status: 'noop' };
    }
    throw error;
  }
}

async function findContestByIdentifiers(
  tx: DrizzleTransaction<DbSchema>,
  internalKey: string | null,
  chainId: number,
  contractAddress: string
) {
  if (internalKey) {
    const byKey = await tx.query.contests.findFirst({ where: eq(contests.internalKey, internalKey) });
    if (byKey) {
      return byKey;
    }
  }

  return tx
    .select({
      id: contests.id,
      status: contests.status,
      originTag: contests.originTag,
      timeWindowStart: contests.timeWindowStart,
      timeWindowEnd: contests.timeWindowEnd,
      metadata: contests.metadata,
      sealedAt: contests.sealedAt
    })
    .from(contests)
    .where(and(eq(contests.chainId, chainId), eq(contests.contractAddress, contractAddress)))
    .limit(1)
    .then((rows) => (rows.length > 0 ? rows[0]! : null));
}

function resolveActor(context: Record<string, unknown> | null | undefined): string | null {
  if (!context) {
    return null;
  }

  const candidateKeys = ['actorId', 'userId', 'service', 'source'];
  for (const key of candidateKeys) {
    const value = context[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  try {
    const serialized = JSON.stringify(context);
    return serialized.length > 0 ? serialized : null;
  } catch {
    return null;
  }
}

function normalizeAddress(value: string): string {
  if (!value || typeof value !== 'string') {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'Wallet or contract address must be provided');
  }

  const trimmed = value.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    throw new DbError(DbErrorCode.INPUT_INVALID, `Invalid address format: ${value}`, {
      detail: { reason: 'invalid_address', context: { value } }
    });
  }

  return trimmed.toLowerCase();
}

function normalizeTxHash(value: string): string {
  if (!value || typeof value !== 'string') {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'Transaction hash must be provided');
  }
  const trimmed = value.trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(trimmed)) {
    throw new DbError(DbErrorCode.INPUT_INVALID, `Invalid transaction hash: ${value}`, {
      detail: { reason: 'invalid_tx_hash', context: { value } }
    });
  }
  return trimmed.toLowerCase();
}

function ensurePositiveInteger(value: unknown, field: string): number {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new DbError(DbErrorCode.INPUT_INVALID, `${field} must be a positive integer`, {
      detail: { reason: 'invalid_integer', context: { field, value } }
    });
  }
  return numberValue;
}

function ensureNonNegativeInteger(value: unknown, field: string): number {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 0) {
    throw new DbError(DbErrorCode.INPUT_INVALID, `${field} must be a non-negative integer`, {
      detail: { reason: 'invalid_integer', context: { field, value } }
    });
  }
  return numberValue;
}

function coerceDate(value: unknown, field: string): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new DbError(DbErrorCode.INPUT_INVALID, `${field} must be a valid date`, {
        detail: { reason: 'invalid_date', context: { field } }
      });
    }
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new DbError(DbErrorCode.INPUT_INVALID, `${field} must be a valid date`, {
        detail: { reason: 'invalid_date', context: { field, value } }
      });
    }
    return date;
  }

  throw new DbError(DbErrorCode.INPUT_INVALID, `${field} must be a valid date`, {
    detail: { reason: 'invalid_date', context: { field, value } }
  });
}

function coerceBigInt(value: unknown, field: string): bigint {
  try {
    if (typeof value === 'bigint') {
      return value;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || !Number.isInteger(value)) {
        throw new Error('not integer');
      }
      return BigInt(value);
    }
    if (typeof value === 'string') {
      if (value.trim().length === 0) {
        throw new Error('empty string');
      }
      return BigInt(value.trim());
    }
  } catch (error) {
    throw new DbError(DbErrorCode.INPUT_INVALID, `${field} must be a numeric value`, {
      detail: { reason: 'invalid_bigint', context: { field, value } },
      cause: error
    });
  }

  throw new DbError(DbErrorCode.INPUT_INVALID, `${field} must be a numeric value`, {
    detail: { reason: 'invalid_bigint', context: { field, value } }
  });
}

function coerceNumericString(value: unknown, field: string): string {
  if (typeof value === 'string') {
    if (!/^-?\d+$/.test(value.trim())) {
      throw new DbError(DbErrorCode.INPUT_INVALID, `${field} must be an integer string`, {
        detail: { reason: 'invalid_numeric_string', context: { field, value } }
      });
    }
    if (value.trim().startsWith('-')) {
      throw new DbError(DbErrorCode.INPUT_INVALID, `${field} must be non-negative`, {
        detail: { reason: 'negative_amount', context: { field, value } }
      });
    }
    return value.trim();
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      throw new DbError(DbErrorCode.INPUT_INVALID, `${field} must be a non-negative integer`, {
        detail: { reason: 'invalid_amount', context: { field, value } }
      });
    }
    return Math.trunc(value).toString();
  }

  if (typeof value === 'bigint') {
    if (value < 0n) {
      throw new DbError(DbErrorCode.INPUT_INVALID, `${field} must be non-negative`, {
        detail: { reason: 'invalid_amount', context: { field, value } }
      });
    }
    return value.toString();
  }

  throw new DbError(DbErrorCode.INPUT_INVALID, `${field} must be a numeric value`, {
    detail: { reason: 'invalid_amount', context: { field, value } }
  });
}

function ensureUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[0-9a-fA-F-]{36}$/.test(value)) {
    throw new DbError(DbErrorCode.INPUT_INVALID, `${field} must be a UUID`, {
      detail: { reason: 'invalid_uuid', context: { field, value } }
    });
  }
  return value;
}

function validateEventLocator(locator: ParticipationPayload['event']) {
  if (!locator || typeof locator !== 'object') {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'Event locator must be provided', {
      detail: { reason: 'event_locator_missing' }
    });
  }
  ensurePositiveInteger(locator.chainId, 'event.chainId');
  normalizeTxHash(locator.txHash);
  ensureNonNegativeInteger(locator.logIndex, 'event.logIndex');
}

function buildEventLocator(locator: ParticipationPayload['event']) {
  return {
    chain_id: ensurePositiveInteger(locator.chainId, 'event.chainId'),
    tx_hash: normalizeTxHash(locator.txHash),
    log_index: ensureNonNegativeInteger(locator.logIndex, 'event.logIndex')
  };
}

function coerceContestStatus(status: string): ContestStatus {
  if (!contestStatusEnum.enumValues.includes(status as ContestStatus)) {
    throw new DbError(DbErrorCode.INPUT_INVALID, `Unsupported contest status "${status}"`, {
      detail: { reason: 'invalid_status', context: { status } }
    });
  }
  return status as ContestStatus;
}

function coerceContestOrigin(origin: string): ContestOrigin {
  if (!contestOriginEnum.enumValues.includes(origin as ContestOrigin)) {
    throw new DbError(DbErrorCode.INPUT_INVALID, `Unsupported contest origin "${origin}"`, {
      detail: { reason: 'invalid_origin', context: { origin } }
    });
  }
  return origin as ContestOrigin;
}

function deepEquals(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const directCode = (error as { code?: string }).code;
  const causeCode = (error as { cause?: { code?: string } }).cause?.code;
  return directCode === '23505' || causeCode === '23505';
}
