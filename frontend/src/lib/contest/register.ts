import { readContract, waitForTransactionReceipt, writeContract } from "@wagmi/core";
import type { Config } from "wagmi";
import type { Address, Hex } from "viem";
import { parseEventLogs } from "viem";
import { contestAbi } from "../abi/contest";
import { erc20Abi } from "../abi/erc20";
import { contestAddresses } from "../config";

export enum ContestState {
  Uninitialized = 0,
  Registering = 1,
  Live = 2,
  Frozen = 3,
  Sealed = 4,
  Closed = 5,
}

export const contestStateLabel: Record<ContestState, string> = {
  [ContestState.Uninitialized]: "未初始化",
  [ContestState.Registering]: "报名中",
  [ContestState.Live]: "Live",
  [ContestState.Frozen]: "已冻结",
  [ContestState.Sealed]: "已封榜",
  [ContestState.Closed]: "已关闭",
};

export type ContestOverview = {
  entryAsset: Address;
  entryAmount: bigint;
  entrySymbol: string;
  entryDecimals: number;
  maxParticipants: number;
  participantCount: bigint;
  state: ContestState;
  registeringEnds: bigint;
  liveEnds: bigint;
  claimEnds: bigint;
};

export async function fetchContestOverview(config: Config): Promise<ContestOverview> {
  const contestAddress = contestAddresses.contest as Address;
  console.log("fetchContestOverview:start", contestAddress);
  try {
    const [rawConfig, rawParticipantCount, rawState, rawTimeline] = await Promise.all([
      readContract(config, {
        abi: contestAbi,
        address: contestAddress,
        functionName: "config",
      }),
      readContract(config, {
        abi: contestAbi,
        address: contestAddress,
        functionName: "participantCount",
      }),
      readContract(config, {
        abi: contestAbi,
        address: contestAddress,
        functionName: "state",
      }),
      readContract(config, {
        abi: contestAbi,
        address: contestAddress,
        functionName: "timeline",
      }),
    ]);

    const [
      entryAsset,
      entryAmount,
      priceSource,
      swapPool,
      priceToleranceBps,
      settlementWindow,
      maxParticipants,
      topK,
    ] = rawConfig as [
      Address,
      bigint,
      Address,
      Address,
      number,
      number,
      number,
      number,
    ];
    console.log("fetchContestOverview:config", rawConfig);
    console.log("fetchContestOverview:entryAsset", entryAsset);

    const [registeringEnds, liveEnds, claimEnds] = rawTimeline as [bigint, bigint, bigint];

    const [symbol, decimals] = await Promise.all([
      readContract(config, {
        abi: erc20Abi,
        address: entryAsset,
        functionName: "symbol",
      }),
      readContract(config, {
        abi: erc20Abi,
        address: entryAsset,
        functionName: "decimals",
      }),
    ]);
    console.log("fetchContestOverview:done");

    return {
      entryAsset,
      entryAmount,
      entrySymbol: symbol as string,
      entryDecimals: Number(decimals),
      maxParticipants: Number(maxParticipants),
      participantCount: BigInt(rawParticipantCount),
      state: rawState as ContestState,
      registeringEnds,
      liveEnds,
      claimEnds,
    };
  } catch (error) {
    console.error("fetchContestOverview:error", error);
    throw error;
  }
}

export async function getEntryAllowance(
  config: Config,
  owner: Address,
  entryAsset: Address,
): Promise<bigint> {
  return readContract(config, {
    abi: erc20Abi,
    address: entryAsset,
    functionName: "allowance",
    args: [owner, contestAddresses.contest as Address],
  }) as Promise<bigint>;
}

export async function approveEntryToken(
  config: Config,
  owner: Address,
  entryAsset: Address,
  amount: bigint,
): Promise<Hex> {
  const hash = await writeContract(config, {
    abi: erc20Abi,
    address: entryAsset,
    functionName: "approve",
    args: [contestAddresses.contest as Address, amount],
    account: owner,
  });
  await waitForTransactionReceipt(config, { hash });
  return hash;
}

export type RegistrationResult = {
  txHash: Hex;
  vault: Address;
  amount: bigint;
};

export async function registerForContest(config: Config, owner: Address): Promise<RegistrationResult> {
  const contestAddress = contestAddresses.contest as Address;
  const txHash = await writeContract(config, {
    abi: contestAbi,
    address: contestAddress,
    functionName: "register",
    account: owner,
  });

  const receipt = await waitForTransactionReceipt(config, {
    hash: txHash,
  });

  const [event] = parseEventLogs({
    abi: contestAbi,
    eventName: "ContestRegistered",
    logs: receipt.logs,
    strict: false,
  });

  if (!event) {
    throw new Error("报名交易缺少 ContestRegistered 事件");
  }

  const args = event.args as unknown as {
    participant: Address;
    vault: Address;
    amount: bigint;
  };

  return {
    txHash,
    vault: args.vault,
    amount: args.amount,
  };
}
