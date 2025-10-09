import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useConfig } from "wagmi";
import type { Address } from "viem";
import { formatUnits, parseUnits } from "viem";
import {
  ContestState,
  contestStateLabel,
  fetchContestOverview,
} from "../lib/contest/register";
import {
  executeVaultSwap,
  fetchPriceSnapshot,
  fetchVaultBalances,
  getSwapErrorMessage,
  loadSwapContext,
  simulateVaultSwap,
  type SwapDirection,
  type SwapSimulation,
  type VaultBalances,
} from "../lib/contest/swap";

const directionLabels: Record<SwapDirection, string> = {
  BASE_TO_QUOTE: "卖出报名资产 (USDC → WETH)",
  QUOTE_TO_BASE: "买回报名资产 (WETH → USDC)",
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function formatGasEstimate(value: bigint): string {
  if (value === 0n) {
    return "--";
  }
  return `${value.toString()} gas`;
}

function humanizeTimestamp(timestamp: bigint | number): string {
  const value = typeof timestamp === "bigint" ? Number(timestamp) : timestamp;
  if (!Number.isFinite(value) || value === 0) {
    return "未知";
  }
  const date = new Date(value * 1000);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

export default function VaultSwapPanel(): JSX.Element {
  const wagmiConfig = useConfig();
  const { address, isConnected } = useAccount();

  const [amountInput, setAmountInput] = useState("");
  const [direction, setDirection] = useState<SwapDirection>("BASE_TO_QUOTE");
  const [simulation, setSimulation] = useState<SwapSimulation | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const overviewQuery = useQuery({
    queryKey: ["contest-overview"],
    queryFn: () => fetchContestOverview(wagmiConfig),
    staleTime: 15_000,
  });

  const overview = overviewQuery.data;

  const contextQuery = useQuery({
    queryKey: ["swap-context", address],
    queryFn: () => {
      if (!address) {
        return null;
      }
      return loadSwapContext(wagmiConfig, address as Address);
    },
    enabled: Boolean(address),
    staleTime: 10_000,
  });

  const context = contextQuery.data;

  const balancesQuery = useQuery({
    queryKey: ["vault-balances", context?.vault],
    queryFn: () => {
      if (!context) {
        return null;
      }
      return fetchVaultBalances(wagmiConfig, context.vault);
    },
    enabled: Boolean(context?.vault),
    staleTime: 5_000,
  });

  const balances = balancesQuery.data as VaultBalances | null;

  const priceSnapshotQuery = useQuery({
    queryKey: ["price-snapshot", context?.priceSource],
    queryFn: () => {
      if (!context?.priceSource || context.priceSource === ZERO_ADDRESS) {
        return null;
      }
      return fetchPriceSnapshot(wagmiConfig, context.priceSource);
    },
    enabled: Boolean(context?.priceSource && context.priceSource !== ZERO_ADDRESS),
    staleTime: 15_000,
  });

  const priceSnapshot = priceSnapshotQuery.data;

  useEffect(() => {
    if (!context || !address || !amountInput) {
      setSimulation(null);
      setPreviewError(null);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const performSimulation = async () => {
      try {
        setIsSimulating(true);
        const parsedAmount = parseUnits(amountInput, context.baseDecimals);
        if (parsedAmount <= 0) {
          setSimulation(null);
          setPreviewError(null);
          return;
        }
        const result = await simulateVaultSwap(wagmiConfig, {
          vault: context.vault,
          participant: address as Address,
          amountIn: parsedAmount,
          direction,
        });
        if (!cancelled) {
          setSimulation(result);
          setPreviewError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setSimulation(null);
          setPreviewError(getSwapErrorMessage(err));
        }
      } finally {
        if (!cancelled) {
          setIsSimulating(false);
        }
      }
    };

    timer = setTimeout(() => {
      void performSimulation();
    }, 350);

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [amountInput, direction, context, address, wagmiConfig]);

  const amountIsValid = useMemo(() => {
    if (!context || !amountInput) {
      return false;
    }
    try {
      const parsed = parseUnits(amountInput, context.baseDecimals);
      return parsed > 0;
    } catch {
      return false;
    }
  }, [amountInput, context]);

  const canSubmit = useMemo(() => {
    if (!isConnected || !context || !overview) {
      return false;
    }
    if (overview.state !== ContestState.Live) {
      return false;
    }
    if (balancesQuery.isFetching || isSubmitting || isSimulating) {
      return false;
    }
    if (!amountIsValid) {
      return false;
    }
    return true;
  }, [
    isConnected,
    context,
    overview,
    balancesQuery.isFetching,
    isSubmitting,
    isSimulating,
    amountIsValid,
  ]);

  const baseBalanceLabel = useMemo(() => {
    if (!context || !balances) {
      return "--";
    }
    return `${formatUnits(balances.baseBalance, context.baseDecimals)} ${context.baseSymbol}`;
  }, [context, balances]);

  const quoteBalanceLabel = useMemo(() => {
    if (!context || !balances) {
      return "--";
    }
    return `${formatUnits(balances.quoteBalance, context.quoteDecimals)} ${context.quoteSymbol}`;
  }, [context, balances]);

  const priceLabel = useMemo(() => {
    if (!priceSnapshot) {
      return "--";
    }
    return formatUnits(priceSnapshot.priceE18, 18);
  }, [priceSnapshot]);

  const handleSubmit = async () => {
    if (!context || !address) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setStatus(null);
    try {
      const parsedAmount = parseUnits(amountInput, context.baseDecimals);
      if (parsedAmount <= 0) {
        setError("请输入合法的换仓数量");
        return;
      }
      const result = await executeVaultSwap(wagmiConfig, {
        vault: context.vault,
        participant: address as Address,
        amountIn: parsedAmount,
        direction,
        minAmountOut: simulation?.minAmountOut,
        deadline: simulation?.deadline,
      });
      setStatus(`换仓交易已提交：${result.txHash.slice(0, 10)}...`);
      setAmountInput("");
      await balancesQuery.refetch();
      await priceSnapshotQuery.refetch();
    } catch (err) {
      setError(getSwapErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section style={{ border: "1px solid #d0d7de", padding: "1.5rem", borderRadius: "0.75rem" }}>
      <header>
        <h2>换仓面板</h2>
      </header>
      {!isConnected ? (
        <p>请先连接钱包以管理个人 Vault。</p>
      ) : overviewQuery.isLoading ? (
        <p>正在加载比赛配置...</p>
      ) : !overview ? (
        <p>无法加载比赛配置。</p>
      ) : overview.state < ContestState.Live ? (
        <p>比赛尚未进入 LIVE 阶段，暂不可换仓。</p>
      ) : !context ? (
        <p>未找到您的参赛 Vault，请确认已完成报名。</p>
      ) : (
        <>
          <p data-testid="contest-state">
            当前状态：
            <strong>{contestStateLabel[overview.state]}</strong>
          </p>
          <p>
            价格容忍度：±{context.priceToleranceBps / 100}%（TWAP 更新时间：
            {humanizeTimestamp(priceSnapshot?.updatedAt ?? 0n)}）
          </p>
          <p>
            最新 TWAP：<strong>{priceLabel}</strong>
          </p>
          <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
            {(Object.keys(directionLabels) as SwapDirection[]).map((item) => (
              <label key={item} style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
                <input
                  type="radio"
                  name="swap-direction"
                  value={item}
                  checked={direction === item}
                  onChange={() => setDirection(item)}
                  data-testid={`swap-direction-${item}`}
                />
                {directionLabels[item]}
              </label>
            ))}
          </div>
          <div style={{ marginBottom: "1rem" }}>
            <label htmlFor="swap-amount-input">换仓数量</label>
            <input
              id="swap-amount-input"
              data-testid="swap-amount-input"
              type="number"
              min="0"
              step="0.0001"
              value={amountInput}
              onChange={(event) => {
                setAmountInput(event.target.value);
                setError(null);
                setStatus(null);
              }}
              style={{ display: "block", marginTop: "0.25rem", width: "100%" }}
            />
            <small>
              可用余额：<span data-testid="vault-base-balance">{baseBalanceLabel}</span>{" "}
              / <span data-testid="vault-quote-balance">{quoteBalanceLabel}</span>
            </small>
          </div>
          <div style={{ marginBottom: "1rem" }}>
            <p data-testid="swap-impact">
              预估输出：
              {simulation
                ? `${formatUnits(
                    simulation.amountOut,
                    direction === "BASE_TO_QUOTE" ? context.quoteDecimals : context.baseDecimals,
                  )} ${
                    direction === "BASE_TO_QUOTE" ? context.quoteSymbol : context.baseSymbol
                  }（价格影响：${simulation.priceImpactBps / 100} bp）`
                : previewError ?? "--"}
            </p>
            <p data-testid="swap-gas-estimate">估算 Gas：{formatGasEstimate(simulation?.gasEstimate ?? 0n)}</p>
          </div>
          <button
            type="button"
            data-testid="swap-submit-button"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {isSubmitting ? "换仓中..." : "执行换仓"}
          </button>
          {status && (
            <p data-testid="swap-status" style={{ marginTop: "0.75rem", color: "#1b5e20" }}>
              {status}
            </p>
          )}
          {error && (
            <p data-testid="swap-error" style={{ marginTop: "0.75rem", color: "#c62828" }}>
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
