import type { Address, Hex } from 'viem';
import type { Chain } from 'viem';
import { getBlock, waitForTransactionReceipt, writeContract } from 'viem/actions';
import {
  contestArtifact,
  vaultFactoryArtifact
} from './artifacts.js';
import type { DeploymentRuntime } from '../runtime/deploymentRuntime.js';
import { wrapContestChainError } from '../errors/contestChainError.js';

export interface ContestConfigInput {
  readonly entryAsset: Address;
  readonly entryAmount: bigint;
  readonly entryFee: bigint;
  readonly priceSource: Address;
  readonly swapPool: Address;
  readonly priceToleranceBps: number;
  readonly settlementWindow: number;
  readonly maxParticipants: number;
  readonly topK: number;
}

export interface ContestTimelineInput {
  readonly registeringEnds: bigint;
  readonly liveEnds: bigint;
  readonly claimEnds: bigint;
}

export interface ContestDeploymentParams {
  readonly runtime: DeploymentRuntime;
  readonly chain: Chain;
  readonly organizer: Address;
  readonly contestId: Hex;
  readonly vaultImplementation: Address;
  readonly config: ContestConfigInput;
  readonly timeline: ContestTimelineInput;
  readonly initialPrizeAmount: bigint;
  readonly payoutSchedule: readonly number[];
  readonly metadata?: Record<string, unknown>;
}

export interface DeploymentTransactionReceipt {
  readonly transactionHash: Hex;
  readonly blockNumber: bigint;
  readonly confirmedAt: string | null;
}

export interface ContestDeploymentResult {
  readonly contestAddress: Address;
  readonly vaultFactoryAddress: Address;
  readonly contestDeployment: DeploymentTransactionReceipt;
  readonly vaultFactoryDeployment: DeploymentTransactionReceipt;
  readonly initialization: DeploymentTransactionReceipt;
}

const normalizeSchedule = (schedule: readonly number[]): number[] => {
  const next = Array.from({ length: 32 }, (_, index) => schedule[index] ?? 0);
  return next.map((value) => Math.max(0, Math.min(10_000, Math.trunc(value))));
};

const toContestConfig = (config: ContestConfigInput) => ({
  entryAsset: config.entryAsset,
  entryAmount: config.entryAmount,
  entryFee: config.entryFee,
  priceSource: config.priceSource,
  swapPool: config.swapPool,
  priceToleranceBps: config.priceToleranceBps,
  settlementWindow: config.settlementWindow,
  maxParticipants: config.maxParticipants,
  topK: config.topK
});

const toContestTimeline = (timeline: ContestTimelineInput) => ({
  registeringEnds: timeline.registeringEnds,
  liveEnds: timeline.liveEnds,
  claimEnds: timeline.claimEnds
});

const toDeploymentReceipt = async (
  client: ReturnType<DeploymentRuntime['createWalletClient']>,
  hash: Hex,
  receipt: Awaited<ReturnType<typeof waitForTransactionReceipt>>
): Promise<DeploymentTransactionReceipt> => {
  const block = await getBlock(client, { blockHash: receipt.blockHash });
  return {
    transactionHash: hash,
    blockNumber: receipt.blockNumber,
    confirmedAt: block.timestamp ? new Date(Number(block.timestamp) * 1000).toISOString() : null
  };
};

export const deployContestBundle = async (
  params: ContestDeploymentParams
): Promise<ContestDeploymentResult> => {
  const { runtime, chain } = params;
  const client = runtime.createWalletClient(chain);

  try {
    const contestTx = await client.deployContract({
      abi: contestArtifact.abi,
      bytecode: contestArtifact.bytecode,
      account: runtime.account,
      chain
    });

    const contestReceipt = await waitForTransactionReceipt(client, { hash: contestTx });
    if (!contestReceipt.contractAddress) {
      throw new Error('Contest deployment did not return a contract address');
    }
    const contestAddress = contestReceipt.contractAddress as Address;
    const contestConfirmation = await toDeploymentReceipt(client, contestTx, contestReceipt);

    const vaultFactoryTx = await client.deployContract({
      abi: vaultFactoryArtifact.abi,
      bytecode: vaultFactoryArtifact.bytecode,
      account: runtime.account,
      chain,
      args: [params.vaultImplementation, contestAddress]
    });

    const vaultFactoryReceipt = await waitForTransactionReceipt(client, { hash: vaultFactoryTx });
    if (!vaultFactoryReceipt.contractAddress) {
      throw new Error('VaultFactory deployment did not return a contract address');
    }
    const vaultFactoryAddress = vaultFactoryReceipt.contractAddress as Address;
    const vaultFactoryConfirmation = await toDeploymentReceipt(client, vaultFactoryTx, vaultFactoryReceipt);

    const initializeArgs = [
      {
        contestId: params.contestId,
        config: toContestConfig({
          ...params.config,
          priceSource: params.config.priceSource,
          swapPool: params.config.swapPool
        }),
        timeline: toContestTimeline(params.timeline),
        initialPrizeAmount: params.initialPrizeAmount,
        payoutSchedule: normalizeSchedule(params.payoutSchedule),
        vaultImplementation: params.vaultImplementation,
        vaultFactory: vaultFactoryAddress,
        owner: params.organizer
      }
    ] as const;

    const initializeTx = await writeContract(client, {
      address: contestAddress,
      abi: contestArtifact.abi,
      functionName: 'initialize',
      args: initializeArgs,
      account: runtime.account,
      chain
    });
    const initializationReceipt = await waitForTransactionReceipt(client, { hash: initializeTx });
    const initializationConfirmation = await toDeploymentReceipt(client, initializeTx, initializationReceipt);

    return {
      contestAddress,
      vaultFactoryAddress,
      contestDeployment: contestConfirmation,
      vaultFactoryDeployment: vaultFactoryConfirmation,
      initialization: initializationConfirmation
    };
  } catch (error) {
    throw wrapContestChainError(error, {
      code: 'CHAIN_UNAVAILABLE',
      message: 'Contest deployment failed',
      retryable: true,
      details: {
        contestId: params.contestId,
        networkId: params.chain.id,
        organizer: params.organizer,
        metadata: params.metadata ?? {}
      }
    });
  }
};
