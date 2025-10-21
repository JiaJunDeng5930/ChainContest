import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContestEventBatch, ContestEventEnvelope } from '@chaincontest/chain';
import type { Logger } from 'pino';
import { IngestionWriter } from '../../../src/services/ingestionWriter.js';
import type { RegistryStream } from '../../../src/services/ingestionRegistry.js';
import type { DbClient } from '../../../src/services/dbClient.js';

const hex = (value: string): `0x${string}` => `0x${value}` as const;

describe('IngestionWriter', () => {
  let stream: RegistryStream;
  let db: DbClient;
  type WriteEventArgs = Parameters<DbClient['writeIngestionEvent']>;
  type WriteEventResult = ReturnType<DbClient['writeIngestionEvent']>;
  type LoggerDebugArgs = Parameters<Logger['debug']>;
  type LoggerDebugResult = ReturnType<Logger['debug']>;

  let writeIngestionEventMock: ReturnType<typeof vi.fn<WriteEventArgs, WriteEventResult>>;
  let loggerDebug: ReturnType<typeof vi.fn<LoggerDebugArgs, LoggerDebugResult>>;
  let logger: Logger;

  beforeEach(() => {
    stream = {
      contestId: 'contest-1',
      chainId: 1,
      addresses: { registrar: '0x1111111111111111111111111111111111111111' },
      startBlock: 0n,
      metadata: {},
    };

    writeIngestionEventMock = vi
      .fn<WriteEventArgs, WriteEventResult>()
      .mockResolvedValue({ status: 'applied', cursorHeight: undefined, cursorHash: undefined });

    db = {
      isReady: true,
      init: vi.fn(),
      shutdown: vi.fn(),
      readIngestionStatus: vi.fn(),
      writeIngestionEvent: writeIngestionEventMock,
      writeContestDomain: vi.fn(),
    } as unknown as DbClient;

    loggerDebug = vi.fn<LoggerDebugArgs, LoggerDebugResult>();
    logger = {
      debug: loggerDebug,
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Logger;
  });

  it('skips cursor advance when batch has no events', async () => {
    const batch: ContestEventBatch = {
      events: [],
      nextCursor: { blockNumber: 120n, logIndex: 0 },
      latestBlock: {
        blockNumber: 120n,
        blockHash: hex('a'.repeat(64)),
        timestamp: new Date().toISOString(),
      },
    };

    const writer = new IngestionWriter(db, logger);

    await writer.writeBatch({ stream, batch });

    expect(loggerDebug).toHaveBeenCalledWith(
      expect.objectContaining({ contestId: stream.contestId, chainId: stream.chainId }),
      'no events ingested; skipping cursor advance',
    );
    expect(writeIngestionEventMock).not.toHaveBeenCalled();
  });

  it('records events and advances cursor when batch contains events', async () => {
    const event: ContestEventEnvelope = {
      type: 'registration',
      blockNumber: 101n,
      logIndex: 2,
      txHash: hex('b'.repeat(64)),
      cursor: { blockNumber: 101n, logIndex: 2 },
      payload: {},
      reorgFlag: false,
      derivedAt: {
        blockNumber: 101n,
        blockHash: hex('c'.repeat(64)),
        timestamp: new Date().toISOString(),
      },
    };

    const batch: ContestEventBatch = {
      events: [event],
      nextCursor: event.cursor,
      latestBlock: {
        blockNumber: 101n,
        blockHash: hex('d'.repeat(64)),
        timestamp: new Date().toISOString(),
      },
    };

    const writer = new IngestionWriter(db, logger);

    await writer.writeBatch({ stream, batch });

    expect(writeIngestionEventMock).toHaveBeenCalledTimes(2);
    expect(writeIngestionEventMock.mock.calls[0][0]).toMatchObject({ action: 'record_event' });
    expect(writeIngestionEventMock.mock.calls[1][0]).toMatchObject({ action: 'advance_cursor' });
  });

  it('does not advance cursor when explicitly disabled', async () => {
    const event: ContestEventEnvelope = {
      type: 'registration',
      blockNumber: 200n,
      logIndex: 1,
      txHash: hex('e'.repeat(64)),
      cursor: { blockNumber: 200n, logIndex: 1 },
      payload: {},
      reorgFlag: false,
      derivedAt: {
        blockNumber: 200n,
        blockHash: hex('f'.repeat(64)),
        timestamp: new Date().toISOString(),
      },
    };

    const batch: ContestEventBatch = {
      events: [event],
      nextCursor: event.cursor,
      latestBlock: {
        blockNumber: 200n,
        blockHash: hex('c'.repeat(64)),
        timestamp: new Date().toISOString(),
      },
    };

    const writer = new IngestionWriter(db, logger);

    await writer.writeBatch({ stream, batch, advanceCursor: false });

    expect(writeIngestionEventMock).toHaveBeenCalledTimes(1);
    expect(writeIngestionEventMock.mock.calls[0][0]).toMatchObject({ action: 'record_event' });
    expect(loggerDebug).toHaveBeenCalledWith(
      expect.objectContaining({ contestId: stream.contestId, chainId: stream.chainId }),
      'cursor advance disabled for batch; leaving live cursor unchanged',
    );
  });
});
