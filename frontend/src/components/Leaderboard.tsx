import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConfig } from "wagmi";
import { formatUnits } from "viem";
import useVaultPositionsStore from "../app/state/vaultPositions";
import useContestStore from "../app/state/contestStore";
import { fetchLeaders } from "../lib/contest/admin";

export default function Leaderboard(): JSX.Element {
  const wagmiConfig = useConfig();
  const vaultPositions = useVaultPositionsStore((state) => state.positions);
  const registrations = useContestStore((state) => state.registrations);

  const leadersQuery = useQuery({
    queryKey: ["contest-leaders"],
    queryFn: () => fetchLeaders(wagmiConfig),
    staleTime: 10_000,
  });

  const rows = useMemo(() => {
    if (!leadersQuery.data) {
      return [];
    }
    const positionByVault = new Map<string, { nav: bigint; roiBps: number }>();
    Object.values(vaultPositions).forEach((entry) => {
      positionByVault.set(entry.vault.toLowerCase(), {
        nav: entry.nav,
        roiBps: entry.roiBps,
      });
    });

    const registrationByParticipant = new Map<string, string>();
    registrations.forEach((record) => {
      registrationByParticipant.set(record.participant.toLowerCase(), record.participant);
    });

    return leadersQuery.data.map((item) => {
      const key = item.vault.toLowerCase();
      const position = positionByVault.get(key);
      const participant = registrationByParticipant.get(item.participant.toLowerCase()) ?? item.participant;
      return {
        vaultId: item.vaultId,
        participant,
        nav: position?.nav ?? item.nav,
        roiBps: position?.roiBps ?? item.roiBps,
        rank: item.rank,
      };
    });
  }, [leadersQuery.data, registrations, vaultPositions]);

  return (
    <section style={{ border: "1px solid #d0d7de", padding: "1.5rem", borderRadius: "0.75rem" }}>
      <header>
        <h2>排行榜 Top-K</h2>
      </header>
      {leadersQuery.isLoading ? (
        <p>正在加载排行榜...</p>
      ) : rows.length === 0 ? (
        <p>暂无排行榜数据</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", paddingBottom: "0.5rem" }}>排名</th>
              <th style={{ textAlign: "left", paddingBottom: "0.5rem" }}>参赛者</th>
              <th style={{ textAlign: "left", paddingBottom: "0.5rem" }}>NAV</th>
              <th style={{ textAlign: "left", paddingBottom: "0.5rem" }}>ROI (bps)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.vaultId} data-testid={`leaderboard-row-${index}`} style={{ borderTop: "1px solid #e1e4e8" }}>
                <td style={{ padding: "0.5rem 0" }}>{row.rank}</td>
                <td style={{ padding: "0.5rem 0" }}>{`${row.participant.slice(0, 6)}...${row.participant.slice(-4)}`}</td>
                <td style={{ padding: "0.5rem 0" }}>{formatUnits(row.nav, 6)}</td>
                <td style={{ padding: "0.5rem 0" }}>{row.roiBps}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
