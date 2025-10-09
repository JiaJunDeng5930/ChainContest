import { useState, useMemo } from "react";
import { useAccount, useConfig } from "wagmi";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { claimReward, exitContest, fetchTotalPrizePool } from "../lib/contest/payout";
import { fetchLeaders } from "../lib/contest/admin";
import { hydrateVaultPositions } from "../app/state/vaultPositions";

export default function PayoutPanel(): JSX.Element {
  const { address, isConnected } = useAccount();
  const wagmiConfig = useConfig();
  const queryClient = useQueryClient();
  const [claimStatus, setClaimStatus] = useState<string>("");
  const [exitStatus, setExitStatus] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);

  const leadersQuery = useQuery({
    queryKey: ["contest-leaders"],
    queryFn: () => fetchLeaders(wagmiConfig),
    staleTime: 10_000,
  });

  const totalPrizePoolQuery = useQuery({
    queryKey: ["contest-total-prize"],
    queryFn: () => fetchTotalPrizePool(wagmiConfig),
    staleTime: 10_000,
  });

  const isWinner = useMemo(() => {
    if (!address || !leadersQuery.data) {
      return false;
    }
    return leadersQuery.data.some((leader) => leader.participant.toLowerCase() === address.toLowerCase());
  }, [address, leadersQuery.data]);

  const handleClaim = async () => {
    if (!address) {
      setClaimStatus("请先连接钱包");
      return;
    }
    setIsProcessing(true);
    setClaimStatus("正在申请领奖...");
    try {
      await claimReward(wagmiConfig);
      await hydrateVaultPositions(wagmiConfig);
      await queryClient.invalidateQueries({ queryKey: ["contest-leaders"] });
      await queryClient.invalidateQueries({ queryKey: ["contest-total-prize"] });
      await queryClient.invalidateQueries({ queryKey: ["contest-prize-pool"] });
      setClaimStatus("领奖完成");
    } catch (error) {
      setClaimStatus((error as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExit = async () => {
    if (!address) {
      setExitStatus("请先连接钱包");
      return;
    }
    setIsProcessing(true);
    setExitStatus("正在退出...");
    try {
      await exitContest(wagmiConfig);
      await hydrateVaultPositions(wagmiConfig);
      await queryClient.invalidateQueries({ queryKey: ["contest-leaders"] });
      await queryClient.invalidateQueries({ queryKey: ["contest-total-prize"] });
      await queryClient.invalidateQueries({ queryKey: ["contest-prize-pool"] });
      setExitStatus("退出完成");
    } catch (error) {
      setExitStatus((error as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <section style={{ border: "1px solid #d0d7de", padding: "1.5rem", borderRadius: "0.75rem" }}>
      <header>
        <h2>领奖与退出</h2>
      </header>
      {!isConnected ? (
        <p>请先连接钱包以进行领奖或退出操作。</p>
      ) : (
        <>
          <p>
            当前身份：
            <strong>{`${address?.slice(0, 6)}...${address?.slice(-4)}`}</strong>
          </p>
          <p>
            总奖池：<span>{totalPrizePoolQuery.data?.toString() ?? "--"}</span>
          </p>
          <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
            <button
              type="button"
              data-testid="claim-button"
              onClick={handleClaim}
              disabled={isProcessing || !isWinner}
            >
              领奖
            </button>
            <button
              type="button"
              data-testid="exit-button"
              onClick={handleExit}
              disabled={isProcessing || isWinner}
            >
              退出领取本金
            </button>
          </div>
          <p data-testid="claim-status" style={{ marginTop: "0.75rem" }}>
            {claimStatus || (isWinner ? "如为获胜者请点击领奖" : "非获胜者无领奖资格")}
          </p>
          <p data-testid="exit-status" style={{ marginTop: "0.5rem" }}>
            {exitStatus || "如未上榜可点击退出"}
          </p>
        </>
      )}
    </section>
  );
}
