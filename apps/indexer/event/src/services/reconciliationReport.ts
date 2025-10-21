import crypto from 'node:crypto';
import type { ContestEventEnvelope } from '@chaincontest/chain';
import type { RegistryStream } from './ingestionRegistry.js';

export interface ReconciliationReportOptions {
  clock?: () => number;
  idFactory?: () => string;
}

export interface ReconciliationReportRequest {
  stream: RegistryStream;
  range: {
    fromBlock: bigint;
    toBlock: bigint;
  };
  replayEvents: ContestEventEnvelope[];
  baselineEvents?: ContestEventEnvelope[];
  actor?: string;
  reason?: string;
}

export interface ReconciliationDiscrepancy {
  type: 'missing_event' | 'extra_event' | 'payload_mismatch';
  details: Record<string, unknown>;
}

export interface ReconciliationReport {
  reportId: string;
  contestId: string;
  chainId: number;
  range: {
    fromBlock: string;
    toBlock: string;
  };
  generatedAt: string;
  discrepancies: ReconciliationDiscrepancy[];
  status: 'pending_review';
  actorContext: Record<string, unknown> | null;
}

export class ReconciliationReportService {
  private readonly now: () => number;

  private readonly idFactory: () => string;

  constructor(options: ReconciliationReportOptions = {}) {
    this.now = options.clock ?? Date.now;
    this.idFactory = options.idFactory ?? crypto.randomUUID;
  }

  public buildReport(request: ReconciliationReportRequest): ReconciliationReport {
    const baselineMap = new Map<string, ContestEventEnvelope>();
    (request.baselineEvents ?? []).forEach((event) => baselineMap.set(this.key(event), event));

    const baselineProvided = (request.baselineEvents?.length ?? 0) > 0;

    const discrepancies: ReconciliationDiscrepancy[] = [];

    request.replayEvents.forEach((event) => {
      const key = this.key(event);
      const baseline = baselineMap.get(key);
      if (!baseline) {
        if (!baselineProvided) {
          return;
        }
        discrepancies.push({
          type: 'missing_event',
          details: {
            txHash: event.txHash,
            logIndex: event.logIndex,
            blockNumber: event.blockNumber.toString(),
          },
        });
        return;
      }

      baselineMap.delete(key);
      if (!this.payloadEquals(baseline.payload, event.payload)) {
        discrepancies.push({
          type: 'payload_mismatch',
          details: {
            txHash: event.txHash,
            logIndex: event.logIndex,
            expected: baseline.payload,
            actual: event.payload,
          },
        });
      }
    });

    if (baselineProvided) {
      baselineMap.forEach((event) => {
        discrepancies.push({
          type: 'extra_event',
          details: {
            txHash: event.txHash,
            logIndex: event.logIndex,
            blockNumber: event.blockNumber.toString(),
          },
        });
      });
    }

    const generatedAt = new Date(this.now()).toISOString();

    const rawContext = request.actor || request.reason ? cleanUndefined({ actor: request.actor, reason: request.reason }) : null;
    const actorContext = rawContext && Object.keys(rawContext).length > 0 ? rawContext : null;

    return {
      reportId: this.idFactory(),
      contestId: request.stream.contestId,
      chainId: request.stream.chainId,
      range: {
        fromBlock: request.range.fromBlock.toString(),
        toBlock: request.range.toBlock.toString(),
      },
      generatedAt,
      discrepancies,
      status: 'pending_review',
      actorContext,
    };
  }

  private key(event: ContestEventEnvelope): string {
    return `${event.txHash}:${event.logIndex}`;
  }

  private payloadEquals(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }
}

const cleanUndefined = <T extends Record<string, unknown>>(input: T): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      result[key] = value;
    }
  });
  return Object.keys(result).length > 0 ? result : {};
};
