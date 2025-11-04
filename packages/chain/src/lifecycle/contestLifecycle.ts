import { defineChain, createPublicClient, type Chain, type PublicClient, type Address, type Hex, type Hash } from 'viem';
import { waitForTransactionReceipt, readContract, writeContract } from 'viem/actions';
import { contestArtifact } from '../gateway/artifacts.js';
import type { DeploymentRuntime } from '../runtime/deploymentRuntime.js';

interface ChainClients {
  readonly chain: Chain;
  readonly publicClient: PublicClient;
}

const chainClientCache = new Map<string, ChainClients>();

const createChainKey = (chainId: number, rpcUrls: readonly string[]): string =>
  `${chainId}:${rpcUrls.join(',')}`;

const getChainClients = (runtime: DeploymentRuntime, chainId: number): ChainClients => {
  const rpcUrls = runtime.resolveRpcUrls(chainId);
  const cacheKey = createChainKey(chainId, rpcUrls);
  const cached = chainClientCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const chain = defineChain({
    id: chainId,
    name: `contest-chain-${chainId}`,
    network: `contest-chain-${chainId}`,
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18
    },
    rpcUrls: {
      default: { http: rpcUrls.slice() },
      public: { http: rpcUrls.slice() }
    }
  });

  const transport = runtime.createTransport(chainId);
  const publicClient = createPublicClient({
    chain,
    transport
  });

  const clients: ChainClients = {
    chain,
    publicClient
  };

  chainClientCache.set(cacheKey, clients);
  return clients;
};

export interface ContestReference {
  readonly chainId: number;
  readonly contestAddress: Address;
}

const executeTransaction = async (
  runtime: DeploymentRuntime,
  reference: ContestReference,
  functionName: 'freeze' | 'seal' | 'syncState',
): Promise<Hash> => {
  const { chain, publicClient } = getChainClients(runtime, reference.chainId);
  const walletClient = runtime.createWalletClient(chain);

  const txHash = await writeContract(walletClient, {
    abi: contestArtifact.abi,
    address: reference.contestAddress,
    functionName,
    account: walletClient.account ?? runtime.account,
    chain
  });

  await waitForTransactionReceipt(publicClient, { hash: txHash });
  return txHash;
};

export const freezeContest = (
  runtime: DeploymentRuntime,
  reference: ContestReference
): Promise<Hash> => executeTransaction(runtime, reference, 'freeze');

export const syncContestState = (
  runtime: DeploymentRuntime,
  reference: ContestReference
): Promise<Hash> => executeTransaction(runtime, reference, 'syncState');

export const sealContest = (
  runtime: DeploymentRuntime,
  reference: ContestReference
): Promise<Hash> => executeTransaction(runtime, reference, 'seal');

export interface SettleParticipantRequest extends ContestReference {
  readonly participantAddress: Address;
}

export const settleContestParticipant = async (
  runtime: DeploymentRuntime,
  request: SettleParticipantRequest
): Promise<Hash> => {
  const { chain, publicClient } = getChainClients(runtime, request.chainId);
  const walletClient = runtime.createWalletClient(chain);

  const txHash = await writeContract(walletClient, {
    abi: contestArtifact.abi,
    address: request.contestAddress,
    functionName: 'settle',
    args: [request.participantAddress],
    account: walletClient.account ?? runtime.account,
    chain
  });

  await waitForTransactionReceipt(publicClient, { hash: txHash });
  return txHash;
};

export interface ContestStateSnapshot {
  readonly state: 'uninitialized' | 'registering' | 'live' | 'frozen' | 'sealed' | 'closed';
  readonly participantCount: number;
  readonly settledCount: number;
  readonly leaderboardVersion: number;
}

const stateMap = new Map<number, ContestStateSnapshot['state']>([
  [0, 'uninitialized'],
  [1, 'registering'],
  [2, 'live'],
  [3, 'frozen'],
  [4, 'sealed'],
  [5, 'closed']
]);

export const readContestState = async (
  runtime: DeploymentRuntime,
  reference: ContestReference
): Promise<ContestStateSnapshot> => {
  const { publicClient } = getChainClients(runtime, reference.chainId);

  const [stateRaw, participantCountRaw, settledCountRaw, leaderboardVersionRaw] = await Promise.all([
    readContract(publicClient, {
      abi: contestArtifact.abi,
      address: reference.contestAddress,
      functionName: 'state'
    }),
    readContract(publicClient, {
      abi: contestArtifact.abi,
      address: reference.contestAddress,
      functionName: 'participantCount'
    }),
    readContract(publicClient, {
      abi: contestArtifact.abi,
      address: reference.contestAddress,
      functionName: 'settledCount'
    }),
    readContract(publicClient, {
      abi: contestArtifact.abi,
      address: reference.contestAddress,
      functionName: 'leaderboardVersion'
    })
  ]);

  const state =
    typeof stateRaw === 'number'
      ? stateMap.get(stateRaw) ?? 'uninitialized'
      : stateMap.get(Number(stateRaw)) ?? 'uninitialized';

  const participantCount =
    typeof participantCountRaw === 'bigint' ? Number(participantCountRaw) : Number(participantCountRaw ?? 0);
  const settledCount =
    typeof settledCountRaw === 'bigint' ? Number(settledCountRaw) : Number(settledCountRaw ?? 0);
  const leaderboardVersion =
    typeof leaderboardVersionRaw === 'bigint' ? Number(leaderboardVersionRaw) : Number(leaderboardVersionRaw ?? 0);

  return {
    state,
    participantCount,
    settledCount,
    leaderboardVersion
  };
};

export interface ContestTimelineSnapshot {
  readonly registeringEnds: Date;
  readonly liveEnds: Date;
  readonly claimEnds: Date;
}

export const readContestTimeline = async (
  runtime: DeploymentRuntime,
  reference: ContestReference
): Promise<ContestTimelineSnapshot> => {
  const { publicClient } = getChainClients(runtime, reference.chainId);

  const timeline = await readContract(publicClient, {
    abi: contestArtifact.abi,
    address: reference.contestAddress,
    functionName: 'timeline'
  }) as { registeringEnds: bigint; liveEnds: bigint; claimEnds: bigint };

  const toDate = (value: bigint): Date => new Date(Number(value) * 1_000);

  return {
    registeringEnds: toDate(timeline.registeringEnds),
    liveEnds: toDate(timeline.liveEnds),
    claimEnds: toDate(timeline.claimEnds)
  };
};

export const readContestTopK = async (
  runtime: DeploymentRuntime,
  reference: ContestReference
): Promise<number> => {
  const { publicClient } = getChainClients(runtime, reference.chainId);

  const config = await readContract(publicClient, {
    abi: contestArtifact.abi,
    address: reference.contestAddress,
    functionName: 'config'
  }) as { topK: number };

  const raw = config.topK;
  return typeof raw === 'bigint' ? Number(raw) : Number(raw ?? 0);
};

export interface VaultScore {
  readonly settled: boolean;
  readonly nav: bigint;
  readonly roiBps: number;
}

export const readVaultScore = async (
  runtime: DeploymentRuntime,
  reference: ContestReference,
  vaultId: Hex
): Promise<VaultScore> => {
  const { publicClient } = getChainClients(runtime, reference.chainId);

  const [settledRaw, navRaw, roiRaw] = await Promise.all([
    readContract(publicClient, {
      abi: contestArtifact.abi,
      address: reference.contestAddress,
      functionName: 'vaultSettled',
      args: [vaultId]
    }) as Promise<boolean>,
    readContract(publicClient, {
      abi: contestArtifact.abi,
      address: reference.contestAddress,
      functionName: 'vaultNavs',
      args: [vaultId]
    }) as Promise<bigint>,
    readContract(publicClient, {
      abi: contestArtifact.abi,
      address: reference.contestAddress,
      functionName: 'vaultRoiBps',
      args: [vaultId]
    }) as Promise<bigint>
  ]);

  return {
    settled: Boolean(settledRaw),
    nav: navRaw ?? 0n,
    roiBps: Number(roiRaw ?? 0n)
  };
};

export interface LeaderboardUpdate {
  readonly vaultId: Hex;
  readonly nav: bigint;
  readonly roiBps: number;
}

export interface LeaderboardComputationInput {
  readonly runtime: DeploymentRuntime;
  readonly reference: ContestReference;
  readonly vaultIds: readonly Hex[];
  readonly topK: number;
}

export const computeLeaderboardUpdates = async (
  input: LeaderboardComputationInput
): Promise<LeaderboardUpdate[]> => {
  const scores = await Promise.all(
    input.vaultIds.map(async (vaultId) => {
      const score = await readVaultScore(input.runtime, input.reference, vaultId);
      return { vaultId, ...score };
    })
  );

  const settledScores = scores.filter((score) => score.settled);
  settledScores.sort((left, right) => {
    if (left.nav === right.nav) {
      return right.roiBps - left.roiBps;
    }
    return left.nav > right.nav ? -1 : 1;
  });

  return settledScores.slice(0, input.topK).map((entry) => ({
    vaultId: entry.vaultId,
    nav: entry.nav,
    roiBps: entry.roiBps
  }));
};

export interface UpdateLeadersRequest extends ContestReference {
  readonly updates: readonly LeaderboardUpdate[];
}

export const updateContestLeaders = async (
  runtime: DeploymentRuntime,
  request: UpdateLeadersRequest
): Promise<Hash> => {
  const { chain, publicClient } = getChainClients(runtime, request.chainId);
  const walletClient = runtime.createWalletClient(chain);

  const payload = request.updates.map((update) => ({
    vaultId: update.vaultId,
    nav: update.nav,
    roiBps: BigInt(update.roiBps)
  }));

  const txHash = await writeContract(walletClient, {
    abi: contestArtifact.abi,
    address: request.contestAddress,
    functionName: 'updateLeaders',
    args: [payload],
    account: walletClient.account ?? runtime.account,
    chain
  });

  await waitForTransactionReceipt(publicClient, { hash: txHash });
  return txHash;
};

export const resetContestLifecycleCache = (): void => {
  chainClientCache.clear();
};
