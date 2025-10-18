import { describe, expect, beforeAll, afterAll, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { lookupUserWallet, shutdown, init } from '../../src/index.js';
import { createDatabaseFixture, type TestDatabaseFixture } from '../fixtures/database.js';
import {
  userIdentities,
  walletBindings,
  walletSourceEnum,
  userIdentityStatusEnum
} from '../../src/schema/user-bindings.js';
import type { LookupUserWalletResponse } from '../../src/index.js';
import type { ValidatorRegistrationOptions } from '../../src/bootstrap/register-validators.js';

let fixture: TestDatabaseFixture;

const buildValidators = (): ValidatorRegistrationOptions => ({
  registry: [
    {
      typeKey: 'db-user-wallet-lookup-request',
      kind: 'atomic',
      rule: {
        description: 'DB lookup request',
        failureMessage: 'Invalid lookup request',
        schema: z.object({
          userId: z.string(),
          walletAddress: z.string()
        })
      }
    },
    {
      typeKey: 'db-user-wallet-mutation-request',
      kind: 'atomic',
      rule: {
        description: 'Mutation request placeholder',
        failureMessage: 'Invalid mutation request',
        schema: z.object({})
      }
    },
    {
      typeKey: 'db-contest-query-request',
      kind: 'atomic',
      rule: {
        description: 'Contest query placeholder',
        failureMessage: 'Invalid contest query',
        schema: z.object({})
      }
    },
    {
      typeKey: 'db-user-contest-query-request',
      kind: 'atomic',
      rule: {
        description: 'User contest query placeholder',
        failureMessage: 'Invalid user contest query',
        schema: z.object({})
      }
    },
    {
      typeKey: 'db-contest-domain-write-request',
      kind: 'atomic',
      rule: {
        description: 'Contest domain write placeholder',
        failureMessage: 'Invalid contest domain write request',
        schema: z.object({})
      }
    },
    {
      typeKey: 'db-ingestion-status-request',
      kind: 'atomic',
      rule: {
        description: 'Ingestion status placeholder',
        failureMessage: 'Invalid ingestion status request',
        schema: z.object({})
      }
    },
    {
      typeKey: 'db-ingestion-event-request',
      kind: 'atomic',
      rule: {
        description: 'Ingestion event placeholder',
        failureMessage: 'Invalid ingestion event request',
        schema: z.object({})
      }
    }
  ]
});

describe('lookupUserWallet', () => {
  beforeAll(async () => {
    fixture = await createDatabaseFixture();
    await init({
      databaseUrl: fixture.connectionString,
      validators: buildValidators()
    });
  });

  afterAll(async () => {
    await shutdown();
  });

  it('returns bindings when querying by wallet address only', async () => {
    const identityId = await seedIdentity('external-user-1');
    const boundAt = new Date('2025-01-01T00:00:00.000Z');
    await seedWalletBinding(identityId, '0xabc0000000000000000000000000000000000001', boundAt);

    const response = await lookupUserWallet({ userId: 'unknown', walletAddress: '0xAbC0000000000000000000000000000000000001' });

    expect(response.bindings).toHaveLength(1);
    const binding = response.bindings[0];
    expect(binding.userId).toBe('external-user-1');
    expect(binding.walletAddress).toBe('0xabc0000000000000000000000000000000000001');
    expect(binding.boundAt.toISOString()).toBe(boundAt.toISOString());
    expect(binding.metadata.identityId).toBe(identityId);
    expect(binding.metadata.walletId).toBeDefined();
  });

  it('returns all bindings for a user when wallet address is unknown', async () => {
    const identityId = await seedIdentity('external-user-2');
    await seedWalletBinding(identityId, '0xabc0000000000000000000000000000000000002');
    await seedWalletBinding(identityId, '0xabc0000000000000000000000000000000000003');

    const response = await lookupUserWallet({ userId: 'external-user-2', walletAddress: 'unknown' });

    expect(response.bindings).toHaveLength(2);
    const addresses = response.bindings.map((binding) => binding.walletAddress);
    expect(addresses).toContain('0xabc0000000000000000000000000000000000002');
    expect(addresses).toContain('0xabc0000000000000000000000000000000000003');
  });

  it('returns empty bindings when wallet not bound', async () => {
    await seedIdentity('external-user-3');

    const response: LookupUserWalletResponse = await lookupUserWallet({
      userId: 'unknown',
      walletAddress: '0xabc0000000000000000000000000000000000004'
    });

    expect(response.bindings).toHaveLength(0);
  });

  it('throws input invalid when both identifiers are unknown', async () => {
    await expect(lookupUserWallet({ userId: 'unknown', walletAddress: 'unknown' })).rejects.toMatchObject({
      code: 'INPUT_INVALID'
    });
  });
});

const seedIdentity = async (externalId: string): Promise<string> => {
  const [record] = await fixture.db
    .insert(userIdentities)
    .values({
      id: randomUUID(),
      externalId,
      status: userIdentityStatusEnum.enumValues[0],
      createdAt: new Date(),
      updatedAt: new Date()
    })
    .returning({ id: userIdentities.id });

  return record.id;
};

const seedWalletBinding = async (
  identityId: string,
  walletAddress: string,
  boundAt: Date = new Date()
): Promise<void> => {
  await fixture.db.insert(walletBindings).values({
    id: randomUUID(),
    userId: identityId,
    walletAddress,
    walletAddressChecksum: walletAddress,
    source: walletSourceEnum.enumValues[0],
    boundAt,
    createdAt: new Date(),
    updatedAt: new Date()
  });
};
