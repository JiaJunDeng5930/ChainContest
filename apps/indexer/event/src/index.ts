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

  const interval = scheduleInterval(executeCycle, context.config.service.pollIntervalMs);

  const shutdown = async () => {
    clearInterval(interval);
    await context.shutdown();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

const createStubContestGateway = (): ContestChainGateway => ({
  describeContestLifecycle: async () => {
    throw new Error('describeContestLifecycle is not implemented in stub gateway');
  },
  planParticipantRegistration: async () => {
    throw new Error('planParticipantRegistration is not implemented in stub gateway');
  },
  planPortfolioRebalance: async () => {
    throw new Error('planPortfolioRebalance is not implemented in stub gateway');
  },
  executeContestSettlement: async () => {
    throw new Error('executeContestSettlement is not implemented in stub gateway');
  },
  executeRewardClaim: async () => {
    throw new Error('executeRewardClaim is not implemented in stub gateway');
  },
  executePrincipalRedemption: async () => {
    throw new Error('executePrincipalRedemption is not implemented in stub gateway');
  },
  pullContestEvents: async (): Promise<ContestEventBatch> => ({
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
