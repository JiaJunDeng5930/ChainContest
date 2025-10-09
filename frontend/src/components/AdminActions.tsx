import { useState, useMemo } from "react";
import { useConfig } from "wagmi";
import type { Address } from "viem";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import useVaultPositionsStore from "../app/state/vaultPositions";
import useContestStore from "../app/state/contestStore";
import {
  freezeContest,
  settleParticipant,
  updateLeadersOnChain,
  sealContest,
  fetchPrizePool,
  type LeaderboardUpdateInput,
} from "../lib/contest/admin";
import { fetchContestOverview } from "../lib/contest/register";
import { hydrateVaultPositions, refreshVaultPosition } from "../app/state/vaultPositions";

const STATUS_IDLE = "";

export default function AdminActions(): JSX.Element {
  const wagmiConfig = useConfig();
  const queryClient = useQueryClient();
  const positions = useVaultPositionsStore((state) => state.positions);
  const registrations = useContestStore((state) => state.registrations);

  const [settleAddress, setSettleAddress] = useState("");
  const [status, setStatus] = useState<string>(STATUS_IDLE);
  const [isLoading, setIsLoading] = useState(false);
  const prizePoolQuery = useQuery({
    queryKey: ["contest-prize-pool"],
    queryFn: () => fetchPrizePool(wagmiConfig),
    staleTime: 5_000,
  });

  const topK = useMemo(() => {
    const overview = queryClient.getQueryData<{ topK: number } & Partial<unknown>>(["contest-overview"]);
    return overview?.topK ?? 0;
  }, [queryClient]);

  const handleFreeze = async () => {
    setIsLoading(true);
    setStatus("正在冻结...");
    try {
      await freezeContest(wagmiConfig);
      setStatus("冻结完成");
      await queryClient.invalidateQueries({ queryKey: ["contest-prize-pool"] });
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSettle = async () => {
    if (!settleAddress) {
      setStatus("请输入需要结算的参赛者地址");
      return;
    }
    setIsLoading(true);
    setStatus("正在结算...");
    try {
      const participant = settleAddress as Address;
      await settleParticipant(wagmiConfig, participant);
      await refreshVaultPosition(wagmiConfig, participant);
      setStatus("结算成功");
      setSettleAddress("");
      await queryClient.invalidateQueries({ queryKey: ["contest-prize-pool"] });
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateLeaders = async () => {
    setIsLoading(true);
    setStatus("正在更新排行榜...");
    try {
      const overview =
        queryClient.getQueryData<Awaited<ReturnType<typeof fetchContestOverview>>>(["contest-overview"]) ??
        (await queryClient.fetchQuery({ queryKey: ["contest-overview"], queryFn: () => fetchContestOverview(wagmiConfig) }));
      const limit = overview?.topK ?? 0;
      if (limit === 0) {
        throw new Error("排行榜 Top-K 未配置");
      }

      const entries = Object.values(positions)
        .slice()
        .sort((a, b) => Number(b.nav - a.nav))
        .slice(0, limit);

      const updates: LeaderboardUpdateInput[] = entries.map((entry) => ({
        vaultId: entry.vaultId,
        nav: entry.nav,
        roiBps: entry.roiBps,
      }));

      await updateLeadersOnChain(wagmiConfig, updates);
      setStatus("榜单已更新");
      await queryClient.invalidateQueries({ queryKey: ["contest-prize-pool"] });
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSeal = async () => {
    setIsLoading(true);
    setStatus("正在封榜...");
    try {
      await sealContest(wagmiConfig);
      setStatus("封榜完成");
      await queryClient.invalidateQueries({ queryKey: ["contest-prize-pool"] });
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshPositions = async () => {
    setIsLoading(true);
    try {
      await hydrateVaultPositions(wagmiConfig);
      setStatus("已刷新头寸数据");
      await queryClient.invalidateQueries({ queryKey: ["contest-prize-pool"] });
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const participantsCount = registrations.length;

  return (
    <section style={{ border: "1px solid #d0d7de", padding: "1.5rem", borderRadius: "0.75rem" }}>
      <header>
        <h2>管理员操作</h2>
      </header>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1rem" }}>
        <button
          type="button"
          data-testid="action-freeze"
          onClick={handleFreeze}
          disabled={isLoading}
        >
          冻结比赛
        </button>
        <div>
          <label htmlFor="settle-address">结算参赛者地址</label>
          <input
            id="settle-address"
            data-testid="action-settle-address"
            type="text"
            value={settleAddress}
            onChange={(event) => setSettleAddress(event.target.value)}
            style={{ width: "100%", marginTop: "0.25rem" }}
          />
          <button
            type="button"
            data-testid="action-settle-submit"
            onClick={handleSettle}
            disabled={isLoading || !settleAddress}
            style={{ marginTop: "0.5rem" }}
          >
            结算参赛者
          </button>
        </div>
        <button
          type="button"
          data-testid="action-update-leaders"
          onClick={handleUpdateLeaders}
          disabled={isLoading || participantsCount === 0}
        >
          更新排行榜
        </button>
        <button type="button" onClick={handleRefreshPositions} disabled={isLoading}>
          刷新头寸缓存
        </button>
        <button type="button" data-testid="action-seal" onClick={handleSeal} disabled={isLoading}>
          封榜
        </button>
      </div>
      <p data-testid="action-status" style={{ marginTop: "0.75rem" }}>
        {status || "状态：待命"}
      </p>
      <p style={{ marginTop: "0.5rem" }}>
        当前奖池剩余：
        <span data-testid="prize-pool-amount">{prizePool.toString()}</span>
      </p>
    </section>
  );
}
