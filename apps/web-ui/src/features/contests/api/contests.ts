import { ContestPhase } from "@chaincontest/shared-i18n";

import { apiClient } from "../../../lib/api/client";

export type ContestTimeline = {
  registrationOpensAt: string;
  registrationClosesAt: string;
};

export type ContestValuationAnchor = {
  price: string;
  currency: string;
  observedAt: string;
};

export type ContestPrizeAsset = {
  symbol?: string;
  tokenAddress?: string;
  decimals?: number;
};

export type ContestPrizePool = {
  currentBalance: string;
  accumulatedInflow?: string;
  valuationAnchor?: ContestValuationAnchor | null;
  asset?: ContestPrizeAsset | null;
};

export type ContestRegistrationCapacity = {
  registered: number;
  maximum: number;
  isFull: boolean;
};

export type ContestLeaderboardEntry = {
  rank: number;
  walletAddress: string;
  score?: string | null;
};

export type ContestLeaderboard = {
  version: string;
  entries: ContestLeaderboardEntry[];
};

export type ContestDerivedAt = {
  blockNumber: number | string;
  blockHash?: string | null;
  timestamp: string;
};

export type ContestSnapshot = {
  contestId: string;
  chainId: number;
  phase: ContestPhase;
  timeline: ContestTimeline;
  prizePool: ContestPrizePool;
  registrationCapacity: ContestRegistrationCapacity;
  leaderboard?: ContestLeaderboard | null;
  derivedAt: ContestDerivedAt;
  contractAddress?: string | null;
  status?: string;
  originTag?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ContestListResponse = {
  items: ContestSnapshot[];
  nextCursor: string | null;
};

export type ContestListQuery = {
  chainId?: number;
  status?: ContestPhase;
  cursor?: string | null;
};

const PHASE_TO_BACKEND_STATUS: Record<ContestPhase, string> = {
  registration: "registered",
  active: "active",
  settled: "settled",
  closed: "sealed"
};

function buildContestListPath(query: ContestListQuery = {}): string {
  const searchParams = new URLSearchParams();

  if (typeof query.chainId === "number" && Number.isFinite(query.chainId)) {
    searchParams.set("chainId", String(query.chainId));
  }

  if (query.status) {
    const backendStatus = PHASE_TO_BACKEND_STATUS[query.status];
    if (backendStatus) {
      searchParams.set("status", backendStatus);
    }
  }

  if (query.cursor) {
    searchParams.set("cursor", query.cursor);
  }

  const queryString = searchParams.toString();
  return queryString ? `/api/contests?${queryString}` : "/api/contests";
}

export async function fetchContestList(query?: ContestListQuery): Promise<ContestListResponse> {
  return apiClient.get<ContestListResponse>(buildContestListPath(query));
}

export async function fetchContestSnapshot(contestId: string): Promise<ContestSnapshot> {
  if (!contestId) {
    throw new Error("contestId is required to fetch contest snapshot");
  }

  return apiClient.get<ContestSnapshot>(`/api/contests/${encodeURIComponent(contestId)}`);
}
