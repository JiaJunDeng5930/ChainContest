import { create } from "zustand";
import { watchContractEvent } from "@wagmi/core";
import type { Config } from "wagmi";
import type { Address, Hex } from "viem";
import { vaultAbi } from "../../lib/abi/vault";
import useContestStore, { type RegistrationRecord } from "./contestStore";
import {
  fetchPriceSnapshot,
  fetchVaultBalances,
  loadSwapContext,
  type SwapContext,
  type SwapDirection,
  type VaultBalances,
} from "../../lib/contest/swap";

type VaultPosition = {
  participant: Address;
  vault: Address;
  baseBalance: bigint;
  quoteBalance: bigint;
  nav: bigint;
  roiBps: number;
  lastPriceE18?: bigint;
  lastPriceImpactBps?: number;
  lastAmountIn?: bigint;
  lastAmountOut?: bigint;
  lastDirection?: SwapDirection;
  updatedAt?: bigint;
  lastTxHash?: Hex;
};

type VaultPositionsState = {
  positions: Record<string, VaultPosition>;
  hydrate: (records: VaultPosition[]) => void;
  upsert: (record: VaultPosition) => void;
  remove: (vault: Address) => void;
};

const ONE_E18 = 1_000_000_000_000_000_000n;

const adjustDecimals = (amount: bigint, fromDecimals: number, toDecimals: number): bigint => {
  if (fromDecimals === toDecimals) {
    return amount;
  }
  const from = BigInt(fromDecimals);
  const to = BigInt(toDecimals);
  if (from > to) {
    const diff = from - to;
    const divisor = 10n ** diff;
    return amount / divisor;
  }
  const diff = to - from;
  const multiplier = 10n ** diff;
  return amount * multiplier;
};

const computeMetrics = (
  context: SwapContext,
  balances: VaultBalances,
  priceE18?: bigint,
): { nav: bigint; roiBps: number } => {
  const price = priceE18 ?? 0n;
  const baseBalance = balances.baseBalance;
  const quoteBalance = balances.quoteBalance;
  const quoteInBaseDecimals = adjustDecimals(quoteBalance, context.quoteDecimals, context.baseDecimals);
  const quoteValue = price === 0n ? 0n : (quoteInBaseDecimals * price) / ONE_E18;
  const nav = baseBalance + quoteValue;
  const roiNumerator = nav >= context.entryAmount ? nav - context.entryAmount : context.entryAmount - nav;
  const roiSign = nav >= context.entryAmount ? 1 : -1;
  const roiBps =
    context.entryAmount === 0n
      ? 0
      : Math.trunc(Number((roiNumerator * 10_000n) / context.entryAmount)) * roiSign;
  return { nav, roiBps };
};

const useVaultPositionsStore = create<VaultPositionsState>((set) => ({
  positions: {},
  hydrate: (records) => {
    const next: Record<string, VaultPosition> = {};
    for (const record of records) {
      next[record.vault.toLowerCase()] = record;
    }
    set({ positions: next });
  },
  upsert: (record) =>
    set((state) => {
      const key = record.vault.toLowerCase();
      return {
        positions: {
          ...state.positions,
          [key]: record,
        },
      };
    }),
  remove: (vault) =>
    set((state) => {
      const key = vault.toLowerCase();
      const next = { ...state.positions };
      delete next[key];
      return { positions: next };
    }),
}));

export default useVaultPositionsStore;

const contextCache = new Map<string, SwapContext>();
const participantToVault = new Map<string, string>();

async function ensureContext(config: Config, participant: Address): Promise<SwapContext | null> {
  const participantKey = participant.toLowerCase();
  const cachedVault = participantToVault.get(participantKey);
  if (cachedVault && contextCache.has(cachedVault)) {
    return contextCache.get(cachedVault) ?? null;
  }

  const context = await loadSwapContext(config, participant);
  if (!context) {
    return null;
  }
  const vaultKey = context.vault.toLowerCase();
  contextCache.set(vaultKey, context);
  participantToVault.set(participantKey, vaultKey);
  return context;
}

async function loadPosition(
  config: Config,
  record: RegistrationRecord,
): Promise<VaultPosition | null> {
  const context = await ensureContext(config, record.participant);
  if (!context) {
    return null;
  }

  const [balances, priceSnapshot] = await Promise.all([
    fetchVaultBalances(config, context.vault),
    context.priceSource !== "0x0000000000000000000000000000000000000000"
      ? fetchPriceSnapshot(config, context.priceSource)
      : Promise.resolve(null),
  ]);

  const price = priceSnapshot?.priceE18 ?? 0n;
  const metrics = computeMetrics(context, balances, price);

  return {
    participant: record.participant,
    vault: context.vault,
    baseBalance: balances.baseBalance,
    quoteBalance: balances.quoteBalance,
    nav: metrics.nav,
    roiBps: metrics.roiBps,
    lastPriceE18: price,
    updatedAt: priceSnapshot?.updatedAt,
  };
}

export async function hydrateVaultPositions(config: Config): Promise<void> {
  const registrations = useContestStore.getState().registrations;
  if (registrations.length === 0) {
    return;
  }
  const records = (
    await Promise.all(registrations.map((record) => loadPosition(config, record)))
  ).filter((value): value is VaultPosition => Boolean(value));
  if (records.length === 0) {
    return;
  }
  useVaultPositionsStore.getState().hydrate(records);
}

export async function refreshVaultPosition(config: Config, participant: Address): Promise<void> {
  const record = useContestStore
    .getState()
    .registrations.find((item) => item.participant.toLowerCase() === participant.toLowerCase());
  if (!record) {
    return;
  }
  const position = await loadPosition(config, record);
  if (!position) {
    return;
  }
  useVaultPositionsStore.getState().upsert(position);
}

const activeWatchers = new Map<string, () => void>();

async function attachWatcher(config: Config, record: RegistrationRecord): Promise<void> {
  const context = await ensureContext(config, record.participant);
  if (!context) {
    return;
  }
  const key = context.vault.toLowerCase();
  if (activeWatchers.has(key)) {
    return;
  }

  const unsubscribe = watchContractEvent(
    config,
    {
      abi: vaultAbi,
      address: context.vault,
      eventName: "VaultSwapped",
      poll: true,
      pollingInterval: 1_000,
    },
    async (logs) => {
      for (const log of logs) {
        try {
          const args = log.args as unknown as {
            contest: Address;
            participant: Address;
            pool: Address;
            tokenIn: Address;
            tokenOut: Address;
            amountIn: bigint;
            amountOut: bigint;
            twap: bigint;
            priceImpactBps: bigint | number;
          };
          const balances = await fetchVaultBalances(config, context.vault);
          const metrics = computeMetrics(context, balances, args.twap);
          const direction: SwapDirection =
            args.tokenIn.toLowerCase() === context.baseAsset.toLowerCase()
              ? "BASE_TO_QUOTE"
              : "QUOTE_TO_BASE";

          useVaultPositionsStore.getState().upsert({
            participant: args.participant,
            vault: context.vault,
            baseBalance: balances.baseBalance,
            quoteBalance: balances.quoteBalance,
            nav: metrics.nav,
            roiBps: metrics.roiBps,
            lastPriceE18: args.twap,
            lastPriceImpactBps:
              typeof args.priceImpactBps === "bigint"
                ? Number(args.priceImpactBps)
                : args.priceImpactBps,
            lastAmountIn: args.amountIn,
            lastAmountOut: args.amountOut,
            lastDirection: direction,
            updatedAt: log.blockNumber ?? 0n,
            lastTxHash: log.transactionHash ?? undefined,
          });
        } catch (error) {
          console.warn("处理 VaultSwapped 事件失败：", error);
        }
      }
    },
  );

  activeWatchers.set(key, unsubscribe);
}

export function subscribeVaultPositions(config: Config): () => void {
  const registrations = useContestStore.getState().registrations;
  registrations.forEach((record) => {
    void attachWatcher(config, record);
  });

  const unsubscribeContest = useContestStore.subscribe(
    (state) => state.registrations,
    (next, previous) => {
      const prevSet = new Set(previous.map((item) => item.participant.toLowerCase()));
      for (const record of next) {
        if (!prevSet.has(record.participant.toLowerCase())) {
          void attachWatcher(config, record);
        }
      }
    },
  );

  return () => {
    for (const dispose of activeWatchers.values()) {
      try {
        dispose();
      } catch (error) {
        console.warn("取消 Vault watcher 时出现警告：", error);
      }
    }
    activeWatchers.clear();
    contextCache.clear();
    participantToVault.clear();
    unsubscribeContest();
  };
}
