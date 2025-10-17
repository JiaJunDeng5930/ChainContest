import { readContract, writeContract } from "@wagmi/core";
import type { Config } from "wagmi";
import type { Address, Hex } from "viem";
import { contestAbi } from "../abi/contest";
import { contestAddresses } from "../config";

const contestAddress = contestAddresses.contest as Address;

export async function claimReward(config: Config): Promise<Hex> {
  return writeContract(config, {
    abi: contestAbi,
    address: contestAddress,
    functionName: "claim",
  });
}

export async function claimRewardFor(config: Config, participant: Address): Promise<Hex> {
  return writeContract(config, {
    abi: contestAbi,
    address: contestAddress,
    functionName: "claimFor",
    args: [participant],
  });
}

export async function exitContest(config: Config): Promise<Hex> {
  return writeContract(config, {
    abi: contestAbi,
    address: contestAddress,
    functionName: "exit",
  });
}

export async function fetchTotalPrizePool(config: Config): Promise<bigint> {
  return readContract(config, {
    abi: contestAbi,
    address: contestAddress,
    functionName: "totalPrizePool",
  }) as Promise<bigint>;
}
