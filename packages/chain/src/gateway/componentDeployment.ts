import type { Hex } from 'viem';
import type { Chain } from 'viem/chains';
import { waitForTransactionReceipt, getBlock } from 'viem/actions';
import { wrapContestChainError } from '../errors/contestChainError.js';
import { getComponentArtifact } from './artifacts.js';
import type { DeploymentRuntime } from '../runtime/deploymentRuntime.js';

export interface VaultDeploymentParams {
  readonly runtime: DeploymentRuntime;
  readonly chain: Chain;
  readonly baseAsset: Hex;
  readonly quoteAsset: Hex;
}

export interface PriceSourceDeploymentParams {
  readonly runtime: DeploymentRuntime;
  readonly chain: Chain;
  readonly poolAddress: Hex;
  readonly twapSeconds: number;
}

export type ComponentDeploymentParams =
  | ({ readonly componentType: 'vault_implementation' } & VaultDeploymentParams)
  | ({ readonly componentType: 'price_source' } & PriceSourceDeploymentParams);

export interface ComponentDeploymentResult {
  readonly transactionHash: Hex;
  readonly contractAddress: Hex;
  readonly blockNumber: bigint;
  readonly confirmedAt: Date | null;
}

const toDate = (timestamp?: bigint): Date | null => {
  if (!timestamp) {
    return null;
  }
  const millis = Number(timestamp) * 1000;
  if (!Number.isFinite(millis)) {
    return null;
  }
  return new Date(millis);
};

const deploy = async (
  params: ComponentDeploymentParams
): Promise<ComponentDeploymentResult> => {
  const { runtime, chain, componentType } = params;
  const client = runtime.createWalletClient(chain);
  const artifact = getComponentArtifact(componentType);

  const args: readonly unknown[] = (() => {
    if (componentType === 'vault_implementation') {
      const { baseAsset, quoteAsset } = params;
      return [baseAsset, quoteAsset];
    }
    const { poolAddress, twapSeconds } = params;
    return [poolAddress, twapSeconds];
  })();

  try {
    const transactionHash = await client.deployContract({
      abi: artifact.abi,
      bytecode: artifact.bytecode,
      args,
      account: runtime.account,
      chain
    });

    const receipt = await waitForTransactionReceipt(client, { hash: transactionHash });
    if (!receipt.contractAddress) {
      throw wrapContestChainError(new Error('Missing contract address'), {
        code: 'CHAIN_UNAVAILABLE',
        message: 'Deployment receipt missing contract address',
        retryable: true,
        details: { transactionHash }
      });
    }

    const block = await getBlock(client, { blockHash: receipt.blockHash });

    return {
      transactionHash,
      contractAddress: receipt.contractAddress,
      blockNumber: receipt.blockNumber,
      confirmedAt: toDate(block.timestamp)
    };
  } catch (error) {
    throw wrapContestChainError(error, {
      code: 'CHAIN_UNAVAILABLE',
      message: 'Component deployment failed',
      retryable: true,
      details: {
        componentType,
        args
      }
    });
  }
};

export const deployVaultImplementation = (
  params: VaultDeploymentParams
): Promise<ComponentDeploymentResult> =>
  deploy({ componentType: 'vault_implementation', ...params });

export const deployPriceSource = (
  params: PriceSourceDeploymentParams
): Promise<ComponentDeploymentResult> =>
  deploy({ componentType: 'price_source', ...params });
