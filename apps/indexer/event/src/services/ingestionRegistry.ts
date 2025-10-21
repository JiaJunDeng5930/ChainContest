import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { AppConfig } from '../config/loadConfig.js';
import type { ContestContractAddresses } from '@chaincontest/chain';

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

  constructor(private readonly config: AppConfig, private readonly logger: Logger) {
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
    if (!this.sourcePath) {
      this.logger.warn('no registry source configured, ingestion registry remains empty');
      this.entries.clear();
      this.notify();
      return;
    }

    const filePath = resolveAbsolutePath(this.sourcePath);

    try {
      const data = await fs.readFile(filePath, 'utf8');
      const parsed = registrySchema.parse(JSON.parse(data));
      this.entries.clear();
      parsed.streams.forEach((stream) => {
        const entry: RegistryStream = {
          contestId: stream.contestId,
          chainId: stream.chainId,
          addresses: normalizeAddresses(stream.addresses),
          startBlock: BigInt(stream.startBlock),
          metadata: stream.metadata ?? {},
        };
        this.entries.set(this.key(entry.contestId, entry.chainId), entry);
      });
      this.logger.info({ source: filePath, count: this.entries.size }, 'ingestion registry reloaded');
      this.notify();
    } catch (error) {
      this.logger.error({ err: normalizeError(error), source: filePath }, 'failed to load ingestion registry');
      throw error;
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

const normalizeError = (error: unknown): Record<string, unknown> => {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { message: String(error) };
};
