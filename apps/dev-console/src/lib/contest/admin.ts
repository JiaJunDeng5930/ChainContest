import type { Config } from "wagmi";
import type { Address, Hex, PublicClient, WalletClient } from "viem";
import { contestAbi } from "../abi/contest";
import { contestAddresses, configuredChainId } from "../config";

export type LeaderboardUpdateInput = {
  vaultId: Hex;
  nav: bigint;
  roiBps: number;
};

const contestAddress = contestAddresses.contest as Address;

async function getWalletClient(config: Config): Promise<WalletClient> {
  const walletClient = await config.getWalletClient({ chainId: configuredChainId });
  if (!walletClient) {
    throw new Error("未检测到钱包客户端，请先连接钱包");
  }
  return walletClient;
}

function getPublicClient(config: Config): PublicClient {
  return config.getPublicClient({ chainId: configuredChainId });
}

export async function freezeContest(config: Config): Promise<void> {
  const walletClient = await getWalletClient(config);
  await walletClient.writeContract({
    abi: contestAbi,
    address: contestAddress,
    functionName: "freeze",
  });
}

export async function settleParticipant(config: Config, participant: Address): Promise<void> {
  const walletClient = await getWalletClient(config);
  await walletClient.writeContract({
    abi: contestAbi,
    address: contestAddress,
    functionName: "settle",
    args: [participant],
  });
}

export async function sealContest(config: Config): Promise<void> {
  const walletClient = await getWalletClient(config);
  await walletClient.writeContract({
    abi: contestAbi,
    address: contestAddress,
    functionName: "seal",
  });
}

export async function updateLeadersOnChain(
  config: Config,
  updates: LeaderboardUpdateInput[],
): Promise<void> {
  const walletClient = await getWalletClient(config);
  await walletClient.writeContract({
    abi: contestAbi,
    address: contestAddress,
    functionName: "updateLeaders",
    args: [
      updates.map((item) => ({
        vaultId: item.vaultId,
        nav: item.nav,
        roiBps: item.roiBps,
      })),
    ],
  });
}

export async function fetchPrizePool(config: Config): Promise<bigint> {
  const publicClient = getPublicClient(config);
  return publicClient.readContract({
    abi: contestAbi,
    address: contestAddress,
    functionName: "prizePool",
  });
}

export type LeaderboardEntry = {
  vaultId: Hex;
  vault: Address;
  participant: Address;
  nav: bigint;
  roiBps: number;
  rank: number;
};

export async function fetchLeaders(config: Config): Promise<LeaderboardEntry[]> {
  const publicClient = getPublicClient(config);
  const result = await publicClient.readContract({
    abi: contestAbi,
    address: contestAddress,
    functionName: "getLeaders",
  });

  const entries: LeaderboardEntry[] = [];
  for (const item of result) {
    const vaultAddress = await publicClient.readContract({
      abi: contestAbi,
      address: contestAddress,
      functionName: "vaultAddresses",
      args: [item.vaultId],
    });

    const context = await publicClient.readContract({
      abi: contestAbi,
      address: contestAddress,
      functionName: "getVaultContext",
      args: [vaultAddress],
    });
    const ownerAddress = Array.isArray(context) ? context[1] : context.owner;

    entries.push({
      vaultId: item.vaultId,
      vault: vaultAddress,
      participant: ownerAddress,
      nav: item.nav,
      roiBps: Number(item.roiBps),
      rank: Number(item.rank),
    });
  }

  return entries;
}
