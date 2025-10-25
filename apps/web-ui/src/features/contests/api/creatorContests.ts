import { apiClient } from "../../../lib/api/client";
import type {
  ContestCreationArtifact,
  ContestCreationRequestSummary
} from "./createContest";

export type CreatorContestRecord = {
  status: string;
  request: ContestCreationRequestSummary;
  artifact: ContestCreationArtifact | null;
  contest: CreatorContestSummary | null;
};

export type CreatorContestSummary = {
  contestId: string;
  chainId: number;
  contractAddress: string;
  status: string;
  originTag: string | null;
  timeWindowStart: string;
  timeWindowEnd: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CreatorContestListResponse = {
  kind: "created";
  items: CreatorContestRecord[];
  nextCursor: string | null;
};

export type CreatorContestListQuery = {
  networkId?: number;
  pageSize?: number;
  cursor?: string | null;
};

function buildCreatorContestsPath(query: CreatorContestListQuery = {}): string {
  const searchParams = new URLSearchParams({ kind: "created" });

  if (typeof query.networkId === "number" && Number.isFinite(query.networkId)) {
    searchParams.set("networkId", String(query.networkId));
  }

  if (typeof query.pageSize === "number" && Number.isFinite(query.pageSize)) {
    searchParams.set("pageSize", String(query.pageSize));
  }

  if (query.cursor) {
    searchParams.set("cursor", query.cursor);
  }

  return `/api/me/contests?${searchParams.toString()}`;
}

export async function fetchCreatorContests(
  query?: CreatorContestListQuery
): Promise<CreatorContestListResponse> {
  return apiClient.get<CreatorContestListResponse>(buildCreatorContestsPath(query));
}
