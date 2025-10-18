import { describe, expect, beforeAll, afterAll, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { lookupUserWallet, shutdown, init } from '../../src/index.js';
import { createDatabaseFixture, type TestDatabaseFixture } from '../fixtures/database.js';
import {
  userIdentities,
  walletBindings,
  walletSourceEnum,
  userIdentityStatusEnum
} from '../../src/schema/user-bindings.js';
import type { LookupUserWalletResponse } from '../../src/index.js';
import { buildTestValidators } from '../helpers/validators.js';

let fixture: TestDatabaseFixture;

describe('lookupUserWallet', () => {
  beforeAll(async () => {
    fixture = await createDatabaseFixture();
    await init({
      databaseUrl: fixture.connectionString,
      validators: buildTestValidators()
    });
  });

  afterAll(async () => {
    await shutdown();
    await fixture.cleanup();
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
