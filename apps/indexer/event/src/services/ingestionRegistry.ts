import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Logger } from 'pino';
import { z } from 'zod';
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

  private readonly sourcePath?: string;

  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
    private readonly db: DbClient,
  ) {
    this.sourcePath = config.registry.sourcePath;
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

    const fileStreams = await this.loadFileStreams();
    fileStreams.forEach((stream) => next.set(this.key(stream.contestId, stream.chainId), stream));

    const databaseStreams = await this.loadDatabaseStreams();
    databaseStreams.forEach((stream) => next.set(this.key(stream.contestId, stream.chainId), stream));

    this.entries.clear();
    next.forEach((stream, key) => this.entries.set(key, stream));
    this.logger.info(
      { source: this.sourcePath ?? 'database', count: this.entries.size },
      'ingestion registry reloaded',
    );
    this.notify();
  }

  private async loadFileStreams(): Promise<RegistryStream[]> {
    if (!this.sourcePath) {
      this.logger.warn('no registry source configured, falling back to database tracked contests');
      return [];
    }

    const filePath = resolveAbsolutePath(this.sourcePath);

    try {
      const data = await fs.readFile(filePath, 'utf8');
      const parsed = registrySchema.parse(JSON.parse(data));
      return parsed.streams.map((stream) => ({
        contestId: stream.contestId,
        chainId: stream.chainId,
        addresses: normalizeAddresses(stream.addresses),
        startBlock: BigInt(stream.startBlock),
        metadata: stream.metadata ?? {},
      }));
    } catch (error) {
      this.logger.error({ err: normalizeError(error), source: filePath }, 'failed to load ingestion registry');
      throw error;
    }
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

const streamSchema = z.object({
  contestId: z.string().min(1),
  chainId: z.number().int(),
  addresses: z.object({
    registrar: z.string().min(1),
    treasury: z.string().optional(),
    settlement: z.string().optional(),
    rewards: z.string().optional(),
    redemption: z.string().optional(),
    oracle: z.string().optional(),
    policy: z.string().optional(),
  }),
  startBlock: z.union([z.string(), z.number(), z.bigint()]).default(0),
  metadata: z.record(z.unknown()).optional(),
});

const registrySchema = z.object({
  streams: z.array(streamSchema).default([]),
});

const resolveAbsolutePath = (input: string): string =>
  path.isAbsolute(input) ? input : path.resolve(process.cwd(), input);

type StreamSchema = z.infer<typeof streamSchema>;

const normalizeAddresses = (addresses: StreamSchema['addresses']): ContestContractAddresses => {
  const { registrar, ...rest } = addresses;
  const normalised: ContestContractAddresses = {
    registrar: ensureLowercaseHex(registrar),
  };

  Object.entries(rest).forEach(([key, value]) => {
    if (typeof value === 'string' && value.length > 0) {
      (normalised as unknown as Record<string, string>)[key] = ensureLowercaseHex(value);
    }
  });

  return normalised;
};

const ensureLowercaseHex = (value: string): `0x${string}` => value.toLowerCase() as `0x${string}`;

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
