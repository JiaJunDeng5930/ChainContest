"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchParticipationHistory } from "../api/history";
import { useNetworkGateState } from "../../network/NetworkGate";

export default function useContestParticipationStatus(contestId: string) {
  const gate = useNetworkGateState();
  const enabled = Boolean(contestId) && gate.isSessionActive && Boolean(gate.address);

  const query = useQuery({
    queryKey: ["contest-participation", contestId, gate.address ?? null],
    queryFn: async () => fetchParticipationHistory({ contestId, pageSize: 1 }),
    enabled,
    select: (data) => Boolean(data?.items?.some((item) => item.contest.contestId === contestId && item.participations?.length))
  });

  return {
    isParticipant: enabled ? query.data ?? false : false,
    isLoading: query.isLoading,
    refetch: query.refetch
  };
}
