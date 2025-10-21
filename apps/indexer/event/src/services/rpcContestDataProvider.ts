/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/require-await */
import fs from 'node:fs';
import type { Logger } from 'pino';
import {
  decodeEventLog,
  type Block,
  type Hex,
  type Log,
  type PublicClient,
} from 'viem';
import {
  type ContestChainDataProvider,
  type ContestDefinition,
  type ContestEventEnvelope,
  type ContestEventType,
  type ContestIdentifier,
  type RpcClientFactory,
} from '@chaincontest/chain';
import type { AppConfig } from '../config/loadConfig.js';
import { contestEventAbi } from '../chain/contestAbi.js';

interface RpcContestDataProviderOptions {
  config: AppConfig;
  rpcClientFactory: RpcClientFactory;
  logger?: Logger;
}

interface RegistrySnapshot {
  key: string;
  startBlock: bigint;
}

interface BlockAnchorMetadata {
  blockNumber: bigint;
  blockHash: Hex;
  timestamp?: string;
}

type SupportedContestEvent =
  | 'ContestRegistered'
  | 'ContestFrozen'
  | 'ContestSealed'
  | 'VaultSettled'
  | 'RewardClaimed'
  | 'VaultExited';

interface DecodedContestEvent {
  type: ContestEventType;
  payload: Record<string, unknown>;
}

export class RpcContestDataProvider implements ContestChainDataProvider {
  private readonly rpcClientFactory: RpcClientFactory;

  private readonly logger?: Logger;

  private readonly registryPath?: string;

  private registryMtime: number | null = null;

  private registryCache = new Map<string, RegistrySnapshot>();

  constructor(options: RpcContestDataProviderOptions) {
    this.rpcClientFactory = options.rpcClientFactory;
    this.logger = options.logger;
    this.registryPath = options.config.registry.sourcePath;
  }

  public async loadContestDefinition(
    contest: ContestIdentifier,
    options?: { readonly blockTag?: bigint | 'latest' },
  ): Promise<ContestDefinition> {
    const client = this.rpcClientFactory({
      chainId: contest.chainId,
      cacheKey: `contest:${contest.chainId}:${contest.contestId}`,
    });

    const toBlock = await this.resolveToBlock(client, options?.blockTag);
    const fromBlock = await this.resolveFromBlock(contest, client, toBlock);

    const events = await this.pullContestEvents(client, contest, fromBlock, toBlock);
    const derivedAt = events.length > 0 ? events[events.length - 1]!.derivedAt : await this.readBlockAnchor(client, toBlock);

    return {
      contest,
      phase: 'live',
      timeline: {},
      prizePool: {
        currentBalance: '0',
        accumulatedInflow: '0',
      },
      registrationCapacity: {
        registered: 0,
        maximum: 0,
        isFull: false,
      },
      qualificationVerdict: {
        result: 'pass',
      },
      derivedAt,
      registration: {
        window: {
          opensAt: new Date(0).toISOString(),
          closesAt: new Date(0).toISOString(),
        },
        requirement: {
          tokenAddress: contest.addresses.registrar,
          amount: '0',
          spender: contest.addresses.registrar,
        },
        template: {
          call: {
            to: contest.addresses.registrar,
            data: '0x',
          },
        },
      },
      participants: {},
      events: {
        events,
      },
    };
  }

  private resolveToBlock(client: PublicClient, blockTag?: bigint | 'latest'): Promise<bigint> {
    if (!blockTag || blockTag === 'latest') {
      return client.getBlockNumber();
    }
    return Promise.resolve(BigInt(blockTag));
  }

  private async resolveFromBlock(
    contest: ContestIdentifier,
    client: PublicClient,
    toBlock: bigint,
  ): Promise<bigint> {
    const fromRegistry = this.lookupStartBlock(contest);
    if (fromRegistry !== null) {
      return fromRegistry;
    }

    // Fall back to the deployment block by scanning backwards for the first log
    // to avoid replaying the entire chain.
    try {
      const logs = await client.getLogs({
        address: contest.addresses.registrar,
        toBlock,
        fromBlock: toBlock > 5_000n ? toBlock - 5_000n : 0n,
      });
      if (logs.length > 0 && logs[0]?.blockNumber !== undefined && logs[0]?.blockNumber !== null) {
        return logs[0]!.blockNumber!;
      }
    } catch (error) {
      this.logger?.warn(
        {
          contestId: contest.contestId,
          chainId: contest.chainId,
          err: this.normalizeError(error),
        },
        'failed to infer contest deployment block; defaulting to block zero',
      );
    }

    return 0n;
  }

  private lookupStartBlock(contest: ContestIdentifier): bigint | null {
    if (!this.registryPath) {
      return null;
    }

    try {
      const stats = fs.statSync(this.registryPath);
      const mtime = stats.mtimeMs;
      if (this.registryMtime !== mtime) {
        this.reloadRegistryCache(mtime);
      }

      const snapshot = this.registryCache.get(this.cacheKey(contest));
      return snapshot?.startBlock ?? null;
    } catch (error) {
      this.logger?.warn(
        {
          contestId: contest.contestId,
          chainId: contest.chainId,
          source: this.registryPath,
          err: this.normalizeError(error),
        },
        'failed to load ingestion registry for start block lookup',
      );
      return null;
    }
  }

  private reloadRegistryCache(mtimeMs: number): void {
    if (!this.registryPath) {
      return;
    }

    let parsed: unknown;
    try {
      const raw = fs.readFileSync(this.registryPath, 'utf8');
      parsed = JSON.parse(raw) as unknown;
    } catch (error) {
      this.logger?.warn(
        {
          source: this.registryPath,
          err: this.normalizeError(error),
        },
        'failed to parse ingestion registry; start block cache reset',
      );
      this.registryCache = new Map<string, RegistrySnapshot>();
      this.registryMtime = mtimeMs;
      return;
    }

    const streamsRaw = (parsed as { streams?: unknown }).streams;
    const streams = Array.isArray(streamsRaw) ? streamsRaw : [];

    const next = new Map<string, RegistrySnapshot>();
    streams.forEach((entry) => {
      if (!isRegistryStream(entry)) {
        return;
      }
      const key = `${entry.contestId}:${entry.chainId}`;
      if (entry.startBlock === undefined || entry.startBlock === null) {
        return;
      }
      try {
        const startBlock = BigInt(entry.startBlock);
        next.set(key, { key, startBlock });
      } catch (error) {
        this.logger?.warn(
          {
            contestId: entry.contestId,
            chainId: entry.chainId,
            startBlock: entry.startBlock,
            err: this.normalizeError(error),
          },
          'failed to parse start block from registry entry',
        );
      }
    });

    this.registryCache = next;
    this.registryMtime = mtimeMs;
  }

  private cacheKey(contest: ContestIdentifier): string {
    return `${contest.contestId}:${contest.chainId}`;
  }

  private async pullContestEvents(
    client: PublicClient,
    contest: ContestIdentifier,
    fromBlock: bigint,
    toBlock: bigint,
  ): Promise<ContestEventEnvelope[]> {
    const logs = await client.getLogs({
      address: contest.addresses.registrar,
      fromBlock,
      toBlock,
    });

    const blockCache = new Map<bigint, BlockAnchorMetadata>();
    const envelopes: ContestEventEnvelope[] = [];

    for (const log of logs) {
      const decoded = this.decodeContestLog(log);
      if (!decoded) {
        continue;
      }

      const blockNumber = log.blockNumber ?? null;
      if (blockNumber === null) {
        continue;
      }

      const metadata = await this.getBlockMetadata(client, blockNumber, log.blockHash, blockCache);

      envelopes.push({
        type: decoded.type,
        blockNumber,
        logIndex: Number(log.logIndex ?? 0),
        txHash: (log.transactionHash ?? '0x') as Hex,
        cursor: {
          blockNumber,
          logIndex: Number(log.logIndex ?? 0),
        },
        payload: decoded.payload,
        reorgFlag: Boolean(log.removed),
        derivedAt: {
          blockNumber: metadata.blockNumber,
          blockHash: metadata.blockHash,
          timestamp: metadata.timestamp,
        },
      });
    }

    envelopes.sort((left, right) => {
      if (left.blockNumber === right.blockNumber) {
        return left.logIndex - right.logIndex;
      }
      return left.blockNumber < right.blockNumber ? -1 : 1;
    });

    return envelopes;
  }

  private decodeContestLog(log: Log): DecodedContestEvent | null {
    try {
      const decoded = decodeEventLog({
        abi: contestEventAbi,
        data: log.data,
        topics: log.topics,
        strict: false,
      });

      const eventName = decoded.eventName as SupportedContestEvent | undefined;
      if (!eventName) {
        return null;
      }

      const args = isRecord(decoded.args) ? decoded.args : null;
      if (!args) {
        return null;
      }

      switch (eventName) {
        case 'ContestRegistered':
          {
            const participant = args.participant;
            const vault = args.vault;
            if (typeof participant !== 'string' || typeof vault !== 'string') {
              return null;
            }
            return {
              type: 'registration',
              payload: {
                participant,
                vault,
                entryAmount: this.toString(args.entryAmount),
                entryFee: this.toString(args.entryFee),
              },
            };
          }
        case 'ContestFrozen':
          return {
            type: 'settlement',
            payload: {
              phase: 'frozen',
              frozenAt: this.toString(args.frozenAt),
            },
          };
        case 'ContestSealed':
          return {
            type: 'settlement',
            payload: {
              phase: 'sealed',
              sealedAt: this.toString(args.sealedAt),
            },
          };
        case 'VaultSettled':
          return {
            type: 'settlement',
            payload: {
              vaultId: typeof args.vaultId === 'string' ? args.vaultId : this.toString(args.vaultId),
              nav: this.toString(args.nav),
              roiBps: this.toString(args.roiBps),
            },
          };
        case 'RewardClaimed':
          return {
            type: 'reward',
            payload: {
              vaultId: typeof args.vaultId === 'string' ? args.vaultId : this.toString(args.vaultId),
              amount: this.toString(args.amount),
            },
          };
        case 'VaultExited':
          return {
            type: 'redemption',
            payload: {
              vaultId: typeof args.vaultId === 'string' ? args.vaultId : this.toString(args.vaultId),
              baseReturned: this.toString(args.baseReturned),
              quoteReturned: this.toString(args.quoteReturned),
            },
          };
        default:
          return null;
      }
    } catch (error) {
      const normalized = this.normalizeError(error);
      this.logger?.debug(
        {
          topics: log.topics,
          err: normalized,
        },
        'failed to decode contest event log',
      );
      return null;
    }
  }

  private async getBlockMetadata(
    client: PublicClient,
    blockNumber: bigint,
    blockHash: Hex | null | undefined,
    cache: Map<bigint, BlockAnchorMetadata>,
  ): Promise<BlockAnchorMetadata> {
    const cached = cache.get(blockNumber);
    if (cached) {
      return cached;
    }

    const block = await this.readBlock(client, blockNumber, blockHash);
    const metadata: BlockAnchorMetadata = {
      blockNumber,
      blockHash: block.hash as Hex,
      timestamp: block.timestamp ? this.toISOString(block.timestamp) : undefined,
    };

    cache.set(blockNumber, metadata);
    return metadata;
  }

  private async readBlock(client: PublicClient, blockNumber: bigint, blockHash?: Hex | null): Promise<Block> {
    if (blockHash) {
      return client.getBlock({ blockHash });
    }
    return client.getBlock({ blockNumber });
  }

  private async readBlockAnchor(client: PublicClient, blockNumber: bigint): Promise<BlockAnchorMetadata> {
    const block = await client.getBlock({ blockNumber });
    return {
      blockNumber,
      blockHash: block.hash as Hex,
      timestamp: block.timestamp ? this.toISOString(block.timestamp) : undefined,
    };
  }

  private toString(value: unknown): string {
    if (typeof value === 'bigint') {
      return value.toString(10);
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value.toString(10) : '0';
    }
    if (typeof value === 'string') {
      return value;
    }
    return String(value);
  }

  private toISOString(value: bigint | number | string): string {
    const milliseconds =
      typeof value === 'bigint'
        ? Number(value) * 1000
        : typeof value === 'number'
          ? value * 1000
          : Number(value) * 1000;
    const date = new Date(milliseconds);
    return Number.isNaN(date.valueOf()) ? new Date(0).toISOString() : date.toISOString();
  }

  private normalizeError(error: unknown): Record<string, unknown> {
    if (error instanceof Error) {
      return {
        message: error.message,
        name: error.name,
        stack: error.stack,
      };
    }
    return { message: String(error) };
  }
}

export const createRpcContestDataProvider = (
  options: RpcContestDataProviderOptions,
): ContestChainDataProvider => new RpcContestDataProvider(options);

const isRegistryStream = (
  value: unknown,
): value is { contestId: string; chainId: number; startBlock?: string | number | bigint } =>
  Boolean(
    value &&
      typeof value === 'object' &&
      'contestId' in value &&
      typeof (value as { contestId: unknown }).contestId === 'string' &&
      'chainId' in value &&
      typeof (value as { chainId: unknown }).chainId === 'number',
  );

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object');
