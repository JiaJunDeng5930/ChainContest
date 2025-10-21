import { setInterval as scheduleInterval, clearInterval } from 'node:timers';
import process from 'node:process';
import type {
  ContestChainGateway,
  ContestEventBatch,
} from '@chaincontest/chain';
import { bootstrapContext } from './bootstrap/context.js';

const main = async (): Promise<void> => {
  const context = bootstrapContext({ contestGateway: createStubContestGateway() });

  await context.start();
  context.logger.warn('contest gateway is running in stub mode; no events will be ingested');

  const initialSnapshot = context.health.snapshot();
  context.logger.info(
    {
      streams: initialSnapshot.streams.map((stream) => ({
        contestId: stream.contestId,
        chainId: stream.chainId,
        mode: stream.mode,
      })),
    },
    'indexer event service started',
  );

  const executeCycle = async () => {
    try {
      await context.runLiveCycle();
    } catch (error) {
      context.logger.error(
        { err: error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) } },
        'live ingestion cycle failed',
      );
    }
  };

  await executeCycle();

  const interval = scheduleInterval(() => {
    void executeCycle();
  }, context.config.service.pollIntervalMs);

  const shutdown = async () => {
    clearInterval(interval);
    context.registry.list().forEach((stream) => {
      context.health.setMode(stream, 'paused');
    });
    await context.shutdown();
    context.logger.info({ status: context.health.getHealth() }, 'indexer event service stopped');
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
};

const createStubContestGateway = (): ContestChainGateway => ({
  describeContestLifecycle: () =>
    Promise.reject(new Error('describeContestLifecycle is not implemented in stub gateway')),
  planParticipantRegistration: () =>
    Promise.reject(new Error('planParticipantRegistration is not implemented in stub gateway')),
  planPortfolioRebalance: () =>
    Promise.reject(new Error('planPortfolioRebalance is not implemented in stub gateway')),
  executeContestSettlement: () =>
    Promise.reject(new Error('executeContestSettlement is not implemented in stub gateway')),
  executeRewardClaim: () =>
    Promise.reject(new Error('executeRewardClaim is not implemented in stub gateway')),
  executePrincipalRedemption: () =>
    Promise.reject(new Error('executePrincipalRedemption is not implemented in stub gateway')),
  pullContestEvents: (): Promise<ContestEventBatch> =>
    Promise.resolve({
      events: [],
      nextCursor: { blockNumber: 0n, logIndex: 0 },
      latestBlock: { blockNumber: 0n, blockHash: '0x0' as `0x${string}`, timestamp: new Date().toISOString() },
    }),
});

void main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Indexer failed to start', error);
  process.exit(1);
});
