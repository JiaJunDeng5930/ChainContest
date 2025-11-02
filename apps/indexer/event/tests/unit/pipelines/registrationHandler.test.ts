import { describe, expect, it, vi } from 'vitest';
import type { Logger } from 'pino';
import type { DbClient } from '../../../src/services/dbClient.js';
import type { RegistryStream } from '../../../src/services/ingestionRegistry.js';
import type { ContestEventEnvelope } from '@chaincontest/chain';
import { createRegistrationEventHandler } from '../../../src/pipelines/registrationHandler.js';

const hex = (value: string): `0x${string}` => `0x${value}` as const;

describe('createRegistrationEventHandler', () => {
  const buildContext = () => {
    const participant = '0x2222222222222222222222222222222222222222';
    const vault = '0x3333333333333333333333333333333333333333';
    const entryAmount = '1000000000000000000';

    const stream: RegistryStream = {
      contestId: 'contest-1',
      chainId: 31337,
      addresses: { registrar: '0x1111111111111111111111111111111111111111' },
      startBlock: 0n,
      metadata: {},
    };

    const event: ContestEventEnvelope = {
      type: 'registration',
      blockNumber: 120n,
      logIndex: 3,
      txHash: hex('a'.repeat(64)),
      cursor: { blockNumber: 120n, logIndex: 3 },
      payload: {
        participant,
        vault,
        entryAmount,
      },
      reorgFlag: false,
      derivedAt: {
        blockNumber: 120n,
        blockHash: hex('b'.repeat(64)),
        timestamp: new Date('2025-01-01T00:00:00Z').toISOString(),
      },
    };

    return { stream, event, participant, vault, entryAmount };
  };

  it('writes contest domain registration entry', async () => {
    const { stream, event, participant, vault, entryAmount } = buildContext();

    const writeContestDomain = vi.fn().mockResolvedValue({ status: 'applied', contestId: stream.contestId });

    const db = {
      writeContestDomain,
    } as unknown as DbClient;

    const logger = {
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as Logger;

    const handler = createRegistrationEventHandler({ db, logger });
    await handler({ stream, event });

    expect(writeContestDomain).toHaveBeenCalledTimes(1);
    const request = writeContestDomain.mock.calls[0]![0];
    expect(request).toMatchObject({
      action: 'register_participation',
      payload: {
        contestId: stream.contestId,
        walletAddress: participant,
        vaultReference: vault,
        amountWei: entryAmount,
        event: {
          chainId: stream.chainId,
          txHash: event.txHash,
          logIndex: event.logIndex,
        },
      },
    });
  });

  it('skips write when participant missing', async () => {
    const { stream, event } = buildContext();
    const malformedEvent: ContestEventEnvelope = {
      ...event,
      payload: {},
    };

    const db = {
      writeContestDomain: vi.fn(),
    } as unknown as DbClient;

    const logger = {
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as Logger;

    const handler = createRegistrationEventHandler({ db, logger });
    await handler({ stream, event: malformedEvent });

    expect(db.writeContestDomain).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });
});
