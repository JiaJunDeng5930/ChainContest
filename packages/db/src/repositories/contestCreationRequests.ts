import { and, desc, eq, sql } from 'drizzle-orm';
import type { DrizzleDatabase } from '../adapters/connection.js';
import {
  contestCreationRequests,
  contestDeploymentArtifacts,
  type ContestCreationRequest,
  type ContestDeploymentArtifact,
  type DbSchema
} from '../schema/index.js';
import { normalizeDeploymentArtifact } from './contestDeploymentArtifacts.js';

interface CursorPayload {
  createdAt: string;
  requestId: string;
}

export interface CreateContestCreationRequestParams {
  userId: string;
  networkId: number;
  payload: Record<string, unknown>;
}

export interface ContestCreationRequestAggregate {
  request: ContestCreationRequest;
  artifact: ContestDeploymentArtifact | null;
  status: 'accepted' | 'deployed';
}

export interface GetContestCreationRequestResult extends ContestCreationRequestAggregate {}

export interface ListContestCreationRequestsParams {
  userId: string;
  networkId?: number;
  pagination?: {
    pageSize?: number;
    cursor?: string | null;
  };
}

export interface ListContestCreationRequestsResponse {
  items: ContestCreationRequestAggregate[];
  nextCursor: string | null;
}

const PAGE_SIZE_DEFAULT = 25;
const PAGE_SIZE_MAX = 100;

const encodeCursor = (payload: CursorPayload): string =>
  Buffer.from(`${payload.createdAt}::${payload.requestId}`, 'utf8').toString('base64url');

const decodeCursor = (cursor: string): CursorPayload | null => {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const [createdAt, requestId] = decoded.split('::');
    if (!createdAt || !requestId) {
      return null;
    }
    return { createdAt, requestId };
  } catch {
    return null;
  }
};

const applyCursorCondition = (cursor: CursorPayload) => {
  return sql`${contestCreationRequests.createdAt} < ${cursor.createdAt} OR (${contestCreationRequests.createdAt} = ${cursor.createdAt} AND ${contestCreationRequests.id} < ${cursor.requestId})`;
};

const normalizeRequest = (record: ContestCreationRequest): ContestCreationRequest => ({
  ...record,
  userId: record.userId.trim(),
  networkId: record.networkId,
  payload: record.payload ?? {},
  createdAt: new Date(record.createdAt),
  updatedAt: new Date(record.updatedAt)
});

export const toContestCreationAggregate = (
  request: ContestCreationRequest,
  artifact: ContestDeploymentArtifact | null
): ContestCreationRequestAggregate => {
  const normalizedRequest = normalizeRequest(request);
  const normalizedArtifact = normalizeDeploymentArtifact(artifact);
  const status: ContestCreationRequestAggregate['status'] = normalizedArtifact?.contestId ? 'deployed' : 'accepted';
  return {
    request: normalizedRequest,
    artifact: normalizedArtifact,
    status
  };
};

export const createContestCreationRequestRecord = async (
  db: DrizzleDatabase<DbSchema>,
  params: CreateContestCreationRequestParams
): Promise<ContestCreationRequestAggregate> => {
  const [inserted] = await db
    .insert(contestCreationRequests)
    .values({
      userId: params.userId.trim(),
      networkId: params.networkId,
      payload: params.payload ?? {}
    })
    .returning();

  if (!inserted) {
    throw new Error('Failed to insert contest creation request record.');
  }

  return toContestCreationAggregate(inserted, null);
};

export const getContestCreationRequestRecord = async (
  db: DrizzleDatabase<DbSchema>,
  requestId: string
): Promise<GetContestCreationRequestResult | null> => {
  const [row] = await db
    .select({ request: contestCreationRequests, artifact: contestDeploymentArtifacts })
    .from(contestCreationRequests)
    .leftJoin(
      contestDeploymentArtifacts,
      eq(contestDeploymentArtifacts.requestId, contestCreationRequests.id)
    )
    .where(eq(contestCreationRequests.id, requestId))
    .limit(1);

  if (!row) {
    return null;
  }

  return toContestCreationAggregate(row.request, row.artifact ?? null);
};

export const listContestCreationRequestsRecords = async (
  db: DrizzleDatabase<DbSchema>,
  params: ListContestCreationRequestsParams
): Promise<ListContestCreationRequestsResponse> => {
  const normalizedUserId = params.userId.trim();
  const pageSize = Math.max(1, Math.min(params.pagination?.pageSize ?? PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX));
  const cursorPayload = params.pagination?.cursor ? decodeCursor(params.pagination.cursor) : null;

  const conditions = [eq(contestCreationRequests.userId, normalizedUserId)];
  if (params.networkId !== undefined) {
    conditions.push(eq(contestCreationRequests.networkId, params.networkId));
  }
  if (cursorPayload) {
    conditions.push(applyCursorCondition(cursorPayload));
  }

  const baseQuery = db
    .select({ request: contestCreationRequests, artifact: contestDeploymentArtifacts })
    .from(contestCreationRequests)
    .leftJoin(
      contestDeploymentArtifacts,
      eq(contestDeploymentArtifacts.requestId, contestCreationRequests.id)
    )
    .orderBy(desc(contestCreationRequests.createdAt), desc(contestCreationRequests.id))
    .limit(pageSize + 1);

  const filteredQuery =
    conditions.length === 1
      ? baseQuery.where(conditions[0]!)
      : baseQuery.where(and(...conditions));

  const rows = await filteredQuery;

  const hasNext = rows.length > pageSize;
  const items = rows
    .slice(0, pageSize)
    .map((row) => toContestCreationAggregate(row.request, row.artifact ?? null));

  let nextCursor: string | null = null;
  if (hasNext) {
    const cursorRow = rows[pageSize];
    if (!cursorRow) {
      throw new Error('Pagination invariant violated: expected cursor row when additional pages exist.');
    }
    nextCursor = encodeCursor({
      createdAt: cursorRow.request.createdAt.toISOString(),
      requestId: cursorRow.request.id
    });
  }

  return {
    items,
    nextCursor
  };
};
