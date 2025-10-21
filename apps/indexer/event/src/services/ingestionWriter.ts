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
    const { stream, batch } = params;

    for (const event of batch.events) {
      await this.recordEvent(stream, event);
      await this.invokeDomainHandler(event.type, { stream, event });
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
        cursorHash: batch.latestBlock.blockHash,
      },
    });
  }
}
