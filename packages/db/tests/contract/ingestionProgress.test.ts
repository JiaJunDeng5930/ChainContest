import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  init,
  writeContestDomain,
  writeIngestionEvent,
  readIngestionStatus,
  shutdown,
  type ReadIngestionStatusResponse
} from '../../src/index.js';
import { createDatabaseFixture, type TestDatabaseFixture } from '../fixtures/database.js';
import { buildTestValidators } from '../helpers/validators.js';

let fixture: TestDatabaseFixture;
let contestId: string;
let chainId = 5;
let contractAddress: string;

describe('ingestion progress', () => {
  beforeAll(async () => {
    fixture = await createDatabaseFixture();
    await init({
      databaseUrl: fixture.connectionString,
      validators: buildTestValidators()
    });

    contractAddress = `0x${randomUUID().replace(/-/g, '').slice(0, 40).padEnd(40, '0')}`;
    const tracked = await writeContestDomain({
      action: 'track',
      payload: {
        chainId,
        contractAddress,
        timeWindow: {
          start: '2025-07-01T00:00:00Z',
          end: '2025-12-01T00:00:00Z'
        },
        metadata: { label: 'cursor-test' }
      }
    });
    contestId = tracked.contestId!;
  });

  afterAll(async () => {
    await shutdown();
    if (fixture) {
      await fixture.cleanup();
    }
  });

  it('returns untracked status when cursor missing', async () => {
    const status = await readIngestionStatus({ contestId: randomUUID() });
    expect(status.status).toBe('untracked');
  });

  it('advances cursor monotonically', async () => {
    const initial = await readIngestionStatus({ contestId });
    expect(initial.status).toBe('untracked');

    await writeIngestionEvent({
      action: 'advance_cursor',
      payload: {
        contestId,
        chainId,
        contractAddress,
        cursorHeight: 10,
        cursorHash: '0x' + 'b'.repeat(64)
      }
    });

    const updated = await readIngestionStatus({ contestId });
    expect(updated.status).toBe('tracked');
    expect(updated.cursorHeight).toBe('10');

    await writeIngestionEvent({
      action: 'advance_cursor',
      payload: {
        contestId,
        chainId,
        contractAddress,
        cursorHeight: 25
      }
    });

    const advanced = await readIngestionStatus({ chainId, contractAddress });
    expect(advanced.cursorHeight).toBe('25');

    await expect(
      writeIngestionEvent({
        action: 'advance_cursor',
        payload: {
          contestId,
          chainId,
          contractAddress,
          cursorHeight: 24
        }
      })
    ).rejects.toMatchObject({ code: 'ORDER_VIOLATION' });
  });

  it('records events idempotently', async () => {
    const result = await writeIngestionEvent({
      action: 'record_event',
      payload: {
        contestId,
        chainId,
        txHash: '0x' + 'c'.repeat(64),
        logIndex: 0,
        eventType: 'participation_registered',
        occurredAt: '2025-07-10T00:00:00Z'
      }
    });

    expect(result.status).toBe('applied');

    const duplicate = await writeIngestionEvent({
      action: 'record_event',
      payload: {
        contestId,
        chainId,
        txHash: '0x' + 'c'.repeat(64),
        logIndex: 0,
        eventType: 'participation_registered',
        occurredAt: '2025-07-10T00:00:00Z'
      }
    });

    expect(duplicate.status).toBe('noop');
  });
});
