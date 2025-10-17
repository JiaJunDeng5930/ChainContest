import { readContract, writeContract } from "@wagmi/core";
import type { Config } from "wagmi";
import type { Address, Hex } from "viem";
import { contestAbi } from "../abi/contest";
import { contestAddresses } from "../config";

export type LeaderboardUpdateInput = {
  vaultId: Hex;
  nav: bigint;
  roiBps: number;
};

const contestAddress = contestAddresses.contest as Address;

export async function freezeContest(config: Config): Promise<void> {
  await writeContract(config, {
    abi: contestAbi,
    address: contestAddress,
    functionName: "freeze",
  });
}

export async function settleParticipant(config: Config, participant: Address): Promise<void> {
  await writeContract(config, {
    abi: contestAbi,
    address: contestAddress,
    functionName: "settle",
    args: [participant],
  });
}

export async function sealContest(config: Config): Promise<void> {
  await writeContract(config, {
    abi: contestAbi,
    address: contestAddress,
    functionName: "seal",
  });
}

export async function updateLeadersOnChain(
  config: Config,
  updates: LeaderboardUpdateInput[],
): Promise<void> {
  await writeContract(config, {
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
  return readContract(config, {
    abi: contestAbi,
    address: contestAddress,
    functionName: "prizePool",
  }) as Promise<bigint>;
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
  const result = (await readContract(config, {
    abi: contestAbi,
    address: contestAddress,
    functionName: "getLeaders",
  })) as Array<{ vaultId: Hex; nav: bigint; roiBps: number; rank: number }>;

  const entries: LeaderboardEntry[] = [];
  for (const item of result) {
    const vaultAddress = (await readContract(config, {
      abi: contestAbi,
      address: contestAddress,
      functionName: "vaultAddresses",
      args: [item.vaultId],
    })) as Address;

    const context = (await readContract(config, {
      abi: contestAbi,
      address: contestAddress,
      functionName: "getVaultContext",
      args: [vaultAddress],
    })) as { vaultId: Hex; owner: Address } | [Hex, Address];

    const ownerAddress = Array.isArray(context) ? (context[1] as Address) : (context.owner as Address);

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
