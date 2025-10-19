import { and, eq, isNull } from 'drizzle-orm';
import type { DrizzleTransaction } from '../adapters/connection.js';
import { DbError, DbErrorCode } from '../instrumentation/metrics.js';
import {
  userIdentities,
  walletBindings,
  walletSourceEnum,
  type DbSchema,
  type UserIdentity,
  type WalletBinding
} from '../schema/index.js';

export type WalletMutationAction = 'bind' | 'unbind';

export type WalletMutationStatus = 'applied' | 'noop';

export interface WalletMutationActorContext extends Record<string, unknown> {
  actorId?: string;
  source?: string;
}

export interface MutateUserWalletParams {
  action: WalletMutationAction;
  userId: string;
  walletAddress: string;
  actorContext?: WalletMutationActorContext | null;
}

export interface MutateUserWalletResult {
  status: WalletMutationStatus;
}

export async function mutateUserWallet(
  tx: DrizzleTransaction<DbSchema>,
  params: MutateUserWalletParams
): Promise<MutateUserWalletResult> {
  const normalizedWallet = normalizeWallet(params.walletAddress);

  if (!normalizedWallet) {
    throw new DbError(DbErrorCode.INPUT_INVALID, 'Wallet address must be provided for mutation', {
      detail: {
        reason: 'wallet_required'
      }
    });
  }

  const identity = await findIdentity(tx, params.userId);

  if (!identity) {
    throw new DbError(DbErrorCode.NOT_FOUND, `Identity not found for user ${params.userId}`, {
      detail: {
        reason: 'identity_not_found',
        context: { userId: params.userId }
      }
    });
  }

  switch (params.action) {
    case 'bind':
      return bindWallet(tx, identity, normalizedWallet, params);
    case 'unbind':
      return unbindWallet(tx, identity, normalizedWallet, params);
    default:
      throw new DbError(DbErrorCode.INPUT_INVALID, `Unsupported wallet mutation action "${params.action}"`, {
        detail: {
          reason: 'unsupported_action',
          context: { action: params.action }
        }
      });
  }
}

async function bindWallet(
  tx: DrizzleTransaction<DbSchema>,
  identity: UserIdentity,
  walletAddress: string,
  params: MutateUserWalletParams
): Promise<MutateUserWalletResult> {
  const existing = await findActiveBinding(tx, walletAddress);

  if (existing) {
    if (existing.userId === identity.id) {
      return { status: 'noop' };
    }

    throw new DbError(DbErrorCode.CONFLICT, 'Wallet already bound to another identity', {
      detail: {
        reason: 'wallet_bound_to_other_user',
        context: {
          walletAddress,
          currentUserId: existing.userId,
          attemptedUserId: identity.id
        }
      }
    });
  }

  const actorReference = resolveAuditActor(params.actorContext);
  const bindingSource = resolveBindingSource(params.actorContext);

  try {
    await tx.insert(walletBindings).values({
      userId: identity.id,
      walletAddress,
      walletAddressChecksum: params.walletAddress.trim(),
      source: bindingSource,
      createdBy: actorReference,
      updatedBy: actorReference
    });
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }

    const concurrent = await findActiveBinding(tx, walletAddress);
    if (concurrent && concurrent.userId === identity.id) {
      return { status: 'noop' };
    }

    throw new DbError(DbErrorCode.CONFLICT, 'Wallet already bound to another identity', {
      detail: {
        reason: 'wallet_bound_to_other_user',
        context: {
          walletAddress,
          currentUserId: concurrent?.userId,
          attemptedUserId: identity.id
        }
      },
      cause: error
    });
  }

  return { status: 'applied' };
}

async function unbindWallet(
  tx: DrizzleTransaction<DbSchema>,
  identity: UserIdentity,
  walletAddress: string,
  params: MutateUserWalletParams
): Promise<MutateUserWalletResult> {
  const existing = await findActiveBinding(tx, walletAddress);

  if (!existing) {
    return { status: 'noop' };
  }

  if (existing.userId !== identity.id) {
    return { status: 'noop' };
  }

  const actorReference = resolveAuditActor(params.actorContext);
  const timestamp = new Date();

  const updated = await tx
    .update(walletBindings)
    .set({
      unboundAt: timestamp,
      unboundBy: actorReference,
      updatedBy: actorReference
    })
    .where(and(eq(walletBindings.id, existing.id), isNull(walletBindings.unboundAt)))
    .returning({ id: walletBindings.id });

  if (updated.length === 0) {
    return { status: 'noop' };
  }

  return { status: 'applied' };
}

async function findIdentity(
  tx: DrizzleTransaction<DbSchema>,
  externalId: string
): Promise<UserIdentity | undefined> {
  if (!externalId || !externalId.trim()) {
    return undefined;
  }

  return tx.query.userIdentities.findFirst({
    where: eq(userIdentities.externalId, externalId.trim())
  });
}

async function findActiveBinding(
  tx: DrizzleTransaction<DbSchema>,
  walletAddress: string
): Promise<WalletBinding | undefined> {
  return tx.query.walletBindings.findFirst({
    where: and(eq(walletBindings.walletAddress, walletAddress), isNull(walletBindings.unboundAt))
  });
}

function normalizeWallet(value: string): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.toLowerCase();
}

function resolveAuditActor(context: WalletMutationActorContext | null | undefined): string | null {
  if (!context) {
    return null;
  }

  const preferredKeys = ['actorId', 'userId', 'source', 'service', 'trigger'];

  for (const key of preferredKeys) {
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

function resolveBindingSource(
  context: WalletMutationActorContext | null | undefined
): WalletBinding['source'] {
  const candidate = typeof context?.source === 'string' ? context.source : null;
  if (candidate && walletSourceEnum.enumValues.includes(candidate as WalletBinding['source'])) {
    return candidate as WalletBinding['source'];
  }
  return walletSourceEnum.enumValues[0]!;
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const directCode = (error as { code?: string }).code;
  const causeCode = (error as { cause?: { code?: string } }).cause?.code;
  return directCode === '23505' || causeCode === '23505';
}
