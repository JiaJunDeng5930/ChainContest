import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import type { DrizzleDatabase } from '../adapters/connection.js';
import { organizerComponents, type OrganizerComponent, type DbSchema } from '../schema/index.js';

export type OrganizerComponentType = 'vault_implementation' | 'price_source';
export type OrganizerComponentStatus = 'pending' | 'confirmed' | 'failed';

export interface RegisterOrganizerComponentParams {
  userId: string;
  walletAddress: string;
  networkId: number;
  componentType: OrganizerComponentType;
  contractAddress: string;
  config: Record<string, unknown>;
  transactionHash?: string | null;
  status?: OrganizerComponentStatus;
  failureReason?: Record<string, unknown> | null;
  confirmedAt?: Date | null;
}

export interface RegisterOrganizerComponentResult {
  component: OrganizerComponent;
  created: boolean;
}

export interface ListOrganizerComponentsParams {
  userId: string;
  networkId?: number;
  componentType?: OrganizerComponentType;
  statuses?: OrganizerComponentStatus[];
  pagination?: {
    pageSize?: number;
    cursor?: string | null;
  };
}

export interface ListOrganizerComponentsResponse {
  items: OrganizerRegistryRecord[];
  nextCursor: string | null;
}

export interface GetOrganizerComponentParams {
  userId: string;
  componentId: string;
}

export type OrganizerRegistryRecord = OrganizerComponent;

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(',')}}`;
};

const computeConfigHash = (config: Record<string, unknown>): string => {
  const digest = createHash('sha256');
  digest.update(stableStringify(config));
  return digest.digest('hex');
};

const normalizeAddress = (value: string): string => value.trim().toLowerCase();

const normalizeConfig = (config: Record<string, unknown>): Record<string, unknown> => config;

interface CursorPayload {
  createdAt: string;
  id: string;
}

const encodeCursor = (payload: CursorPayload): string =>
  Buffer.from(`${payload.createdAt}::${payload.id}`, 'utf8').toString('base64url');

const decodeCursor = (cursor: string | null | undefined): CursorPayload | null => {
  if (!cursor) {
    return null;
  }

  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const [createdAt, id] = decoded.split('::');
    if (!createdAt || !id) {
      return null;
    }
    return { createdAt, id };
  } catch {
    return null;
  }
};

const applyCursorCondition = (cursor: CursorPayload) =>
  sql`${organizerComponents.createdAt} < ${cursor.createdAt} OR (${organizerComponents.createdAt} = ${cursor.createdAt} AND ${organizerComponents.id} < ${cursor.id})`;

export const registerOrganizerComponentRecord = async (
  db: DrizzleDatabase<DbSchema>,
  params: RegisterOrganizerComponentParams
): Promise<RegisterOrganizerComponentResult> => {
  const normalizedUserId = params.userId.trim();
  const normalizedWallet = normalizeAddress(params.walletAddress);
  const normalizedType = params.componentType;
  const normalizedAddress = normalizeAddress(params.contractAddress);
  const normalizedConfig = normalizeConfig(params.config);
  const configHash = computeConfigHash(normalizedConfig);
  const status: OrganizerComponentStatus = params.status ?? 'pending';

  const [existing] = await db
    .select()
    .from(organizerComponents)
    .where(
      and(
        eq(organizerComponents.userId, normalizedUserId),
        eq(organizerComponents.networkId, params.networkId),
        eq(organizerComponents.componentType, normalizedType),
        eq(organizerComponents.configHash, configHash)
      )
    )
    .limit(1);

  if (!existing) {
    const [inserted] = await db
      .insert(organizerComponents)
      .values({
        userId: normalizedUserId,
        walletAddress: normalizedWallet,
        networkId: params.networkId,
        componentType: normalizedType,
        contractAddress: normalizedAddress,
        configHash,
        config: normalizedConfig,
        transactionHash: params.transactionHash?.toLowerCase() ?? null,
        status,
        failureReason: params.failureReason ?? {},
        confirmedAt: params.confirmedAt ?? null
      })
      .returning();

    if (!inserted) {
      throw new Error('Failed to insert organizer component record.');
    }

    return {
      component: inserted,
      created: true
    };
  }

  const [updated] = await db
    .update(organizerComponents)
    .set({
      walletAddress: normalizedWallet,
      contractAddress: normalizedAddress,
      transactionHash: params.transactionHash?.toLowerCase() ?? existing.transactionHash,
      status,
      failureReason: params.failureReason === undefined ? existing.failureReason : params.failureReason,
      confirmedAt: params.confirmedAt ?? existing.confirmedAt,
      config: normalizedConfig,
      updatedAt: new Date()
    })
    .where(eq(organizerComponents.id, existing.id))
    .returning();

  if (!updated) {
    throw new Error('Failed to update organizer component record.');
  }

  return {
    component: updated,
    created: false
  };
};

export const listOrganizerComponentsRecords = async (
  db: DrizzleDatabase<DbSchema>,
  params: ListOrganizerComponentsParams
): Promise<ListOrganizerComponentsResponse> => {
  const normalizedUserId = params.userId.trim();

  const filters = [eq(organizerComponents.userId, normalizedUserId)];
  if (params.networkId !== undefined) {
    filters.push(eq(organizerComponents.networkId, params.networkId));
  }
  if (params.componentType) {
    filters.push(eq(organizerComponents.componentType, params.componentType));
  }
  if (params.statuses && params.statuses.length > 0) {
    const normalizedStatuses = params.statuses.map((value) => value.trim() as OrganizerComponentStatus);
    filters.push(inArray(organizerComponents.status, normalizedStatuses));
  }

  const pageSize = Math.max(1, Math.min(params.pagination?.pageSize ?? 25, 100));
  const cursorPayload = decodeCursor(params.pagination?.cursor ?? null);
  const conditions = cursorPayload ? [...filters, applyCursorCondition(cursorPayload)] : filters;

  const baseQuery = db
    .select()
    .from(organizerComponents)
    .orderBy(desc(organizerComponents.createdAt), desc(organizerComponents.id))
    .limit(pageSize + 1);

  const whereClause = conditions.reduce<SQL | undefined>((accumulator, current) =>
    accumulator ? and(accumulator, current) : current,
  undefined);

  const rows = await (whereClause ? baseQuery.where(whereClause) : baseQuery);

  const hasNext = rows.length > pageSize;
  const items = rows
    .slice(0, pageSize)
    .map((row) => ({
      ...row,
      contractAddress: row.contractAddress.toLowerCase(),
      walletAddress: row.walletAddress?.toLowerCase() ?? null,
      transactionHash: row.transactionHash?.toLowerCase() ?? null
    }));

  let nextCursor: string | null = null;
  if (hasNext) {
    const cursorRow = rows[pageSize];
    if (cursorRow) {
      nextCursor = encodeCursor({
        createdAt: cursorRow.createdAt.toISOString(),
        id: cursorRow.id
      });
    }
  }

  return {
    items,
    nextCursor
  };
};

export const getOrganizerComponentRecord = async (
  db: DrizzleDatabase<DbSchema>,
  params: GetOrganizerComponentParams
): Promise<OrganizerRegistryRecord | null> => {
  const normalizedUserId = params.userId.trim();
  const [record] = await db
    .select()
    .from(organizerComponents)
    .where(
      and(
        eq(organizerComponents.userId, normalizedUserId),
        eq(organizerComponents.id, params.componentId)
      )
    )
    .limit(1);

  if (!record) {
    return null;
  }

  return {
    ...record,
    contractAddress: record.contractAddress.toLowerCase(),
    walletAddress: record.walletAddress?.toLowerCase() ?? null,
    transactionHash: record.transactionHash?.toLowerCase() ?? null
  };
};
