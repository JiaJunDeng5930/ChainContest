import type {
  ContestEventBatch,
  ContestEventEnvelope,
  ContestEventType,
} from '@chaincontest/chain';
import type { Logger } from 'pino';
import type { RegistryStream } from './ingestionRegistry.js';
import type { DbClient } from './dbClient.js';

export interface WriteBatchParams {
  stream: RegistryStream;
  batch: ContestEventBatch;
  currentCursor?: { blockNumber: bigint; logIndex: number };
  advanceCursor?: boolean;
}

export type DomainWriteContext = {
  stream: RegistryStream;
  event: ContestEventEnvelope;
};

export type DomainWriteHandler = (context: DomainWriteContext) => Promise<void>;

export class IngestionWriter {
  private readonly domainHandlers = new Map<ContestEventType, DomainWriteHandler>();

  constructor(private readonly db: DbClient, private readonly logger: Logger) {}

  public registerDomainHandler(eventType: ContestEventType, handler: DomainWriteHandler): void {
    this.domainHandlers.set(eventType, handler);
  }

  public async writeBatch(params: WriteBatchParams): Promise<void> {
    const { stream, batch, advanceCursor = true, currentCursor } = params;

    for (const event of batch.events) {
      await this.recordEvent(stream, event);
      await this.invokeDomainHandler(event.type, { stream, event });
    }

    if (batch.events.length === 0) {
      this.logger.debug(
        {
          contestId: stream.contestId,
          chainId: stream.chainId,
        },
        'no events ingested in batch',
      );
    }

    if (!advanceCursor) {
      this.logger.debug(
        {
          contestId: stream.contestId,
          chainId: stream.chainId,
        },
        'cursor advance disabled for batch; leaving live cursor unchanged',
      );
      return;
    }

    if (!this.shouldAdvanceCursor(currentCursor, batch.nextCursor)) {
      this.logger.debug(
        {
          contestId: stream.contestId,
          chainId: stream.chainId,
          currentCursor,
          nextCursor: batch.nextCursor,
        },
        'cursor unchanged; skipping advance',
      );
      return;
    }

    await this.advanceCursor(stream, batch);
  }

  private async recordEvent(stream: RegistryStream, event: ContestEventEnvelope): Promise<void> {
    await this.db.writeIngestionEvent({
      action: 'record_event',
      payload: {
        contestId: stream.contestId,
        chainId: stream.chainId,
        txHash: event.txHash,
        logIndex: event.logIndex,
        eventType: event.type,
        occurredAt: event.derivedAt.timestamp ?? new Date().toISOString(),
      },
    });
  }

  private async invokeDomainHandler(type: ContestEventType, context: DomainWriteContext): Promise<void> {
    const handler = this.domainHandlers.get(type);
    if (!handler) {
      this.logger.debug(
        {
          contestId: context.stream.contestId,
          chainId: context.stream.chainId,
          eventType: type,
        },
        'no domain handler registered for event type',
      );
      return;
    }

    await handler(context);
  }

  private async advanceCursor(stream: RegistryStream, batch: ContestEventBatch): Promise<void> {
    await this.db.writeIngestionEvent({
      action: 'advance_cursor',
      payload: {
        contestId: stream.contestId,
        chainId: stream.chainId,
        contractAddress: stream.addresses.registrar,
        cursorHeight: batch.nextCursor.blockNumber,
        cursorLogIndex: batch.nextCursor.logIndex,
        cursorHash: batch.latestBlock.blockHash,
      },
    });
  }

  private shouldAdvanceCursor(
    current: { blockNumber: bigint; logIndex: number } | undefined,
    next: { blockNumber: bigint; logIndex: number },
  ): boolean {
    if (!current) {
      return true;
    }
    if (next.blockNumber > current.blockNumber) {
      return true;
    }
    if (next.blockNumber === current.blockNumber && next.logIndex > current.logIndex) {
      return true;
    }
    return false;
  }
}
