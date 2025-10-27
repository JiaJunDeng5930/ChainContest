import { and, asc, eq } from 'drizzle-orm';
import type { DrizzleDatabase } from '../adapters/connection.js';
import { organizerContracts, type OrganizerContract, type DbSchema } from '../schema/index.js';

export interface RegisterOrganizerContractParams {
  userId: string;
  networkId: number;
  contractType: string;
  address: string;
  metadata?: Record<string, unknown>;
}

export interface RegisterOrganizerContractResult {
  contract: OrganizerContract;
  created: boolean;
}

export interface ListOrganizerContractsParams {
  userId: string;
  networkId?: number;
  contractType?: string;
}

export type OrganizerRegistryRecord = OrganizerContract;

export const registerOrganizerContractRecord = async (
  db: DrizzleDatabase<DbSchema>,
  params: RegisterOrganizerContractParams
): Promise<RegisterOrganizerContractResult> => {
  const normalizedUserId = params.userId.trim();
  const normalizedType = params.contractType.trim();
  const normalizedAddress = params.address.trim().toLowerCase();

  const [existing] = await db
    .select()
    .from(organizerContracts)
    .where(
      and(
        eq(organizerContracts.userId, normalizedUserId),
        eq(organizerContracts.networkId, params.networkId),
        eq(organizerContracts.contractType, normalizedType)
      )
    )
    .limit(1);

  if (!existing) {
    const [inserted] = await db
      .insert(organizerContracts)
      .values({
        userId: normalizedUserId,
        networkId: params.networkId,
        contractType: normalizedType,
        address: normalizedAddress,
        metadata: params.metadata ?? {}
      })
      .returning();

    if (!inserted) {
      throw new Error('Failed to insert organizer contract record.');
    }

    return {
      contract: inserted,
      created: true
    };
  }

  const [updated] = await db
    .update(organizerContracts)
    .set({
      address: normalizedAddress,
      metadata: params.metadata ?? existing.metadata,
      updatedAt: new Date()
    })
    .where(eq(organizerContracts.id, existing.id))
    .returning();

  if (!updated) {
    throw new Error('Failed to update organizer contract record.');
  }

  return {
    contract: updated,
    created: false
  };
};

export const listOrganizerContractsRecords = async (
  db: DrizzleDatabase<DbSchema>,
  params: ListOrganizerContractsParams
): Promise<OrganizerRegistryRecord[]> => {
  const normalizedUserId = params.userId.trim();

  const filters = [eq(organizerContracts.userId, normalizedUserId)];
  if (params.networkId !== undefined) {
    filters.push(eq(organizerContracts.networkId, params.networkId));
  }
  if (params.contractType) {
    filters.push(eq(organizerContracts.contractType, params.contractType.trim()));
  }

  const baseQuery = db
    .select()
    .from(organizerContracts)
    .orderBy(asc(organizerContracts.contractType), asc(organizerContracts.networkId));

  const filteredQuery =
    filters.length === 1 ? baseQuery.where(filters[0]!) : baseQuery.where(and(...filters));

  const rows = await filteredQuery;

  return rows.map((row) => ({
    ...row,
    address: row.address.toLowerCase()
  }));
};
