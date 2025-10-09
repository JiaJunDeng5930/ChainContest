import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { useAccount, useConfig } from "wagmi";
import type { Address, Hex } from "viem";
import useContestStore, { hydrateRegistrations, subscribeRegistrations } from "../app/state/contestStore";
import {
  ContestState,
  approveEntryToken,
  contestStateLabel,
  fetchContestOverview,
  getEntryAllowance,
  registerForContest,
} from "../lib/contest/register";

const shortenAddress = (value: Address): string =>
  `${value.slice(0, 6)}...${value.slice(value.length - 4)}`;

export default function RegisterCard(): JSX.Element {
  const wagmiConfig = useConfig();
  const { address, isConnected } = useAccount();
  const [error, setError] = useState<string | null>(null);
  const [approveHash, setApproveHash] = useState<Hex | null>(null);
  const [registerHash, setRegisterHash] = useState<Hex | null>(null);
  const [allowance, setAllowance] = useState<bigint>(0n);
  const [isApproving, setIsApproving] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const subscriptionRef = useRef<(() => void) | null>(null);

  const registrations = useContestStore((state) => state.registrations);
  const upsertRegistration = useContestStore((state) => state.upsert);

  const overviewQuery = useQuery({
    queryKey: ["contest-overview"],
    queryFn: () => fetchContestOverview(wagmiConfig),
    staleTime: 15_000,
  });

  const overview = overviewQuery.data;

  const entryAmountLabel = useMemo(() => {
    if (!overview) {
      return "--";
    }
    return formatUnits(overview.entryAmount, overview.entryDecimals);
  }, [overview]);

  useEffect(() => {
    let cancelled = false;
    hydrateRegistrations(wagmiConfig)
      .catch((err: unknown) => {
        if (!cancelled) {
          setError((err as Error).message);
        }
      })
      .finally(() => {
        if (!cancelled && !subscriptionRef.current) {
          subscriptionRef.current = subscribeRegistrations(wagmiConfig);
        }
      });

    return () => {
      cancelled = true;
      if (subscriptionRef.current) {
        subscriptionRef.current();
        subscriptionRef.current = null;
      }
    };
  }, [wagmiConfig]);

  useEffect(() => {
    if (!address || !overview) {
      setAllowance(0n);
      return;
    }

    let cancelled = false;
    getEntryAllowance(wagmiConfig, address, overview.entryAsset)
      .then((value) => {
        if (!cancelled) {
          setAllowance(value);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError((err as Error).message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [address, overview?.entryAsset, wagmiConfig]);

  const handleApprove = async () => {
    if (!address || !overview) {
      return;
    }
    setIsApproving(true);
    setError(null);
    try {
      const hash = await approveEntryToken(wagmiConfig, address, overview.entryAsset, overview.entryAmount);
      setApproveHash(hash);
      const updated = await getEntryAllowance(wagmiConfig, address, overview.entryAsset);
      setAllowance(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsApproving(false);
    }
  };

  const handleRegister = async () => {
    if (!address || !overview) {
      return;
    }
    if (allowance < overview.entryAmount) {
      setError("请先完成 USDC 授权");
      return;
    }
    setIsRegistering(true);
    setError(null);
    try {
      const result = await registerForContest(wagmiConfig, address);
      setRegisterHash(result.txHash);
      await overviewQuery.refetch();
      upsertRegistration({
        participant: address as Address,
        vault: result.vault,
        amount: result.amount,
        txHash: result.txHash,
      });
      await hydrateRegistrations(wagmiConfig, { force: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsRegistering(false);
    }
  };

  const authorizationComplete = overview ? allowance >= overview.entryAmount : false;
  const canRegister =
    Boolean(overview) &&
    overview?.state === ContestState.Registering &&
    authorizationComplete &&
    isConnected &&
    !isRegistering;

  return (
    <section style={{ border: "1px solid #d0d7de", padding: "1.5rem", borderRadius: "0.75rem" }}>
      <header>
        <h2>报名与托管</h2>
      </header>
      {overviewQuery.isLoading ? (
        <p data-testid="register-loading">正在加载比赛配置...</p>
      ) : overview ? (
        <>
          <p>
            当前状态：
            <strong>{contestStateLabel[overview.state]}</strong>
          </p>
          <p>
            报名本金：
            <strong>
              {entryAmountLabel} {overview.entrySymbol}
            </strong>
          </p>
          <p>
            已报名人数：
            <strong>
              {Number(overview.participantCount)} / {overview.maxParticipants}
            </strong>
          </p>
          <p data-testid="approve-status">
            授权状态：{authorizationComplete ? "已完成" : "未完成"}
            {approveHash ? `（交易 ${approveHash.slice(0, 10)}...）` : ""}
          </p>
          <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
            <button
              type="button"
              data-testid="approve-button"
              onClick={handleApprove}
              disabled={!isConnected || authorizationComplete || isApproving}
            >
              {isApproving ? "授权中..." : "授权 USDC"}
            </button>
            <button
              type="button"
              data-testid="register-button"
              onClick={handleRegister}
              disabled={!canRegister}
            >
              {isRegistering ? "报名中..." : "报名参赛"}
            </button>
          </div>
          {registerHash && (
            <p data-testid="register-status" style={{ marginTop: "0.75rem" }}>
              报名交易已提交：{registerHash.slice(0, 10)}...
            </p>
          )}
        </>
      ) : (
        <p data-testid="register-error">无法加载比赛配置</p>
      )}
      {error && (
        <p data-testid="register-error" style={{ color: "#c62828", marginTop: "0.75rem" }}>
          错误：{error}
        </p>
      )}
      <section style={{ marginTop: "1.5rem" }}>
        <header>
          <h3>报名事件</h3>
        </header>
        <ul data-testid="participants-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {registrations.length === 0 ? (
            <li>暂无报名记录</li>
          ) : (
            registrations.map((item) => (
              <li
                key={item.participant}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "0.5rem 0",
                  borderBottom: "1px solid #eee",
                }}
              >
                <span>{shortenAddress(item.participant)}</span>
                <span>{shortenAddress(item.vault)}</span>
              </li>
            ))
          )}
        </ul>
      </section>
    </section>
  );
}
