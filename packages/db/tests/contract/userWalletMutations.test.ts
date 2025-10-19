import { describe, expect, beforeAll, afterAll, beforeEach, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { init, shutdown, mutateUserWallet } from '../../src/index.js';
import { createDatabaseFixture, type TestDatabaseFixture } from '../fixtures/database.js';
import {
  userIdentities,
  userIdentityStatusEnum,
  walletBindings
} from '../../src/schema/user-bindings.js';
import { buildTestValidators } from '../helpers/validators.js';
import type { WalletBinding } from '../../src/schema/user-bindings.js';

let fixture: TestDatabaseFixture;

describe('mutateUserWallet', () => {
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

  beforeEach(async () => {
    await fixture.reset();
  });

  it('binds a wallet to a user and records audit fields', async () => {
    const identity = await seedIdentity('bind-user-1');

    const response = await mutateUserWallet({
      action: 'bind',
      userId: 'bind-user-1',
      walletAddress: '0xAbC0000000000000000000000000000000000100',
      actorContext: { actorId: 'ops-actor', reason: 'initial bind' }
    });

    expect(response.status).toBe('applied');

    const active = await findLatestBinding('0xabc0000000000000000000000000000000000100');
    expect(active).toBeDefined();
    expect(active!.userId).toBe(identity);
    expect(active!.createdBy).toBe('ops-actor');
    expect(active!.updatedBy).toBe('ops-actor');
    expect(active!.unboundAt).toBeNull();
    expect(active!.unboundBy).toBeNull();
    expect(active!.walletAddressChecksum).toBe('0xAbC0000000000000000000000000000000000100');
    expect(active!.boundAt).toBeInstanceOf(Date);
  });

  it('is idempotent when binding the same wallet to the same user', async () => {
    await seedIdentity('bind-user-2');

    const first = await mutateUserWallet({
      action: 'bind',
      userId: 'bind-user-2',
      walletAddress: '0xabc0000000000000000000000000000000000200',
      actorContext: { actorId: 'first-bind' }
    });
    expect(first.status).toBe('applied');

    const second = await mutateUserWallet({
      action: 'bind',
      userId: 'bind-user-2',
      walletAddress: '0xabc0000000000000000000000000000000000200',
      actorContext: { actorId: 'second-bind' }
    });
    expect(second.status).toBe('noop');

    const bindings = await fixture.db
      .select()
      .from(walletBindings)
      .where(eq(walletBindings.walletAddress, '0xabc0000000000000000000000000000000000200'));
    expect(bindings).toHaveLength(1);
    expect(bindings[0]!.createdBy).toBe('first-bind');
  });

  it('rejects binding when the wallet is owned by another user', async () => {
    await seedIdentity('bind-user-3');
    await seedIdentity('bind-user-4');

    await mutateUserWallet({
      action: 'bind',
      userId: 'bind-user-3',
      walletAddress: '0xabc0000000000000000000000000000000000300',
      actorContext: { actorId: 'initial-owner' }
    });

    await expect(
      mutateUserWallet({
        action: 'bind',
        userId: 'bind-user-4',
        walletAddress: '0xabc0000000000000000000000000000000000300',
        actorContext: { actorId: 'intruder' }
      })
    ).rejects.toMatchObject({
      code: 'CONFLICT'
    });
  });

  it('marks binding as unbound when requested by the owning user', async () => {
    const identity = await seedIdentity('bind-user-5');
    await mutateUserWallet({
      action: 'bind',
      userId: 'bind-user-5',
      walletAddress: '0xabc0000000000000000000000000000000000400',
      actorContext: { actorId: 'binding-actor' }
    });

    const response = await mutateUserWallet({
      action: 'unbind',
      userId: 'bind-user-5',
      walletAddress: '0xabc0000000000000000000000000000000000400',
      actorContext: { actorId: 'binding-actor' }
    });

    expect(response.status).toBe('applied');

    const active = await findActiveBinding('0xabc0000000000000000000000000000000000400');
    expect(active).toBeUndefined();

    const history = await findLatestBinding('0xabc0000000000000000000000000000000000400');
    expect(history).toBeDefined();
    expect(history!.unboundAt).toBeInstanceOf(Date);
    expect(history!.unboundBy).toBe('binding-actor');
  });

  it('returns noop when unbinding a wallet that is not owned by the user', async () => {
    await seedIdentity('bind-user-6');
    await seedIdentity('bind-user-7');

    await mutateUserWallet({
      action: 'bind',
      userId: 'bind-user-6',
      walletAddress: '0xabc0000000000000000000000000000000000500',
      actorContext: { actorId: 'initial-bind' }
    });

    const response = await mutateUserWallet({
      action: 'unbind',
      userId: 'bind-user-7',
      walletAddress: '0xabc0000000000000000000000000000000000500',
      actorContext: { actorId: 'other-user' }
    });

    expect(response.status).toBe('noop');

    const active = await findActiveBinding('0xabc0000000000000000000000000000000000500');
    expect(active).toBeDefined();
  });

  it('returns noop when unbinding a wallet that has no active binding', async () => {
    await seedIdentity('bind-user-8');

    const response = await mutateUserWallet({
      action: 'unbind',
      userId: 'bind-user-8',
      walletAddress: '0xabc0000000000000000000000000000000000600',
      actorContext: { actorId: 'noop-actor' }
    });

    expect(response.status).toBe('noop');
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

const findActiveBinding = async (wallet: string): Promise<WalletBinding | undefined> => {
  return fixture.db.query.walletBindings.findFirst({
    where: and(eq(walletBindings.walletAddress, wallet), isNull(walletBindings.unboundAt))
  });
};

const findLatestBinding = async (wallet: string): Promise<WalletBinding | undefined> => {
  const rows = await fixture.db
    .select()
    .from(walletBindings)
    .where(eq(walletBindings.walletAddress, wallet))
    .orderBy(desc(walletBindings.createdAt))
    .limit(1);

  return rows[0];
};
