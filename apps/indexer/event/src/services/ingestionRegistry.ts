import type { Logger } from 'pino';
import type { AppConfig } from '../config/loadConfig.js';
import type { DbClient } from './dbClient.js';
import type { ContestContractAddresses } from '@chaincontest/chain';
import type { TrackedContestStream } from '@chaincontest/db';

export interface RegistryStream {
  contestId: string;
  chainId: number;
  addresses: ContestContractAddresses;
  startBlock: bigint;
  metadata: Record<string, unknown>;
}

export type RegistrySubscriber = (streams: readonly RegistryStream[]) => void;

export class IngestionRegistry {
  private readonly key = (contestId: string, chainId: number): string => `${contestId}:${chainId}`;

  private readonly entries = new Map<string, RegistryStream>();

  private readonly listeners = new Set<RegistrySubscriber>();

  private lastRefreshedAt = 0;

  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
    private readonly db: DbClient,
  ) {
  }

  public async initialise(): Promise<void> {
    await this.reload();
  }

  public list(): RegistryStream[] {
    return Array.from(this.entries.values());
  }

  public get(contestId: string, chainId: number): RegistryStream | undefined {
    return this.entries.get(this.key(contestId, chainId));
  }

  public subscribe(subscriber: RegistrySubscriber): () => void {
    this.listeners.add(subscriber);
    subscriber(this.list());
    return () => {
      this.listeners.delete(subscriber);
    };
  }

  public async reload(): Promise<void> {
    const next = new Map<string, RegistryStream>();

    const databaseStreams = await this.loadDatabaseStreams();
    databaseStreams.forEach((stream) => next.set(this.key(stream.contestId, stream.chainId), stream));

    this.entries.clear();
    next.forEach((stream, key) => this.entries.set(key, stream));
    this.lastRefreshedAt = Date.now();
    this.logger.info({ source: 'database', count: this.entries.size }, 'ingestion registry reloaded');
    this.notify();
  }

  public async ensureFresh(maxAgeMs: number): Promise<void> {
    if (this.entries.size > 0 && Date.now() - this.lastRefreshedAt < maxAgeMs) {
      return;
    }
    await this.reload();
  }

  private async loadDatabaseStreams(): Promise<RegistryStream[]> {
    if (!this.db.isReady) {
      this.logger.debug('database not initialised; skipping tracked contest registry reload');
      return [];
    }

    try {
      const tracked = await this.db.listTrackedContests();
      return tracked
        .map((stream) => toRegistryStream(stream))
        .filter((entry): entry is RegistryStream => entry !== null);
    } catch (error) {
      this.logger.error({ err: normalizeError(error) }, 'failed to load tracked contests from database');
      return [];
    }
  }

  private notify(): void {
    const snapshot = this.list();
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        this.logger.warn({ err: normalizeError(error) }, 'ingestion registry subscriber threw error');
      }
    });
  }
}

const toRegistryStream = (
  stream: TrackedContestStream,
): RegistryStream | null => {
  const registrar = stream.registrarAddress as `0x${string}` | null;
  if (!registrar) {
    return null;
  }

  const addresses: ContestContractAddresses = { registrar };
  if (stream.treasuryAddress) {
    addresses.treasury = stream.treasuryAddress as `0x${string}`;
  }
  if (stream.settlementAddress) {
    addresses.settlement = stream.settlementAddress as `0x${string}`;
  }
  if (stream.rewardsAddress) {
    addresses.rewards = stream.rewardsAddress as `0x${string}`;
  }

  return {
    contestId: stream.contestId,
    chainId: stream.chainId,
    addresses,
    startBlock: stream.startBlock,
    metadata: stream.metadata,
  };
};

const normalizeError = (error: unknown): Record<string, unknown> => {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { message: String(error) };
};
