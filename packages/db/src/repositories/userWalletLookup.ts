import { and, asc, eq, isNull } from 'drizzle-orm';
import type { DrizzleDatabase } from '../adapters/connection.js';
import {
  userIdentities,
  walletBindings,
  type DbSchema,
  type UserIdentity,
  type WalletBinding
} from '../schema/index.js';

const UNKNOWN = 'unknown';

export type WalletBindingSource = WalletBinding['source'];

export interface LookupUserWalletParams {
  userId: string;
  walletAddress: string;
}

export interface LookupUserWalletRecord {
  identityId: UserIdentity['id'];
  externalId: UserIdentity['externalId'];
  identityStatus: UserIdentity['status'];
  walletId: WalletBinding['id'];
  walletAddress: WalletBinding['walletAddress'];
  walletAddressChecksum: WalletBinding['walletAddressChecksum'];
  source: WalletBindingSource;
  boundAt: WalletBinding['boundAt'];
  createdAt: WalletBinding['createdAt'];
  updatedAt: WalletBinding['updatedAt'];
  createdBy: WalletBinding['createdBy'];
  updatedBy: WalletBinding['updatedBy'];
}

export const lookupUserWalletRecords = async (
  db: DrizzleDatabase<DbSchema>,
  params: LookupUserWalletParams
): Promise<LookupUserWalletRecord[]> => {
  const userFilter = normalizeIdentifier(params.userId);
  const walletFilter = normalizeWallet(params.walletAddress);

  if (!userFilter && !walletFilter) {
    throw new Error('lookupUserWallet requires at least one identifier');
  }

  const conditions = [isNull(walletBindings.unboundAt)];

  if (userFilter) {
    conditions.push(eq(userIdentities.externalId, userFilter));
  }

  if (walletFilter) {
    conditions.push(eq(walletBindings.walletAddress, walletFilter));
  }

  const baseQuery = db
    .select({
      identityId: userIdentities.id,
      externalId: userIdentities.externalId,
      identityStatus: userIdentities.status,
      walletId: walletBindings.id,
      walletAddress: walletBindings.walletAddress,
      walletAddressChecksum: walletBindings.walletAddressChecksum,
      source: walletBindings.source,
      boundAt: walletBindings.boundAt,
      createdAt: walletBindings.createdAt,
      updatedAt: walletBindings.updatedAt,
      createdBy: walletBindings.createdBy,
      updatedBy: walletBindings.updatedBy
    })
    .from(walletBindings)
    .innerJoin(userIdentities, eq(walletBindings.userId, userIdentities.id));

  const filteredQuery =
    conditions.length > 0 ? baseQuery.where(and(...conditions)) : baseQuery;

  const rows = await filteredQuery.orderBy(
    asc(walletBindings.boundAt),
    asc(walletBindings.walletAddress)
  );

  return rows.map((row) => ({
    ...row,
    walletAddress: row.walletAddress.toLowerCase()
  }));
};

const normalizeIdentifier = (value: string): string | null => {
  if (!value) {
    return null;
  }

  if (value.trim().toLowerCase() === UNKNOWN) {
    return null;
  }

  return value.trim();
};

const normalizeWallet = (value: string): string | null => {
  const normalized = normalizeIdentifier(value);
  return normalized ? normalized.toLowerCase() : null;
};
