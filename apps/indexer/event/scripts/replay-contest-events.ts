import { createPublicClient, decodeEventLog, http, parseAbiItem, type Transport } from 'viem';
import pino from 'pino';
import { createDbClient } from '../src/services/dbClient.js';
import { loadConfig } from '../src/config/loadConfig.js';
import { createSettlementEventHandler } from '../src/pipelines/settlementHandler.js';
import { createRewardEventHandler } from '../src/pipelines/rewardHandler.js';
import type { RegistryStream } from '../src/services/ingestionRegistry.js';
import type { ContestEventEnvelope } from '@chaincontest/chain';

const EVENT_ABI = [
  parseAbiItem('event ContestFrozen(bytes32 indexed contestId, uint64 frozenAt)'),
  parseAbiItem('event ContestSealed(bytes32 indexed contestId, uint64 sealedAt)'),
  parseAbiItem('event VaultSettled(bytes32 indexed vaultId, uint256 nav, int32 roiBps)'),
  parseAbiItem('event RewardClaimed(bytes32 indexed contestId, bytes32 indexed vaultId, uint256 amount)'),
] as const;

const toLowerHex = (value: string | null | undefined): `0x${string}` | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return /^0x[0-9a-fA-F]+$/.test(trimmed) ? (trimmed.toLowerCase() as `0x${string}`) : null;
};

const readRequiredEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
};

const loadStream = (streams: readonly RegistryStream[], contestId: string): RegistryStream => {
  const stream = streams.find((entry) => entry.contestId === contestId);
  if (!stream) {
    throw new Error(`Contest ${contestId} not found in registry`);
  }
  return stream;
};

const buildEnvelope = async (
  client: ReturnType<typeof createPublicClient<Transport>>,
  stream: RegistryStream,
  log: any,
): Promise<ContestEventEnvelope> => {
  const decoded = decodeEventLog({
    abi: EVENT_ABI,
    data: log.data,
    topics: log.topics,
    strict: false,
  });

  const block = await client.getBlock({ blockNumber: log.blockNumber });
  if (!block) {
    throw new Error(`Block ${log.blockNumber} not found`);
  }

  const baseEnvelope = {
    blockNumber: log.blockNumber,
    logIndex: Number(log.logIndex),
    txHash: log.transactionHash,
    cursor: {
      blockNumber: log.blockNumber,
      logIndex: Number(log.logIndex),
    },
    reorgFlag: false,
    derivedAt: {
      blockNumber: log.blockNumber,
      blockHash: block.hash!,
      timestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
    },
  };

  switch (decoded.eventName) {
    case 'ContestFrozen':
      return {
        ...baseEnvelope,
        type: 'settlement',
        payload: {
          phase: 'frozen',
          frozenAt: decoded.args?.frozenAt?.toString() ?? '0',
        },
      };
    case 'ContestSealed':
      return {
        ...baseEnvelope,
        type: 'settlement',
        payload: {
          phase: 'sealed',
          sealedAt: decoded.args?.sealedAt?.toString() ?? '0',
        },
      };
    case 'VaultSettled':
      return {
        ...baseEnvelope,
        type: 'settlement',
        payload: {
          vaultId: toLowerHex(decoded.args?.vaultId as string | undefined),
          nav: (decoded.args?.nav as bigint | number | string | undefined)?.toString() ?? '0',
          roiBps: (decoded.args?.roiBps as bigint | number | string | undefined)?.toString() ?? '0',
        },
      };
    case 'RewardClaimed':
      return {
        ...baseEnvelope,
        type: 'reward',
        payload: {
          vaultId: toLowerHex(decoded.args?.vaultId as string | undefined),
          amount: (decoded.args?.amount as bigint | number | string | undefined)?.toString() ?? '0',
        },
      };
    default:
      throw new Error(`Unsupported event ${decoded.eventName}`);
  }
};

const main = async (): Promise<void> => {
  const contestId = readRequiredEnv('CONTEST_ID');
  const rpcUrl = process.env.RPC_URL ?? 'http://127.0.0.1:8545';

  const config = loadConfig();
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

  const db = createDbClient({ config, logger, metricsHook: () => {} });
  await db.init();

  try {
    const streams = await db.listTrackedContests();
    const stream = loadStream(streams, contestId);

    const client = createPublicClient({
      chain: { id: stream.chainId, name: `chain-${stream.chainId}`, nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] }, public: { http: [rpcUrl] } } },
      transport: http(rpcUrl),
    });
    const contestAddress = toLowerHex(stream.contractAddress);
    if (!contestAddress) {
      throw new Error('Contest stream missing contract address');
    }

    const logs = await client.getLogs({
      address: contestAddress,
      events: EVENT_ABI,
      fromBlock: 0n,
      toBlock: 'latest',
    });

    const settlementHandler = createSettlementEventHandler({ db, logger });
    const rewardHandler = createRewardEventHandler({ db, logger });

    for (const log of logs) {
      const envelope = await buildEnvelope(client, stream, log);
      const context = { stream, event: envelope };
      if (envelope.type === 'settlement') {
        await settlementHandler(context);
      } else if (envelope.type === 'reward') {
        await rewardHandler(context);
      }
    }
  } finally {
    await db.shutdown();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
