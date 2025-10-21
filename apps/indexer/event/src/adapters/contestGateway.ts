import type {
  ContestChainGateway,
  ContestEventBatch,
  ContestIdentifier,
  EventCursor,
} from '@chaincontest/chain';
import type { Logger } from 'pino';
import type { RegistryStream } from '../services/ingestionRegistry.js';
import type { RpcEndpointManager, RpcEndpointSelection } from '../services/rpcEndpointManager.js';
import { withRpcBindings } from '../telemetry/logging.js';

export interface PullContestEventsParams {
  stream: RegistryStream;
  cursor?: EventCursor;
  fromBlock?: bigint;
  toBlock?: bigint;
  limit?: number;
}

export interface ContestGatewayPullResult {
  batch: ContestEventBatch;
  rpc: RpcEndpointSelection | null;
}

export class ContestGatewayError extends Error {
  public readonly rpc: RpcEndpointSelection | null;

  constructor(message: string, options: { cause?: unknown; rpc?: RpcEndpointSelection | null } = {}) {
    super(message, { cause: options.cause });
    this.name = 'ContestGatewayError';
    this.rpc = options.rpc ?? null;
  }
}

export class ContestGatewayAdapter {
  constructor(
    private readonly gateway: ContestChainGateway,
    private readonly logger: Logger,
    private readonly rpcManager: RpcEndpointManager,
  ) {}

  public async pullEvents(params: PullContestEventsParams): Promise<ContestGatewayPullResult> {
    const { stream, cursor, fromBlock, toBlock, limit } = params;
    const rpcSelection = this.rpcManager.getActiveEndpoint(stream.chainId);
    const logger = rpcSelection
      ? withRpcBindings(this.logger, { chainId: stream.chainId, endpointId: rpcSelection.endpointId })
      : this.logger;

    try {
      const result = await this.gateway.pullContestEvents({
        contest: this.toContestIdentifier(stream),
        cursor,
        fromBlock,
        toBlock,
        rpcUrl: rpcSelection?.url,
        limit,
      });

      if (rpcSelection) {
        this.rpcManager.recordSuccess({ chainId: stream.chainId, endpointId: rpcSelection.endpointId });
      }

      return { batch: result, rpc: rpcSelection };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (rpcSelection && this.shouldRecordRpcFailure(error)) {
        this.rpcManager.recordFailure({
          chainId: stream.chainId,
          endpointId: rpcSelection.endpointId,
          reason: message,
        });
      }

      logger.error(
        {
          err: error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) },
          contestId: stream.contestId,
          chainId: stream.chainId,
        },
        'contest gateway call failed',
      );

      throw new ContestGatewayError('failed to pull contest events', { cause: error, rpc: rpcSelection });
    }
  }

  private toContestIdentifier(stream: RegistryStream): ContestIdentifier {
    return {
      contestId: stream.contestId,
      chainId: stream.chainId,
      addresses: stream.addresses,
    } as ContestIdentifier;
  }

  private shouldRecordRpcFailure(error: unknown): boolean {
    const retryable = this.getContestChainErrorRetryable(error);
    if (retryable !== null) {
      return retryable === true;
    }
    return true;
  }

  private getContestChainErrorRetryable(error: unknown): boolean | null {
    if (!error || typeof error !== 'object') {
      return null;
    }
    const candidate = error as { code?: unknown; retryable?: unknown };
    if (typeof candidate.code === 'string' && typeof candidate.retryable === 'boolean') {
      return candidate.retryable;
    }
    return null;
  }
}
