/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect } from 'vitest';
import type { RegistryStream } from '../../../src/services/ingestionRegistry.js';
import type { ContestEventEnvelope, ContestEventType } from '@chaincontest/chain';
import { ReconciliationReportService } from '../../../src/services/reconciliationReport.js';

const createEvent = (overrides: Partial<ContestEventEnvelope> = {}): ContestEventEnvelope => ({
  type: overrides.type ?? ('registration' as ContestEventType),
  blockNumber: overrides.blockNumber ?? 1200n,
  logIndex: overrides.logIndex ?? 0,
  txHash: overrides.txHash ?? ('0xabc' as `0x${string}`),
  cursor: overrides.cursor ?? { blockNumber: 1200n, logIndex: 0 },
  payload: overrides.payload ?? { amount: '10' },
  reorgFlag: overrides.reorgFlag ?? false,
  derivedAt: overrides.derivedAt ?? {
    blockNumber: 1200n,
    blockHash: '0x1' as `0x${string}`,
    timestamp: '2024-01-01T00:00:00.000Z',
  },
});

describe('ReconciliationReportService', () => {
  const stream: RegistryStream = {
    contestId: 'cont-1',
    chainId: 11155111,
    addresses: { registrar: '0xregistrar' },
    startBlock: 0n,
    metadata: {},
  };

  it('generates discrepancies for missing and mismatched events', () => {
    const service = new ReconciliationReportService({
      clock: () => new Date('2025-10-21T12:00:00Z').valueOf(),
      idFactory: () => 'rep-123',
    });

    const replay = [
      createEvent(),
      createEvent({ txHash: '0xdef' as `0x${string}`, logIndex: 1, payload: { amount: '42' } }),
    ];

    const baseline = [
      createEvent({ payload: { amount: '11' } }),
    ];

    const report = service.buildReport({
      stream,
      range: { fromBlock: 1000n, toBlock: 1300n },
      replayEvents: replay,
      baselineEvents: baseline,
      actor: 'ops@example.com',
      reason: 'audit',
    });

    expect(report.reportId).toBe('rep-123');
    expect(report.generatedAt).toBe('2025-10-21T12:00:00.000Z');
    expect(report.contestId).toBe(stream.contestId);
    expect(report.discrepancies).toEqual([
      expect.objectContaining({ type: 'payload_mismatch' }),
      expect.objectContaining({ type: 'missing_event', details: expect.objectContaining({ txHash: '0xdef' }) }),
    ]);
    expect(report.actorContext).toEqual({ actor: 'ops@example.com', reason: 'audit' });
  });

  it('skips discrepancy generation when baseline is absent', () => {
    const service = new ReconciliationReportService({
      clock: () => new Date('2025-10-21T13:00:00Z').valueOf(),
      idFactory: () => 'rep-456',
    });

    const replay = [createEvent(), createEvent({ txHash: '0x222' as `0x${string}`, logIndex: 1 })];

    const report = service.buildReport({
      stream,
      range: { fromBlock: 1000n, toBlock: 1300n },
      replayEvents: replay,
      baselineEvents: undefined,
    });

    expect(report.reportId).toBe('rep-456');
    expect(report.discrepancies).toHaveLength(0);
  });
});
