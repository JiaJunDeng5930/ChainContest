import {
  readContract,
  simulateContract,
  waitForTransactionReceipt,
  writeContract,
} from "@wagmi/core";
import type { WriteContractParameters } from "@wagmi/core";
import type { Config } from "wagmi";
import type { Address, Hex } from "viem";
import { BaseError, ContractFunctionRevertedError } from "viem";
import { contestAbi } from "../abi/contest";
import { erc20Abi } from "../abi/erc20";
import { priceSourceAbi } from "../abi/priceSource";
import { vaultAbi } from "../abi/vault";
import { contestAddresses, configuredChainId } from "../config";

export type SwapDirection = "BASE_TO_QUOTE" | "QUOTE_TO_BASE";

export type SwapContext = {
  vault: Address;
  baseAsset: Address;
  baseSymbol: string;
  baseDecimals: number;
  quoteAsset: Address;
  quoteSymbol: string;
  quoteDecimals: number;
  priceSource: Address;
  priceToleranceBps: number;
  pool: Address;
};

export type VaultBalances = {
  baseBalance: bigint;
  quoteBalance: bigint;
};

export type PriceSnapshot = {
  meanTick: number;
  sqrtPriceX96: bigint;
  priceE18: bigint;
  updatedAt: bigint;
};

type SwapWriteRequest = WriteContractParameters<typeof vaultAbi, "swapExact">;

export type SwapSimulation = {
  amountOut: bigint;
  priceImpactBps: number;
  gasEstimate: bigint;
  minAmountOut: bigint;
  deadline: bigint;
  request: SwapWriteRequest;
};

export type SwapExecutionResult = {
  txHash: Hex;
  amountOut: bigint;
  priceImpactBps: number;
  gasSpent: bigint;
};

const DEFAULT_DEADLINE_BUFFER = 900n; // 15 minutes

export async function resolveVaultAddress(config: Config, participant: Address): Promise<Address | null> {
  const contestAddress = contestAddresses.contest as Address;
  const vaultId = (await readContract(config, {
    abi: contestAbi,
    address: contestAddress,
    functionName: "participantVaults",
    args: [participant],
  })) as `0x${string}`;

  if (vaultId === "0x0000000000000000000000000000000000000000000000000000000000000000") {
    return null;
  }

  const vaultAddress = (await readContract(config, {
    abi: contestAbi,
    address: contestAddress,
    functionName: "vaultAddresses",
    args: [vaultId],
  })) as Address;

  if (vaultAddress === "0x0000000000000000000000000000000000000000") {
    return null;
  }

  return vaultAddress;
}

export async function loadSwapContext(config: Config, participant: Address): Promise<SwapContext | null> {
  const contestAddress = contestAddresses.contest as Address;
  const vault = await resolveVaultAddress(config, participant);
  if (!vault) {
    return null;
  }

  const rawConfig = (await readContract(config, {
    abi: contestAbi,
    address: contestAddress,
    functionName: "config",
  })) as [
    Address,
    bigint,
    Address,
    Address,
    number,
    number,
    number,
    number,
  ];

  const baseAsset = rawConfig[0];
  const priceSource = rawConfig[2];
  const pool = rawConfig[3];
  const priceToleranceBps = Number(rawConfig[4]);

  const [quoteAsset, baseSymbolRaw, baseDecimalsRaw] = await Promise.all([
    readContract(config, {
      abi: vaultAbi,
      address: vault,
      functionName: "quoteAsset",
    }) as Promise<Address>,
    readContract(config, {
      abi: erc20Abi,
      address: baseAsset,
      functionName: "symbol",
    }).catch(() => "USDC"),
    readContract(config, {
      abi: erc20Abi,
      address: baseAsset,
      functionName: "decimals",
    }).catch(() => 6n),
  ]);

  const [quoteSymbol, quoteDecimals] = await Promise.all([
    readContract(config, {
      abi: erc20Abi,
      address: quoteAsset,
      functionName: "symbol",
    }).catch(() => "WETH"),
    readContract(config, {
      abi: erc20Abi,
      address: quoteAsset,
      functionName: "decimals",
    }).catch(() => 18n),
  ]);

  return {
    vault,
    baseAsset,
    baseSymbol: baseSymbolRaw as string,
    baseDecimals: Number(baseDecimalsRaw),
    quoteAsset,
    quoteSymbol: quoteSymbol as string,
    quoteDecimals: Number(quoteDecimals),
    priceSource,
    priceToleranceBps,
    pool,
  };
}

export async function fetchVaultBalances(config: Config, vault: Address): Promise<VaultBalances> {
  const [baseBalance, quoteBalance] = await Promise.all([
    readContract(config, {
      abi: vaultAbi,
      address: vault,
      functionName: "baseBalance",
    }),
    readContract(config, {
      abi: vaultAbi,
      address: vault,
      functionName: "quoteBalance",
    }),
  ]);

  return {
    baseBalance: BigInt(baseBalance),
    quoteBalance: BigInt(quoteBalance),
  };
}

export async function fetchPriceSnapshot(config: Config, priceSource: Address): Promise<PriceSnapshot | null> {
  const snapshot = (await readContract(config, {
    abi: priceSourceAbi,
    address: priceSource,
    functionName: "lastSnapshot",
  })) as unknown as {
    meanTick: number;
    sqrtPriceX96: bigint;
    priceE18: bigint;
    updatedAt: bigint;
  };

  if (!snapshot) {
    return null;
  }

  return {
    meanTick: snapshot.meanTick,
    sqrtPriceX96: snapshot.sqrtPriceX96,
    priceE18: snapshot.priceE18,
    updatedAt: snapshot.updatedAt,
  };
}

type SimulateSwapParams = {
  vault: Address;
  participant: Address;
  amountIn: bigint;
  direction: SwapDirection;
  minAmountOut?: bigint;
  deadline?: bigint;
};

export async function simulateVaultSwap(config: Config, params: SimulateSwapParams): Promise<SwapSimulation> {
  const zeroForOne = params.direction === "BASE_TO_QUOTE";
  const deadline =
    params.deadline ??
    (BigInt(Math.floor(Date.now() / 1000)) + DEFAULT_DEADLINE_BUFFER);
  const minAmountOut = params.minAmountOut ?? 1n;

  const { request, result } = await simulateContract(config, {
    abi: vaultAbi,
    address: params.vault,
    functionName: "swapExact",
    args: [params.amountIn, minAmountOut, zeroForOne, deadline],
    account: params.participant,
    chainId: configuredChainId,
  });

  const tuple = result as readonly [bigint, number | bigint];
  const amountOut = tuple[0];
  const priceImpactRaw = tuple[1];

  return {
    amountOut,
    priceImpactBps: typeof priceImpactRaw === "bigint" ? Number(priceImpactRaw) : Number(priceImpactRaw),
    gasEstimate: request.gas ?? 0n,
    minAmountOut,
    deadline,
    request: request as SwapWriteRequest,
  };
}

type ExecuteSwapParams = SimulateSwapParams & {
  minAmountOut?: bigint;
  deadline?: bigint;
};

export async function executeVaultSwap(config: Config, params: ExecuteSwapParams): Promise<SwapExecutionResult> {
  const simulation = await simulateVaultSwap(config, params);

  const txHash = await writeContract(config, {
    ...simulation.request,
  });

  await waitForTransactionReceipt(config, { hash: txHash });

  return {
    txHash,
    amountOut: simulation.amountOut,
    priceImpactBps: simulation.priceImpactBps,
    gasSpent: simulation.request.gas ?? 0n,
  };
}

export function getSwapErrorMessage(error: unknown): string {
  if (error instanceof BaseError) {
    const revertError = error.walk(
      (err) => (err instanceof ContractFunctionRevertedError ? err : undefined),
    );
    const errorName = revertError?.data?.errorName ?? revertError?.shortMessage ?? "";
    if (errorName.includes("PriceSourcePriceOutOfTolerance")) {
      return "价格偏离超出容忍度，请稍后再试";
    }
    if (errorName.includes("VaultSwapInvalidState")) {
      return "当前状态禁止换仓";
    }
    if (errorName.includes("VaultSwapExpired")) {
      return "换仓请求已过期，请刷新后重试";
    }
    if (errorName.includes("VaultSwapInsufficientOutput")) {
      return "输出金额不足，请调整输入或稍后再试";
    }
    if (errorName.includes("VaultUnauthorized")) {
      return "仅参赛者本人可执行换仓";
    }
    if (errorName) {
      return `换仓失败：${errorName}`;
    }
    return error.shortMessage;
  }
  if (error instanceof Error) {
    return `换仓失败：${error.message}`;
  }
  return "换仓失败，请稍后重试";
}
