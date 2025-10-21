import type {
  ContestChainGateway,
  ContestEventBatch,
  ContestIdentifier,
  EventCursor,
} from '@chaincontest/chain';
import type { Logger } from 'pino';
import type { RegistryStream } from '../services/ingestionRegistry.js';

export interface PullContestEventsParams {
  stream: RegistryStream;
  cursor?: EventCursor;
  fromBlock?: bigint;
  toBlock?: bigint;
  limit?: number;
}

export class ContestGatewayError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'ContestGatewayError';
  }
}

export class ContestGatewayAdapter {
  constructor(private readonly gateway: ContestChainGateway, private readonly logger: Logger) {}

  public async pullEvents(params: PullContestEventsParams): Promise<ContestEventBatch> {
    const { stream, cursor, fromBlock, toBlock, limit } = params;

    try {
      const result = await this.gateway.pullContestEvents({
        contest: this.toContestIdentifier(stream),
        cursor,
        fromBlock,
        toBlock,
        limit,
      });

      return result;
    } catch (error) {
      const wrapped = new ContestGatewayError('failed to pull contest events', error);
      this.logger.error(
        {
          err: error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) },
          contestId: stream.contestId,
          chainId: stream.chainId,
        },
        'contest gateway call failed',
      );
      throw wrapped;
    }
  }

  private toContestIdentifier(stream: RegistryStream): ContestIdentifier {
    return {
      contestId: stream.contestId,
      chainId: stream.chainId,
      addresses: stream.addresses,
    } as ContestIdentifier;
  }
}
