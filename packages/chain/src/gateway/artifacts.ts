import { createRequire } from 'node:module';
import type { Abi, Hex } from 'viem';

export interface ContractArtifact {
  readonly abi: Abi;
  readonly bytecode: Hex;
}

const require = createRequire(import.meta.url);

interface HardhatArtifact {
  readonly abi: Abi;
  readonly bytecode: string;
}

const loadArtifact = (relativePath: string): ContractArtifact => {
  const artifact = require(relativePath) as HardhatArtifact;
  if (!artifact?.abi || !artifact?.bytecode) {
    throw new Error(`Invalid artifact at ${relativePath}`);
  }
  return {
    abi: artifact.abi,
    bytecode: artifact.bytecode as Hex
  };
};

const CONTEST_ARTIFACT_PATH = '../../../../contracts/artifacts/src/Contest.sol/Contest.json';
const VAULT_ARTIFACT_PATH = '../../../../contracts/artifacts/src/Vault.sol/Vault.json';
const PRICE_SOURCE_ARTIFACT_PATH = '../../../../contracts/artifacts/src/PriceSource.sol/PriceSource.json';
const VAULT_FACTORY_ARTIFACT_PATH = '../../../../contracts/artifacts/src/VaultFactory.sol/VaultFactory.json';

export const contestArtifact = loadArtifact(CONTEST_ARTIFACT_PATH);
export const vaultArtifact = loadArtifact(VAULT_ARTIFACT_PATH);
export const priceSourceArtifact = loadArtifact(PRICE_SOURCE_ARTIFACT_PATH);
export const vaultFactoryArtifact = loadArtifact(VAULT_FACTORY_ARTIFACT_PATH);

export type ComponentArtifactKey = 'vault_implementation' | 'price_source';

export const getComponentArtifact = (key: ComponentArtifactKey): ContractArtifact => {
  switch (key) {
    case 'vault_implementation':
      return vaultArtifact;
    case 'price_source':
      return priceSourceArtifact;
    default:
      throw new Error(`Unsupported component artifact key: ${key as string}`);
  }
};
